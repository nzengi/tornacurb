// Pyth reference mark for a LISTED ticker: GET /api/mark?symbol=NVDA
//
// Only the listed control group has one. Pre-IPO names return oracle:false, and that is the whole
// point of the venue — there is no price to mark against anywhere, so the book is the price.
//
// Hermes' price endpoint requires credentials (its metadata endpoint does not). Without
// PYTH_API_KEY set we return unavailable + a reason rather than inventing a number: a mark line
// that silently shows a stale or fabricated price is worse than no mark line at all.
import { NextResponse } from "next/server";
import { bySymbol, feedIdOf } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HERMES = process.env.HERMES_URL ?? "https://hermes.pyth.network";
const TTL_MS = 5_000;

type Mark = { price: number; conf: number; publishTime: number; feedId: string };
const cache = new Map<string, { at: number; data: Mark }>();

const scale = (price: string, expo: number): number => Number(price) * Math.pow(10, expo);

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  const listing = bySymbol(symbol);
  if (!listing) return NextResponse.json({ error: `unknown listing "${symbol}"` }, { status: 404 });

  const feedId = feedIdOf(listing.symbol);
  if (listing.kind !== "listed" || !feedId) {
    // not a failure: a private company has no public price anywhere
    return NextResponse.json({ oracle: false, reason: "pre-IPO: no public market, no oracle" });
  }

  const hit = cache.get(listing.symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ oracle: true, ...hit.data });

  const key = process.env.PYTH_API_KEY;
  if (!key) {
    return NextResponse.json({
      oracle: true, unavailable: true, feedId,
      reason: "PYTH_API_KEY not set — Hermes price endpoint requires credentials",
    });
  }

  try {
    const url = `${HERMES}/v2/updates/price/latest?ids%5B%5D=${feedId}&parsed=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`hermes ${res.status}`);
    const j = (await res.json()) as { parsed?: { price: { price: string; conf: string; expo: number; publish_time: number } }[] };
    const row = j.parsed?.[0];
    if (!row) throw new Error("hermes returned no parsed price");
    const data: Mark = {
      price: scale(row.price.price, row.price.expo),
      conf: scale(row.price.conf, row.price.expo),
      publishTime: row.price.publish_time,
      feedId,
    };
    cache.set(listing.symbol, { at: Date.now(), data });
    return NextResponse.json({ oracle: true, ...data });
  } catch (e) {
    // a stale mark, clearly labelled, beats a blank panel during a transient Hermes error
    if (hit) return NextResponse.json({ oracle: true, stale: true, ...hit.data });
    return NextResponse.json({ oracle: true, unavailable: true, feedId, reason: e instanceof Error ? e.message : String(e) });
  }
}
