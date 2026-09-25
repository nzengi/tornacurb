"use client";

// Browser trade actions over an Actor abstraction: the actor is either a connected wallet
// (adapter sendTransaction) or a pre-funded demo identity (local Keypair). Each builds an
// instruction via the orderbook client, signs, sends + confirms, and returns the tx signature.
//
// Every action takes the LiveMarket it applies to — the venue lists eight of them and nothing here
// may assume a "current" one. Trees, vaults and mints all come off that market.
import "./polyfill";
import { Keypair, PublicKey, Transaction, type Connection } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { keys } from "torna-sdk";
import { ASK, cancelIx, matchIx, placeIx, placeColdIx, type Side } from "./orderbook";
import {
  VENUE, askTree, bidTree, connection, marketIdOf, orderbookProgram, reader, tornaProgram,
  type LiveMarket,
} from "./venue";

const N_KEY_COUNT = 2;
const rdU16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(o, true);

export interface Actor {
  publicKey: PublicKey;
  send: (tx: Transaction) => Promise<string>;
}

/** Confirm by polling signature status, not by websocket subscription.
 *
 *  The browser talks to the chain through our own /api/rpc proxy, which is HTTP only — there is no
 *  websocket behind it. web3.js derives a ws endpoint from the RPC url and, when the subscription
 *  never establishes, its confirmation path reports "block height exceeded" for transactions that
 *  in fact landed. Telling a trader their order failed when it is resting on the book is worse than
 *  telling them nothing, so confirmation is done the boring way: ask for the status until it is
 *  confirmed, the transaction actually errors, or the blockhash genuinely expires. */
async function confirmByPolling(conn: Connection, sig: string, lastValidBlockHeight: number): Promise<string> {
  for (;;) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.err) throw new Error(`transaction failed on chain: ${JSON.stringify(st.err)}`);
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return sig;
    if ((await conn.getBlockHeight("confirmed")) > lastValidBlockHeight) {
      // genuinely expired: one last look, because it can land in the same breath
      const final = (await conn.getSignatureStatuses([sig])).value[0];
      if (final?.confirmationStatus) return sig;
      throw new Error("transaction expired before it was confirmed; please retry");
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

async function signSendConfirm(conn: Connection, tx: Transaction, payer: PublicKey, sign: (t: Transaction) => Promise<Transaction> | Transaction): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  const signed = await sign(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
  return confirmByPolling(conn, sig, lastValidBlockHeight);
}

/** A pre-funded demo identity that signs locally. */
export function keypairActor(kp: Keypair): Actor {
  return {
    publicKey: kp.publicKey,
    send: (tx) => signSendConfirm(connection(), tx, kp.publicKey, (t) => { t.sign(kp); return t; }),
  };
}

/** A connected wallet (wallet-adapter sendTransaction + confirm). */
export function walletActor(
  publicKey: PublicKey,
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Actor {
  return {
    publicKey,
    send: async (tx) => {
      const conn = connection();
      // The wallet adapter signs and sends; confirmation is polled for the same reason as above —
      // there is no websocket behind /api/rpc, and a false failure on a landed order is the worst
      // thing this screen can say.
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      const sig = await sendTransaction(tx, conn);
      return confirmByPolling(conn, sig, lastValidBlockHeight);
    },
  };
}

const ata = (mint: string, owner: PublicKey) => getAssociatedTokenAddressSync(new PublicKey(mint), owner, true);

/** On the ask side you escrow shares; on the bid side you escrow cash. */
const payMintOf = (m: LiveMarket, side: Side) => (side === ASK ? m.baseMint : VENUE.quoteMint);
const vaultOf = (m: LiveMarket, side: Side) => new PublicKey(side === ASK ? m.baseVault : m.quoteVault);
const treeOf = (m: LiveMarket, side: Side) => (side === ASK ? askTree(m) : bidTree(m));

export async function place(actor: Actor, m: LiveMarket, side: Side, price: bigint, size: bigint): Promise<string> {
  const tree = treeOf(m, side);
  const makerSrc = ata(payMintOf(m, side), actor.publicKey);
  const r = reader();
  const nonce = BigInt(Date.now());
  // the program stamps the landed slot into the key; plan the path from the current one so it routes
  const slot = BigInt(await connection().getSlot("confirmed"));
  const args = {
    reader: r, tree, orderbook: orderbookProgram(), torna: tornaProgram(), marketId: marketIdOf(m),
    side, price, size, nonce, slot, maker: actor.publicKey, makerSrc, vault: vaultOf(m, side),
  };

  // Route to the cold split path when the target leaf is full (or the tree is empty), so a place
  // never fails with ERR_NEED_SPLIT_SLOT (0x66). The split grows the tree, so subsequent places at
  // that depth go hot again; the book self-heals.
  const h = await tree.header(r);
  if (!h) throw new Error(`${m.symbol}: market tree not initialized`);
  let cold = h.height === 0;
  if (!cold) {
    const key = keys.orderKey(side === ASK ? keys.Side.Ask : keys.Side.Bid, price, slot, actor.publicKey, nonce);
    const path = await tree.path(r, key);
    if (path && path.length) {
      const d = await r.accountData(tree.nodePda(path[path.length - 1])[0]);
      if (d && rdU16(d, N_KEY_COUNT) >= h.fanout) cold = true;
    }
  }

  if (cold) {
    const rentNode = BigInt(await connection().getMinimumBalanceForRentExemption(h.nodeSize));
    const built = await placeColdIx({ ...args, rentNode });
    if (!built) throw new Error("could not resolve the cold place plan; please retry");
    return actor.send(new Transaction().add(built.ix));
  }
  const { ix } = await placeIx(args);
  return actor.send(new Transaction().add(ix));
}

export async function cancel(actor: Actor, m: LiveMarket, side: Side, keyHex: string): Promise<string> {
  const ix = await cancelIx({
    reader: reader(), tree: treeOf(m, side), orderbook: orderbookProgram(), torna: tornaProgram(),
    marketId: marketIdOf(m), side, key: Uint8Array.from(Buffer.from(keyHex, "hex")),
    maker: actor.publicKey, vault: vaultOf(m, side), makerDst: ata(payMintOf(m, side), actor.publicKey),
  });
  return actor.send(new Transaction().add(ix));
}

export async function take(
  actor: Actor, m: LiveMarket, bookSide: Side, limit: bigint, size: bigint,
): Promise<{ sig: string; fills: number } | null> {
  // hitting the ASK book buys shares with cash; hitting the BID book sells shares for cash
  const recvMint = bookSide === ASK ? m.baseMint : VENUE.quoteMint;
  const payMint = bookSide === ASK ? VENUE.quoteMint : m.baseMint;
  const built = await matchIx({
    reader: reader(), tree: treeOf(m, bookSide), orderbook: orderbookProgram(), torna: tornaProgram(),
    marketId: marketIdOf(m), bookSide, limit, size, maxFills: 8, taker: actor.publicKey,
    vault: vaultOf(m, bookSide),
    takerRecv: ata(recvMint, actor.publicKey), takerPay: ata(payMint, actor.publicKey),
    payMint: new PublicKey(payMint),
  });
  if (!built) return null;
  // the taker receives into their token account for recvMint, which a wallet that has never held
  // this listing does not have yet: open it in the same transaction (a no-op when it exists)
  const openRecv = createAssociatedTokenAccountIdempotentInstruction(
    actor.publicKey, ata(recvMint, actor.publicKey), actor.publicKey, new PublicKey(recvMint));
  const sig = await actor.send(new Transaction().add(openRecv, built.ix));
  return { sig, fills: built.fills.length };
}

/** Request mock USDC + fee SOL from the faucet for a connected wallet. */
export async function requestFaucet(pubkey: PublicKey): Promise<{ sig?: string; alreadyFunded?: boolean }> {
  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pubkey: pubkey.toBase58() }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? "faucet failed");
  return j;
}
