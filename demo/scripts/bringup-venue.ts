// TornaCurb venue bring-up — creates every market in src/lib/listings.ts on devnet.
//
// Differs from the single-market bringup.ts in three ways that matter for a real venue:
//   1. ONE shared quote mint (mock USDC) across all markets, so a faucet drip is tradeable
//      everywhere instead of being stranded in one market.
//   2. ONE shared pool of demo identities, funded once rather than per market.
//   3. RESUMABLE — devnet drops transactions and SOL is rate-limited, so each market is
//      skipped if its ask tree already exists and state is flushed to disk after every market.
//      A crash costs you one market, not the whole venue.
//
// Run from demo/:  npx tsx scripts/bringup-venue.ts
import "../src/lib/polyfill";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Tree, keys, type AccountReader } from "torna-sdk";
import {
  ASK, BID, bookPda, cfgPda, orderValue, transferAuthorityIx, initMarketIx, placeIx, type Side,
} from "../src/lib/orderbook";
import { LISTINGS, openingMid, type Listing } from "../src/lib/listings";

const RPC = process.env.RPC ?? "https://api.devnet.solana.com";
const VS = 8 + 32;   // order value: maker(32) + size_be(8)
const F = 8;         // tree fanout — matches the proven single-market bringup (node = 692B, not 4.7KB)
const DEMO_COUNT = 4;
const DEMO_SOL = 60_000_000;      // lamports per demo identity
const QUOTE_PER_DEMO = 100_000_000; // mock USDC per demo, spread across 8 markets
const BASE_PER_DEMO = 1000;         // shares per demo per market
// Public devnet rate-limits by request RATE, so a deliberate gap between operations gets further
// than hammering and backing off. Lower it (PACE_MS=0) once RPC points at a dedicated endpoint.
const PACE_MS = Number(process.env.PACE_MS ?? 400);

// The already-deployed Torna programs (devnet). Override via env for a private deployment.
const TORNA = new PublicKey(process.env.TORNA_PROGRAM ?? "DQW2KqoFvrLaBgkH9ig6TWmY9nWTVSwpyNisXELDxw3A");
const ORDERBOOK = new PublicKey(process.env.ORDERBOOK_PROGRAM ?? "5FZVhBTp4TMvUz9XmheVuzyXULCeC4g4NMSego8GP2AC");

const conn = new Connection(RPC, "confirmed");
const here = (p: string) => join(import.meta.dirname, p);
const STATE = here("../src/lib/venue.json");

const reader: AccountReader = {
  async accountData(k: PublicKey) {
    const a = await conn.getAccountInfo(k, "confirmed");
    return a ? Uint8Array.from(a.data) : null;
  },
};
const rent = (n: number) => conn.getMinimumBalanceForRentExemption(n);
// Public devnet RPC rate-limits hard (429) and surfaces some failures as errors with an EMPTY
// message, so every on-chain step goes through retry(): exponential backoff, and the label is what
// makes a failure legible in the log. A dedicated RPC (RPC=...) makes this mostly moot.
async function retry<T>(label: string, fn: () => Promise<T>, attempts = 6): Promise<T> {
  let wait = 600;
  for (let i = 1; ; i++) {
    try {
      const out = await fn();
      if (PACE_MS) await new Promise((r) => setTimeout(r, PACE_MS));
      return out;
    } catch (e) {
      const msg = (e as Error)?.message || String(e) || "(empty error)";
      if (i >= attempts) throw new Error(`${label} failed after ${attempts} attempts: ${msg}`);
      console.log(`    retry ${i}/${attempts - 1} ${label}: ${msg.slice(0, 90)}`);
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 8000);
    }
  }
}

const send = (ixs: any[], signers: Keypair[], label = "tx") =>
  retry(label, () => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" }));
const nodeSize = (f: number, vs: number) =>
  Math.max(44 + (f + 1) * 32 + (f + 1) * vs, 44 + (f + 1) * 32 + (f + 2) * 8);
const loadKp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

interface MarketState {
  symbol: string; marketId: number; askTreeId: number; bidTreeId: number; bookBump: number;
  baseMint: string; baseVault: string; quoteVault: string; book: string; cfg: string;
}
interface Venue {
  cluster: string; rpcUrl: string; tornaProgramId: string; orderbookProgramId: string;
  creator: string; quoteMint: string;
  demos: { pubkey: string; secret: number[] }[];
  markets: Record<string, MarketState>;
}

// An unprovisioned placeholder (creator === "") counts as "no venue yet" — it ships in the repo
// so the app typechecks and builds before this script has ever run.
const loadVenue = (): Venue | null => {
  if (!existsSync(STATE)) return null;
  const v = JSON.parse(readFileSync(STATE, "utf8")) as Venue;
  return v.creator ? v : null;
};
const saveVenue = (v: Venue) => writeFileSync(STATE, JSON.stringify(v, null, 2));

/** First tree id at or above `start` whose header PDA is unoccupied and that this run has not
 *  already handed out. A crashed run can leave an orphaned tree on-chain (created, never recorded),
 *  so the ids in listings.ts are a preferred starting point rather than a claim — we step past any
 *  that are taken and record what we actually used in venue.json. The orphan just forfeits its
 *  rent, which is a few thousand lamports. */
async function freeTreeId(payer: Keypair, start: number, used: Set<number>): Promise<number> {
  for (let id = start; id < start + 500; id++) {
    if (used.has(id)) continue;
    if (!(await reader.accountData(new Tree(TORNA, payer.publicKey, id).headerPda()[0]))) return id;
  }
  throw new Error(`no free tree id at or above ${start}`);
}

/** First market id at or above `start` whose cfg PDA is unoccupied and that this run has not
 *  already handed out. Same reasoning as freeTreeId: a crash between InitMarket and the state
 *  flush leaves a half-built market that must never be silently re-entered, and book/cfg PDAs are
 *  derived from marketId alone so the id itself is the thing that collides. */
async function freeMarketId(start: number, used: Set<number>): Promise<number> {
  for (let id = start; id < start + 500; id++) {
    if (used.has(id)) continue;
    if (!(await reader.accountData(cfgPda(ORDERBOOK, BigInt(id))[0]))) return id;
  }
  throw new Error(`no free market id at or above ${start}`);
}

/** Ladder of three price levels each side, offset in percent so it scales with the share price. */
function ladder(mid: number): [number, Side, bigint, bigint][] {
  const px = (pct: number) => BigInt(Math.max(1, Math.round(mid * pct)));
  return [
    [0, ASK, px(1.01), 5n], [1, ASK, px(1.02), 8n], [2, ASK, px(1.03), 6n],
    [0, BID, px(0.99), 6n], [1, BID, px(0.98), 4n], [3, BID, px(0.97), 7n],
  ];
}

// web3.js confirms over a websocket subscription; when devnet refuses the WS upgrade with a 429 the
// rejection surfaces OUTSIDE our await chain and would otherwise kill the process with a bare stack.
// Per-market state is already flushed to disk, so exit cleanly and let the next run resume.
process.on("unhandledRejection", (e) => {
  console.error("\nx unhandled RPC rejection (likely a 429 on the confirm websocket):",
    (e as Error)?.message ?? String(e));
  console.error("  progress is saved in src/lib/venue.json — re-run to resume.");
  process.exit(1);
});

async function main() {
  const payer = loadKp(join(homedir(), ".config/solana/id.json"));
  const bal = await conn.getBalance(payer.publicKey);
  console.log(`payer     ${payer.publicKey.toBase58()}  (${(bal / 1e9).toFixed(3)} SOL)`);
  console.log(`torna     ${TORNA.toBase58()}`);
  console.log(`orderbook ${ORDERBOOK.toBase58()}\n`);
  if (bal < 1e9) console.warn("!! under 1 SOL — a full 8-market venue costs ~0.65 SOL + fees. Top up first.\n");

  // ---- shared state: quote mint + demo identities, created once and reused ----------------
  let venue = loadVenue();
  if (venue && venue.creator !== payer.publicKey.toBase58())
    throw new Error(`venue.json was created by ${venue.creator}, but the payer is ${payer.publicKey.toBase58()}`);

  if (!venue) {
    console.log("creating shared quote mint (mock USDC, 0 decimals) ...");
    const quoteMint = await retry("create quote mint", () => createMint(conn, payer, payer.publicKey, null, 0));
    console.log("funding demo identities ...");
    const demos = Array.from({ length: DEMO_COUNT }, () => Keypair.generate());
    for (const kp of demos) {
      await send([SystemProgram.transfer({
        fromPubkey: payer.publicKey, toPubkey: kp.publicKey, lamports: DEMO_SOL,
      })], [payer]);
      const ata = (await retry("demo quote ATA", () => getOrCreateAssociatedTokenAccount(conn, payer, quoteMint, kp.publicKey))).address;
      await retry("mint quote to demo", () => mintTo(conn, payer, quoteMint, ata, payer, QUOTE_PER_DEMO));
    }
    venue = {
      cluster: "devnet", rpcUrl: "https://api.devnet.solana.com",
      tornaProgramId: TORNA.toBase58(), orderbookProgramId: ORDERBOOK.toBase58(),
      creator: payer.publicKey.toBase58(), quoteMint: quoteMint.toBase58(),
      demos: demos.map((k) => ({ pubkey: k.publicKey.toBase58(), secret: Array.from(k.secretKey) })),
      markets: {},
    };
    saveVenue(venue);
    console.log(`  quote mint ${quoteMint.toBase58()}\n`);
  } else {
    console.log(`resuming venue — quote ${venue.quoteMint}, ${Object.keys(venue.markets).length}/${LISTINGS.length} markets done\n`);
  }

  const quoteMint = new PublicKey(venue.quoteMint);
  const demoKps = venue.demos.map((d) => Keypair.fromSecretKey(Uint8Array.from(d.secret)));

  // ---- rent quotes, fetched once ---------------------------------------------------------
  const rHdr = BigInt(await rent(146));
  const rAlloc = BigInt(await rent(32));
  const rNode = BigInt(await rent(nodeSize(F, VS)));
  const rCfg = BigInt(await rent(237)); // only read by an orderbook older than min_size; current ones size the config themselves

  for (const L of LISTINGS) {
    if (venue.markets[L.symbol]) { console.log(`= ${L.symbol.padEnd(8)} already up, skipping`); continue; }
    console.log(`\n--- ${L.symbol} (${L.name}) market ${L.marketId} ---`);
    try {
      await bringUpMarket(L, payer, quoteMint, demoKps, { rHdr, rAlloc, rNode, rCfg }, venue);
      saveVenue(venue);
      console.log(`+ ${L.symbol} live`);
    } catch (e) {
      console.error(`x ${L.symbol} FAILED:`, (e as Error)?.message || String(e) || "(empty error)");
      console.error(e);
      console.error("  state saved; re-run to resume from here.");
      saveVenue(venue);
      process.exit(1);
    }
  }

  console.log(`\nDONE. ${Object.keys(venue.markets).length} markets in src/lib/venue.json`);
  const left = await conn.getBalance(payer.publicKey);
  console.log(`payer balance left: ${(left / 1e9).toFixed(3)} SOL`);
}

async function bringUpMarket(
  L: Listing, payer: Keypair, quoteMint: PublicKey, demos: Keypair[],
  r: { rHdr: bigint; rAlloc: bigint; rNode: bigint; rCfg: bigint }, venue: Venue,
) {
  const usedMarkets = new Set<number>(Object.values(venue.markets).map((m) => m.marketId));
  const marketId = await freeMarketId(L.marketId, usedMarkets);
  if (marketId !== L.marketId) console.log(`  market id ${L.marketId} taken -> using ${marketId}`);
  const [book, bump] = bookPda(ORDERBOOK, BigInt(marketId));
  const [cfg] = cfgPda(ORDERBOOK, BigInt(marketId));

  const used = new Set<number>(Object.values(venue.markets).flatMap((m) => [m.askTreeId, m.bidTreeId]));
  const askTreeId = await freeTreeId(payer, L.askTreeId, used);
  used.add(askTreeId);
  const bidTreeId = await freeTreeId(payer, L.bidTreeId, used);
  if (askTreeId !== L.askTreeId || bidTreeId !== L.bidTreeId)
    console.log(`  tree ids ${L.askTreeId}/${L.bidTreeId} taken -> using ${askTreeId}/${bidTreeId}`);
  const ask = new Tree(TORNA, payer.publicKey, askTreeId);
  const bid = new Tree(TORNA, payer.publicKey, bidTreeId);

  console.log("  base mint ...");
  const baseMint = await retry(`${L.symbol} base mint`, () => createMint(conn, payer, payer.publicKey, null, 0));

  console.log("  vaults ...");
  const baseVault = (await retry(`${L.symbol} base vault`, () => getOrCreateAssociatedTokenAccount(conn, payer, baseMint, book, true))).address;
  const quoteVault = (await retry(`${L.symbol} quote vault`, () => getOrCreateAssociatedTokenAccount(conn, payer, quoteMint, book, true))).address;

  // trees: init, seed a size-0 sentinel so height -> 1, then hand authority to the book PDA
  for (const [tree, side, sentPrice] of [[ask, ASK, 1_000_000n], [bid, BID, 1n]] as [Tree, Side, bigint][]) {
    console.log(`  tree ${tree.treeId} ...`);
    await send([tree.initTreeIx(payer.publicKey, VS, F, r.rHdr, r.rAlloc)], [payer], `${L.symbol} init tree ${tree.treeId}`);
    const sd = side === ASK ? keys.Side.Ask : keys.Side.Bid;
    const cold = await tree.insertIx(
      reader, payer.publicKey,
      keys.orderKey(sd, sentPrice, 0n, payer.publicKey, 0n),
      orderValue(payer.publicKey, 0n), r.rNode,
    );
    if (!cold) throw new Error("sentinel cold insert unresolved");
    await send([cold], [payer], `${L.symbol} sentinel ${tree.treeId}`);
    await send([transferAuthorityIx(TORNA, tree.headerPda()[0], payer.publicKey, book)], [payer], `${L.symbol} tree auth ${tree.treeId}`);
  }

  console.log("  init market ...");
  const askRoot = ask.nodePda((await ask.header(reader))!.root)[0];
  const bidRoot = bid.nodePda((await bid.header(reader))!.root)[0];
  await send([initMarketIx({
    orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(marketId), payer: payer.publicKey,
    baseMint, quoteMint, baseVault, quoteVault,
    askHeader: ask.headerPda()[0], bidHeader: bid.headerPda()[0], askRoot, bidRoot, rent: r.rCfg,
  })], [payer], `${L.symbol} init market`);

  // every demo gets shares of THIS listing; their quote balance is already shared venue-wide
  console.log("  minting shares to demos ...");
  const baseAta: Record<string, PublicKey> = {};
  for (const kp of demos) {
    const a = (await retry(`${L.symbol} demo ATA`, () => getOrCreateAssociatedTokenAccount(conn, payer, baseMint, kp.publicKey))).address;
    baseAta[kp.publicKey.toBase58()] = a;
    await retry(`${L.symbol} mint shares`, () => mintTo(conn, payer, baseMint, a, payer, BASE_PER_DEMO));
  }

  const mid0 = openingMid(L);
  console.log(`  seeding ladder around ${mid0} ...`);
  for (const [mi, side, price, size] of ladder(mid0)) {
    const maker = demos[mi];
    const tree = side === ASK ? ask : bid;
    const src = side === ASK
      ? baseAta[maker.publicKey.toBase58()]
      : (await retry("maker quote ATA", () => getOrCreateAssociatedTokenAccount(conn, payer, quoteMint, maker.publicKey))).address;
    const { ix } = await placeIx({
      reader, tree, orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(marketId),
      side, price, size, nonce: BigInt(mi + 1), slot: BigInt(await conn.getSlot("confirmed")), maker: maker.publicKey,
      makerSrc: src, vault: side === ASK ? baseVault : quoteVault,
    });
    await send([ix], [payer, maker], `${L.symbol} seed ${side === ASK ? "ask" : "bid"}@${price}`);
    console.log(`    ${side === ASK ? "ASK" : "BID"} ${size}@${price}`);
  }

  venue.markets[L.symbol] = {
    symbol: L.symbol, marketId, askTreeId, bidTreeId,
    bookBump: bump, baseMint: baseMint.toBase58(), baseVault: baseVault.toBase58(),
    quoteVault: quoteVault.toBase58(), book: book.toBase58(), cfg: cfg.toBase58(),
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
