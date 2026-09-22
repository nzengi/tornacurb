// TornaCurb market maker — keeps every book quoting, and occasionally trades against itself.
//
// Why this exists: a book that never moves reads as a screenshot, however real the chain underneath
// is. This walks each listing's mid, re-quotes around it, and prints the odd trade, so a visitor
// who opens the venue sees a market rather than a fixture.
//
// It also makes the parallelism claim honest rather than theoretical: the quotes on each side are
// spread across the four demo identities at different price levels, which is exactly the case Torna
// is built for — different leaves, same slot.
//
// Run from demo/:
//   npx tsx scripts/market-maker.ts                 # loop forever, one market per tick
//   ONCE=1 npx tsx scripts/market-maker.ts          # single pass over all markets, then exit
//   TICK_MS=8000 SYMBOLS=OPENAI,NVDA npx tsx scripts/market-maker.ts
//
// Devnet public RPC rate-limits hard, so this deliberately works ONE market per tick rather than
// fanning out. Point RPC at a dedicated endpoint to tighten TICK_MS.
import "../src/lib/polyfill";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Tree, keys, type AccountReader } from "torna-sdk";
import { ASK, BID, cancelIx, matchIx, placeIx, placeColdIx, type Side } from "../src/lib/orderbook";
import { LISTINGS, openingMid, type Listing } from "../src/lib/listings";

const V = JSON.parse(readFileSync(join(import.meta.dirname, "../src/lib/venue.json"), "utf8"));
const conn = new Connection(process.env.RPC ?? V.rpcUrl, "confirmed");
const TORNA = new PublicKey(V.tornaProgramId);
const ORDERBOOK = new PublicKey(V.orderbookProgramId);
const CREATOR = new PublicKey(V.creator);
const QUOTE_MINT: string = V.quoteMint;

const TICK_MS = Number(process.env.TICK_MS ?? 12_000);
const ONCE = !!process.env.ONCE;
const ONLY = (process.env.SYMBOLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const LEVELS = 3;              // price levels quoted per side
const DRIFT = 0.006;           // per-tick random walk, fraction of mid
const MAX_DEV = 0.12;          // never wander more than this from the listing's opening mid
const TRADE_EVERY = 3;         // print a trade roughly every N ticks per market
const PRUNE_MAX = Number(process.env.PRUNE_MAX ?? 6); // cancels per side per tick; must exceed LEVELS or the book only grows
const N_KEY_COUNT = 2;

const reader: AccountReader = {
  async accountData(k: PublicKey) { const a = await conn.getAccountInfo(k, "confirmed"); return a ? Uint8Array.from(a.data) : null; },
};
const rdU16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(o, true);
const demos: Keypair[] = V.demos.map((d: { secret: number[] }) => Keypair.fromSecretKey(Uint8Array.from(d.secret)));
const ata = (mint: string, owner: PublicKey) => getAssociatedTokenAddressSync(new PublicKey(mint), owner, true);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Devnet hands back "Blockhash not found" and 429s under load. Those are transient, so a quote is
// retried rather than dropped — a maker that silently skips half its levels leaves a lopsided book,
// which looks worse than a slow one. Genuinely bad instructions still fail, just later.
async function send(tx: Transaction, signers: Keypair[], attempts = 3): Promise<string> {
  let wait = 700;
  for (let i = 1; ; i++) {
    try {
      const fresh = new Transaction().add(...tx.instructions);
      return await sendAndConfirmTransaction(conn, fresh, signers, { commitment: "confirmed" });
    } catch (e) {
      if (i >= attempts) throw e;
      await sleep(wait);
      wait *= 2;
    }
  }
}

interface Market extends Listing {
  marketId: number; askTreeId: number; bidTreeId: number;
  baseMint: string; baseVault: string; quoteVault: string;
}
const markets: Market[] = LISTINGS.flatMap((l) => {
  const s = V.markets[l.symbol];
  if (!s) return [];
  if (ONLY.length && !ONLY.includes(l.symbol)) return [];
  return [{ ...l, ...s } as Market];
});

const treeOf = (m: Market, side: Side) => new Tree(TORNA, CREATOR, side === ASK ? m.askTreeId : m.bidTreeId);
const vaultOf = (m: Market, side: Side) => new PublicKey(side === ASK ? m.baseVault : m.quoteVault);
const payMintOf = (m: Market, side: Side) => (side === ASK ? m.baseMint : QUOTE_MINT);

interface Row { price: bigint; size: bigint; maker: string; key: Uint8Array }
async function readSide(m: Market, side: Side): Promise<Row[]> {
  const rows = await treeOf(m, side).scan(reader, 48);
  const sd = side === ASK ? keys.Side.Ask : keys.Side.Bid;
  return rows
    .map((e) => {
      const dv = new DataView(e.value.buffer, e.value.byteOffset, e.value.byteLength);
      return { price: keys.priceOf(sd, e.key), size: dv.getBigUint64(32, false), maker: new PublicKey(e.value.subarray(0, 32)).toBase58(), key: e.key };
    })
    .filter((o) => o.size > 0n);
}

/** Place, routing to the cold split path when the target leaf is full — mirrors the UI's place(). */
async function place(m: Market, maker: Keypair, side: Side, price: bigint, size: bigint): Promise<string> {
  const tree = treeOf(m, side);
  const nonce = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1000));
  const args = {
    reader, tree, orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(m.marketId),
    side, price, size, nonce, maker: maker.publicKey,
    makerSrc: ata(payMintOf(m, side), maker.publicKey), vault: vaultOf(m, side),
  };
  const h = await tree.header(reader);
  if (!h) throw new Error(`${m.symbol}: tree not initialized`);
  let cold = h.height === 0;
  if (!cold) {
    const key = keys.orderKey(side === ASK ? keys.Side.Ask : keys.Side.Bid, price, 0n, maker.publicKey, nonce);
    const path = await tree.path(reader, key);
    if (path?.length) {
      const d = await reader.accountData(tree.nodePda(path[path.length - 1])[0]);
      if (d && rdU16(d, N_KEY_COUNT) >= h.fanout) cold = true;
    }
  }
  const ix = cold
    ? (await placeColdIx({ ...args, rentNode: BigInt(await conn.getMinimumBalanceForRentExemption(h.nodeSize)) }))?.ix
    : (await placeIx(args)).ix;
  if (!ix) throw new Error("could not build place");
  return send(new Transaction().add(ix), [maker]);
}

async function cancel(m: Market, maker: Keypair, side: Side, key: Uint8Array): Promise<string> {
  const ix = await cancelIx({
    reader, tree: treeOf(m, side), orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(m.marketId),
    side, key, maker: maker.publicKey, vault: vaultOf(m, side),
    makerDst: ata(payMintOf(m, side), maker.publicKey),
  });
  return send(new Transaction().add(ix), [maker]);
}

/** Cross the spread for a small size so Recent Trades has something in it. */
async function trade(m: Market, taker: Keypair, bookSide: Side, limit: bigint, size: bigint): Promise<number> {
  const recvMint = bookSide === ASK ? m.baseMint : QUOTE_MINT;
  const payMint = bookSide === ASK ? QUOTE_MINT : m.baseMint;
  const built = await matchIx({
    reader, tree: treeOf(m, bookSide), orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(m.marketId),
    bookSide, limit, size, maxFills: 4, taker: taker.publicKey, vault: vaultOf(m, bookSide),
    takerRecv: ata(recvMint, taker.publicKey), takerPay: ata(payMint, taker.publicKey),
    payMint: new PublicKey(payMint),
  });
  if (!built) return 0;
  await send(new Transaction().add(built.ix), [taker]);
  return built.fills.length;
}

const mids = new Map<string, number>();
const ticks = new Map<string, number>();

async function step(m: Market) {
  const n = (ticks.get(m.symbol) ?? 0) + 1;
  ticks.set(m.symbol, n);

  // random walk the mid, clamped so a long run can't drift a listing somewhere absurd
  // see the note in /api/mm: outside the band we snap to the anchor rather than clamp to its edge
  const anchor = openingMid(m);
  const prev = mids.get(m.symbol) ?? anchor;
  const base = Math.abs(prev - anchor) / anchor <= MAX_DEV ? prev : anchor;
  const moved = base * (1 + (Math.random() * 2 - 1) * DRIFT);
  const mid = Math.min(anchor * (1 + MAX_DEV), Math.max(anchor * (1 - MAX_DEV), moved));
  mids.set(m.symbol, mid);
  // log AFTER the walk: the number printed must be the number quoted against
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${m.symbol} tick ${n}, mid ${mid.toFixed(2)}`);

  let [asks, bids] = await Promise.all([readSide(m, ASK), readSide(m, BID)]);
  const ours = new Set(demos.map((d) => d.publicKey.toBase58()));

  // 1) UNCROSS. place does not auto-match — matching is its own instruction — so a bid and an ask
  // can rest at the same price. A real venue never shows that, and an arbitrageur would not leave
  // it there, so clear it the way one would: take the crossing size.
  for (let guard = 0; guard < 3 && bids[0] && asks[0] && bids[0].price >= asks[0].price; guard++) {
    const top = asks[0];
    const taker = demos.find((d) => d.publicKey.toBase58() !== top.maker) ?? demos[0];
    const size = top.size < bids[0].size ? top.size : bids[0].size;
    try {
      const fills = await trade(m, taker, ASK, top.price, size);
      console.log(`  ${m.symbol} uncrossed ${size} @ ${top.price} (${fills} fill)`);
    } catch (e) { console.log(`  ${m.symbol} uncross failed: ${(e as Error).message.slice(0, 70)}`); break; }
    [asks, bids] = await Promise.all([readSide(m, ASK), readSide(m, BID)]);
  }

  // 2) a trade now and then, so Recent Trades is not empty
  if (n % TRADE_EVERY === 0) {
    const bookSide: Side = Math.random() < 0.5 ? ASK : BID;
    const top = (bookSide === ASK ? asks : bids)[0];
    if (top) {
      const taker = demos.find((d) => d.publicKey.toBase58() !== top.maker) ?? demos[0];
      const size = top.size > 2n ? 2n : 1n;
      try {
        const fills = await trade(m, taker, bookSide, top.price, size);
        if (fills) console.log(`  ${m.symbol} traded ${size} @ ${top.price} (${fills} fill)`);
        [asks, bids] = await Promise.all([readSide(m, ASK), readSide(m, BID)]);
      } catch (e) { console.log(`  ${m.symbol} trade skipped: ${(e as Error).message.slice(0, 70)}`); }
    }
  }

  // 3) PRUNE. Keep only the LEVELS quotes closest to the mid on each side and cancel the rest.
  // Without this the tree grows every tick: the book becomes an unreadable wall, and the makers
  // slowly pay their SOL away in node rent on cold splits.
  for (const [rows, side] of [[asks, ASK], [bids, BID]] as [Row[], Side][]) {
    const mineHere = rows.filter((o) => ours.has(o.maker))
      .sort((a, b) => Math.abs(Number(a.price) - mid) - Math.abs(Number(b.price) - mid));
    for (const o of mineHere.slice(LEVELS).slice(0, PRUNE_MAX)) {
      const maker = demos.find((d) => d.publicKey.toBase58() === o.maker)!;
      try {
        await cancel(m, maker, side, o.key);
        console.log(`  ${m.symbol} cancelled ${side === ASK ? "ask" : "bid"} @ ${o.price}`);
      } catch (e) { console.log(`  ${m.symbol} cancel skipped: ${(e as Error).message.slice(0, 70)}`); }
    }
  }

  // 4) RE-QUOTE, clamped so a new quote never crosses what is already resting. Level i uses demo i,
  // so adjacent levels are different makers writing different leaves — the parallel-commit case.
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  for (let i = 0; i < LEVELS; i++) {
    const off = 0.004 + i * 0.006;
    for (const side of [ASK, BID] as Side[]) {
      let price = BigInt(Math.max(1, Math.round(side === ASK ? mid * (1 + off) : mid * (1 - off))));
      if (side === ASK && bestBid !== undefined && price <= bestBid) price = bestBid + 1n;
      if (side === BID && bestAsk !== undefined && price >= bestAsk) price = bestAsk - 1n;
      if (price <= 0n) continue;
      const size = BigInt(25 + Math.floor(Math.random() * 45));
      const maker = demos[(i + (side === ASK ? 0 : 1)) % demos.length];
      try {
        await place(m, maker, side, price, size);
        console.log(`  ${m.symbol} ${side === ASK ? "ask" : "bid"} ${size}@${price}`);
      } catch (e) { console.log(`  ${m.symbol} place skipped: ${(e as Error).message.slice(0, 70)}`); }
    }
  }
}

async function main() {
  if (!markets.length) throw new Error("no provisioned markets matched — run bringup-venue.ts first");
  console.log(`market maker over ${markets.length} listing(s): ${markets.map((m) => m.symbol).join(", ")}`);
  console.log(`tick ${TICK_MS}ms, ${ONCE ? "single pass" : "looping"}\n`);

  let i = 0;
  for (;;) {
    const m = markets[i % markets.length];
    try { await step(m); } catch (e) { console.error(`  ${m.symbol} tick failed: ${(e as Error).message.slice(0, 100)}`); }
    i++;
    if (ONCE && i >= markets.length) break;
    await sleep(TICK_MS);
  }
  console.log("\ndone");
}

// devnet drops websocket confirmations under load; keep the maker alive rather than dying on one
process.on("unhandledRejection", (e) => console.error("  unhandled:", (e as Error)?.message ?? String(e)));

main().catch((e) => { console.error(e); process.exit(1); });
