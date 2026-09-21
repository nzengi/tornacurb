// Cached server read of a live book, one market at a time: GET /api/book?symbol=OPENAI
//
// The browser polls THIS endpoint, not the RPC, so many viewers share one upstream read per TTL
// (a load-balancer effect) and the RPC is never hit "constantly". The RPC is server-only (RPC_URL
// env, defaults to public devnet) so no key is exposed to the browser.
//
// The cache is keyed by symbol: eight listings each get their own snapshot and their own TTL, so a
// viewer sitting on OPENAI never forces a re-read of the other seven.
import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { Tree, keys, type AccountReader } from "torna-sdk";
import venue from "@/lib/venue.json";
import { bySymbol } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const TTL_MS = 10_000;

const conn = new Connection(RPC, "confirmed");
const reader: AccountReader = {
  async accountData(k) { const a = await conn.getAccountInfo(k, "confirmed"); return a ? Uint8Array.from(a.data) : null; },
};

interface OrderJSON { price: string; size: string; maker: string; keyHex: string }
function decode(side: typeof keys.Side.Ask | typeof keys.Side.Bid, e: { key: Uint8Array; value: Uint8Array }): OrderJSON {
  const dv = new DataView(e.value.buffer, e.value.byteOffset, e.value.byteLength);
  return {
    price: keys.priceOf(side, e.key).toString(),
    size: dv.getBigUint64(32, false).toString(),
    maker: new PublicKey(e.value.subarray(0, 32)).toBase58(),
    keyHex: Buffer.from(e.key).toString("hex"),
  };
}
async function scanSide(tree: Tree, side: typeof keys.Side.Ask | typeof keys.Side.Bid): Promise<OrderJSON[]> {
  const rows = await tree.scan(reader, 64);
  return rows.map((e) => decode(side, e)).filter((o) => o.size !== "0");
}

type Snap = { asks: OrderJSON[]; bids: OrderJSON[] };
const cache = new Map<string, { at: number; data: Snap }>();

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  const listing = bySymbol(symbol);
  const state = listing && (venue.markets as Record<string, { askTreeId: number; bidTreeId: number }>)[listing.symbol];
  if (!listing || !state) {
    return NextResponse.json({ asks: [], bids: [], error: `unknown or unprovisioned market "${symbol}"` }, { status: 404 });
  }

  const hit = cache.get(listing.symbol);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { "cache-control": "public, max-age=8" } });
  }
  try {
    const torna = new PublicKey(venue.tornaProgramId);
    const creator = new PublicKey(venue.creator);
    const [asks, bids] = await Promise.all([
      scanSide(new Tree(torna, creator, state.askTreeId), keys.Side.Ask),
      scanSide(new Tree(torna, creator, state.bidTreeId), keys.Side.Bid),
    ]);
    const data: Snap = { asks, bids };
    cache.set(listing.symbol, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "cache-control": "public, max-age=8" } });
  } catch (e) {
    // serve the last good snapshot on a transient RPC error (e.g. a 429), instead of failing the UI
    if (hit) return NextResponse.json(hit.data, { headers: { "cache-control": "public, max-age=4" } });
    return NextResponse.json({ asks: [], bids: [], error: e instanceof Error ? e.message : String(e) });
  }
}
