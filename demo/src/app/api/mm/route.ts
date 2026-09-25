// One market-maker tick, triggerable by any scheduler: POST /api/mm with a bearer CRON_SECRET.
//
// Why a route and not a daemon: the venue is on Vercel Hobby, where cron runs once a day — useless
// for a book that should look alive. So the tick lives here, scheduler-agnostic, and anything that
// can make an authenticated HTTP call once a minute keeps the venue quoting.
//
// Two deliberate differences from scripts/market-maker.ts, both forced by the function time limit:
//   1. Transactions are SENT, not awaited to confirmation. A maker that blocks on confirmations
//      would blow the budget, and re-quoting every minute makes a dropped tx self-healing anyway.
//   2. One listing per call, chosen round-robin from the clock, so a dumb every-minute trigger
//      still walks the whole venue without needing to track state.
//
// The maker quotes from mmMakers(): its own identities when MM_MAKERS is set (so a visitor cannot
// cancel the quotes that make the book look alive), else the public demo traders. Either way the
// bearer secret is not protecting keys — it stops a stranger burning the venue's devnet SOL by
// hammering the endpoint.
import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Tree, keys, type AccountReader } from "torna-sdk";
import { ASK, BID, cancelIx, matchIx, placeIx, placeColdIx, type Side } from "@/lib/orderbook";
import venue from "@/lib/venue.json";
import { LISTINGS, openingMid, type Listing } from "@/lib/listings";
import { mmMakers } from "@/lib/mm-makers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LEVELS = 3;        // quotes per side per tick; steady state is roughly twice this per side
const DRIFT = 0.006;
const MAX_DEV = 0.12;
const PRUNE_MAX = 4;
const N_KEY_COUNT = 2;

// Quote size. A book that cannot fill a fifty-share order reads as a toy, and the homepage prices
// exactly that order against a pool — so the depth has to be real. Bigger sizes cost nothing extra:
// same number of orders, same number of transactions, just larger escrow amounts, and the demo
// identities hold far more than they can ever quote.
const quoteSize = () => BigInt(25 + Math.floor(Math.random() * 45));

const RPC = process.env.RPC_URL || venue.rpcUrl;
const conn = new Connection(RPC, "confirmed");
const TORNA = new PublicKey(venue.tornaProgramId);
const ORDERBOOK = new PublicKey(venue.orderbookProgramId);
const CREATOR = new PublicKey(venue.creator);

const reader: AccountReader = {
  async accountData(k: PublicKey) { const a = await conn.getAccountInfo(k, "confirmed"); return a ? Uint8Array.from(a.data) : null; },
};
const rdU16 = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(o, true);
const demos = mmMakers(); // the maker's identities (see mm-makers.ts); named for what they were
const ata = (mint: string, owner: PublicKey) => getAssociatedTokenAddressSync(new PublicKey(mint), owner, true);

type Market = Listing & { marketId: number; askTreeId: number; bidTreeId: number; baseMint: string; baseVault: string; quoteVault: string };
const live = (): Market[] => LISTINGS.flatMap((l) => {
  const s = (venue.markets as Record<string, Omit<Market, keyof Listing>>)[l.symbol];
  return s ? [{ ...l, ...s }] : [];
});

const treeOf = (m: Market, side: Side) => new Tree(TORNA, CREATOR, side === ASK ? m.askTreeId : m.bidTreeId);
const vaultOf = (m: Market, side: Side) => new PublicKey(side === ASK ? m.baseVault : m.quoteVault);
const payMintOf = (m: Market, side: Side) => (side === ASK ? m.baseMint : venue.quoteMint);

/** Sign and send without waiting for confirmation. Preflight is skipped: the simulation round trip
 *  costs more than the occasional wasted fee, and the next tick re-quotes regardless. */
async function fire(ix: TransactionInstruction, signers: Keypair[], blockhash: string): Promise<string> {
  const tx = new Transaction().add(ix);
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  return conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
}

interface Row { price: bigint; size: bigint; maker: string; key: Uint8Array }
async function readSide(m: Market, side: Side): Promise<Row[]> {
  const rows = await treeOf(m, side).scan(reader, 48);
  const sd = side === ASK ? keys.Side.Ask : keys.Side.Bid;
  return rows.map((e) => {
    const dv = new DataView(e.value.buffer, e.value.byteOffset, e.value.byteLength);
    return { price: keys.priceOf(sd, e.key), size: dv.getBigUint64(32, false), maker: new PublicKey(e.value.subarray(0, 32)).toBase58(), key: e.key };
  }).filter((o) => o.size > 0n);
}

async function buildPlace(m: Market, maker: Keypair, side: Side, price: bigint, size: bigint) {
  const tree = treeOf(m, side);
  const nonce = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1000));
  const args = {
    reader, tree, orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(m.marketId),
    side, price, size, nonce, maker: maker.publicKey,
    makerSrc: ata(payMintOf(m, side), maker.publicKey), vault: vaultOf(m, side),
  };
  const h = await tree.header(reader);
  if (!h) return null;
  let cold = h.height === 0;
  if (!cold) {
    const key = keys.orderKey(side === ASK ? keys.Side.Ask : keys.Side.Bid, price, 0n, maker.publicKey, nonce);
    const path = await tree.path(reader, key);
    if (path?.length) {
      const d = await reader.accountData(tree.nodePda(path[path.length - 1])[0]);
      if (d && rdU16(d, N_KEY_COUNT) >= h.fanout) cold = true;
    }
  }
  if (cold) {
    const rentNode = BigInt(await conn.getMinimumBalanceForRentExemption(h.nodeSize));
    return (await placeColdIx({ ...args, rentNode }))?.ix ?? null;
  }
  return (await placeIx(args)).ix;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const markets = live();
  if (!markets.length) return NextResponse.json({ error: "no provisioned markets" }, { status: 503 });

  // round-robin off the clock, so a stateless every-minute trigger still walks the whole venue
  const url = new URL(req.url);
  const want = url.searchParams.get("symbol") ?? "";
  // an explicit ?symbol= wins; otherwise walk the venue off the clock so a stateless trigger covers
  // every listing without having to remember where it got to
  const m = markets.find((x) => x.symbol === want)
    ?? markets[Math.floor(Date.now() / 60_000) % markets.length];

  const sent: string[] = [];
  const skipped: string[] = [];
  try {
    let [asks, bids] = await Promise.all([readSide(m, ASK), readSide(m, BID)]);
    const ours = new Set(demos.map((d) => d.publicKey.toBase58()));

    // anchor the walk to the current mid so restarts don't jump the price around
    // The band exists to stop a long run of random walks wandering somewhere absurd, not to stop the
    // book reaching the issuer's price in the first place. A book that is outside it — because the
    // opening price changed, or because it was just cleared — snaps to the anchor rather than
    // clamping to the band edge, which would leave it sitting a fixed 12% off the mark and looking
    // like a signal when it is only an artefact of this clamp.
    const anchor = openingMid(m);
    const bookMid = asks[0] && bids[0] ? (Number(asks[0].price) + Number(bids[0].price)) / 2 : null;
    const inBand = bookMid !== null && Math.abs(bookMid - anchor) / anchor <= MAX_DEV;
    const base = inBand ? bookMid! : anchor;
    const moved = base * (1 + (Math.random() * 2 - 1) * DRIFT);
    const mid = Math.min(anchor * (1 + MAX_DEV), Math.max(anchor * (1 - MAX_DEV), moved));

    const { blockhash } = await conn.getLatestBlockhash("confirmed");

    // uncross first: place does not auto-match, so a bid and an ask can rest at the same price and
    // a venue must never show that. Taking the cross is what an arbitrageur would do anyway.
    if (bids[0] && asks[0] && bids[0].price >= asks[0].price) {
      const top = asks[0];
      const taker = demos.find((d) => d.publicKey.toBase58() !== top.maker) ?? demos[0];
      const size = top.size < bids[0].size ? top.size : bids[0].size;
      const built = await matchIx({
        reader, tree: treeOf(m, ASK), orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(m.marketId),
        bookSide: ASK, limit: top.price, size, maxFills: 4, taker: taker.publicKey, vault: vaultOf(m, ASK),
        takerRecv: ata(m.baseMint, taker.publicKey), takerPay: ata(venue.quoteMint, taker.publicKey),
        payMint: new PublicKey(venue.quoteMint),
      });
      if (built) {
        sent.push(await fire(built.ix, [taker], blockhash));
        [asks, bids] = await Promise.all([readSide(m, ASK), readSide(m, BID)]);
      }
    }

    // prune: keep the LEVELS quotes nearest the mid, cancel the rest, or the tree grows every tick
    for (const [rows, side] of [[asks, ASK], [bids, BID]] as [Row[], Side][]) {
      const mine = rows.filter((o) => ours.has(o.maker))
        .sort((a, b) => Math.abs(Number(a.price) - mid) - Math.abs(Number(b.price) - mid));
      for (const o of mine.slice(LEVELS).slice(0, PRUNE_MAX)) {
        const maker = demos.find((d) => d.publicKey.toBase58() === o.maker)!;
        try {
          const ix = await cancelIx({
            reader, tree: treeOf(m, side), orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(m.marketId),
            side, key: o.key, maker: maker.publicKey, vault: vaultOf(m, side),
            makerDst: ata(payMintOf(m, side), maker.publicKey),
          });
          sent.push(await fire(ix, [maker], blockhash));
        } catch { skipped.push(`cancel@${o.price}`); }
      }
    }

    // re-quote, clamped so a new order never crosses what is already resting
    const bestBid = bids[0]?.price, bestAsk = asks[0]?.price;
    for (let i = 0; i < LEVELS; i++) {
      const off = 0.004 + i * 0.006;
      for (const side of [ASK, BID] as Side[]) {
        let price = BigInt(Math.max(1, Math.round(side === ASK ? mid * (1 + off) : mid * (1 - off))));
        if (side === ASK && bestBid !== undefined && price <= bestBid) price = bestBid + 1n;
        if (side === BID && bestAsk !== undefined && price >= bestAsk) price = bestAsk - 1n;
        if (price <= 0n) continue;
        const maker = demos[(i + (side === ASK ? 0 : 1)) % demos.length];
        try {
          const ix = await buildPlace(m, maker, side, price, quoteSize());
          if (ix) sent.push(await fire(ix, [maker], blockhash));
        } catch { skipped.push(`${side === ASK ? "ask" : "bid"}@${price}`); }
      }
    }

    return NextResponse.json({ symbol: m.symbol, mid: Number(mid.toFixed(2)), sent: sent.length, skipped });
  } catch (e) {
    return NextResponse.json({ symbol: m.symbol, sent: sent.length, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
