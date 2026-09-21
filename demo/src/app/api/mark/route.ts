// Pyth reference mark for a LISTED ticker: GET /api/mark?symbol=NVDA
//
// Three kinds of reference, and the distinction is the venue's whole argument:
//   none      — nothing anywhere publishes a price (Anduril, Neuralink, Kalshi, Polymarket)
//   index     — Pyth publishes a derived 24/7 index (OpenAI, Anthropic). Real, but not an exchange
//               price: it reports discovery happening on secondary venues rather than performing it
//   exchange  — a listed ticker with a primary market behind it (NVDA, SPY), the control group
//
// Three states are reported separately, because they mean very different things and a reader must
// be able to tell them apart:
//   unauthenticated  — no PYTH_API_KEY configured at all
//   unentitled       — the key is valid but equity feeds need a Pyth Pro grant (Hermes 403)
//   ok               — a real mark
//
// In the unentitled case we additionally probe a feed the key IS entitled to, through exactly the
// same client and auth path. That turns "our Pyth integration is pending" from a claim into
// something a reader can check: the pipe demonstrably works, only the equity grant is missing.
import { NextResponse } from "next/server";
import { bySymbol, feedIdOf, feedSymbolOf, probeFeed } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HERMES = process.env.HERMES_URL ?? "https://hermes.pyth.network";
const TTL_MS = 5_000;

type Mark = { price: number; conf: number; publishTime: number; feedId: string };
const cache = new Map<string, { at: number; data: Mark }>();

const scale = (price: string, expo: number): number => Number(price) * Math.pow(10, expo);

interface Parsed { price: { price: string; conf: string; expo: number; publish_time: number } }

/** Fetch one feed. Returns the mark, or the HTTP status when Hermes refuses. */
async function fetchMark(feedId: string, key: string): Promise<Mark | { status: number; body: string }> {
  const url = `${HERMES}/v2/updates/price/latest?ids%5B%5D=${feedId}&parsed=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) return { status: res.status, body: (await res.text()).slice(0, 200) };
  const j = (await res.json()) as { parsed?: Parsed[] };
  const row = j.parsed?.[0];
  if (!row) return { status: 502, body: "hermes returned no parsed price" };
  return {
    price: scale(row.price.price, row.price.expo),
    conf: scale(row.price.conf, row.price.expo),
    publishTime: row.price.publish_time,
    feedId,
  };
}
const isMark = (v: Mark | { status: number }): v is Mark => !("status" in v);

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  const listing = bySymbol(symbol);
  if (!listing) return NextResponse.json({ error: `unknown listing "${symbol}"` }, { status: 404 });

  const feedId = feedIdOf(listing.symbol);
  const refKind = !feedId ? "none" : listing.kind === "listed" ? "exchange" : "index";

  if (refKind === "none" || !feedId) {
    return NextResponse.json({
      oracle: false, refKind,
      reason: `${listing.name} is private and unindexed — no exchange, vendor or oracle publishes a price`,
    });
  }

  const hit = cache.get(listing.symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ oracle: true, refKind, state: "ok", ...hit.data });

  const key = process.env.PYTH_API_KEY;
  if (!key) {
    return NextResponse.json({
      oracle: true, refKind, state: "unauthenticated", feedId, feedSymbol: feedSymbolOf(listing.symbol),
      reason: "PYTH_API_KEY not set — Hermes requires credentials",
    });
  }

  try {
    const got = await fetchMark(feedId, key);
    if (isMark(got)) {
      cache.set(listing.symbol, { at: Date.now(), data: got });
      return NextResponse.json({ oracle: true, refKind, state: "ok", ...got });
    }

    if (got.status === 403) {
      // the key is good; equity feeds are simply not in its grant. Prove the client works.
      const probe = probeFeed();
      let proof: { symbol: string; price: number; publishTime: number } | null = null;
      if (probe) {
        const p = await fetchMark(probe.id, key);
        if (isMark(p)) proof = { symbol: probe.symbol, price: p.price, publishTime: p.publishTime };
      }
      return NextResponse.json({
        oracle: true, refKind, state: "unentitled", feedId, feedSymbol: feedSymbolOf(listing.symbol),
        reason: refKind === "index"
          ? "the key is valid but Pyth's index feeds require a pyth-indices grant"
          : "the key is valid but Pyth equity feeds require a Pyth Pro grant",
        proof, // same client, same auth header, on a feed this key is entitled to
      });
    }

    throw new Error(`hermes ${got.status}: ${got.body}`);
  } catch (e) {
    // a stale mark, clearly labelled, beats a blank panel during a transient Hermes error
    if (hit) return NextResponse.json({ oracle: true, refKind, state: "stale", ...hit.data });
    return NextResponse.json({
      oracle: true, refKind, state: "error", feedId,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}
