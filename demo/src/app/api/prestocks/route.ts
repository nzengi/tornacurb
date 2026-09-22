// Live PreStocks reference for a listing: GET /api/prestocks?symbol=OPENAI
//
// Every pre-IPO name on this venue is a PreStocks token, and they publish two prices for each:
//   markPrice   what the SPV says the underlying private company is worth
//   tokenPrice  what the token itself actually changes hands at
//
// The gap between those two is the argument this venue exists to make. A claim on a private company
// has no exchange behind it, so the token drifts from the thing it tracks — and the thinner the
// secondary market, the further it drifts. An order book is how that gap gets closed, which is why
// the venue shows the issuer's own numbers rather than hiding them.
//
// Read server-side and cached, so a page full of listings does not become a page full of requests to
// somebody else's API.
import { NextResponse } from "next/server";
import { bySymbol, preStockOf } from "@/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = process.env.PRESTOCKS_API ?? "https://prestocks.com/api/prestocks";
const TTL_MS = 60_000;

interface ApiRow {
  name?: string; symbol?: string; contract_address?: string; external_url?: string;
  markPrice?: number; tokenPrice?: number; markValuation?: number; impliedValuation?: number;
}
let cache: { at: number; rows: Record<string, ApiRow> } | null = null;

async function catalogue(): Promise<Record<string, ApiRow>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const res = await fetch(API, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`prestocks api ${res.status}`);
  const list = (await res.json()) as ApiRow[];
  const rows: Record<string, ApiRow> = {};
  for (const r of list) if (r.symbol) rows[r.symbol] = r;
  cache = { at: Date.now(), rows };
  return rows;
}

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  const listing = bySymbol(symbol);
  if (!listing) return NextResponse.json({ error: `unknown listing "${symbol}"` }, { status: 404 });
  if (!listing.prestocksSymbol) {
    return NextResponse.json({ issuer: false, reason: "not a PreStocks token" });
  }

  // the bundled catalogue is the floor: if their API is slow or down, the page still shows a price
  // and says it is the one we last resolved rather than going blank
  const bundled = preStockOf(listing);

  try {
    const rows = await catalogue();
    const r = rows[listing.prestocksSymbol];
    if (!r || typeof r.markPrice !== "number") throw new Error("symbol missing from catalogue");
    const mark = r.markPrice;
    const token = typeof r.tokenPrice === "number" ? r.tokenPrice : mark;
    return NextResponse.json({
      issuer: true, live: true,
      symbol: listing.prestocksSymbol,
      name: (r.name ?? listing.name).replace(/\s+PreStocks$/i, ""),
      mint: r.contract_address ?? bundled?.mint ?? null,
      url: r.external_url ?? bundled?.url ?? null,
      markPrice: mark,
      tokenPrice: token,
      premium: mark > 0 ? token / mark - 1 : 0,
      markValuation: r.markValuation ?? null,
    });
  } catch (e) {
    if (bundled) {
      return NextResponse.json({
        issuer: true, live: false,
        symbol: bundled.symbol, name: bundled.name, mint: bundled.mint, url: bundled.url,
        markPrice: bundled.markPrice, tokenPrice: bundled.tokenPrice,
        premium: bundled.markPrice > 0 ? bundled.tokenPrice / bundled.markPrice - 1 : 0,
        markValuation: bundled.markValuation,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
    return NextResponse.json({ issuer: true, unavailable: true, reason: e instanceof Error ? e.message : String(e) });
  }
}
