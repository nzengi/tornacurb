// Resolve Pyth price-feed ids for the listed tickers and write them to src/lib/pyth-feeds.json.
//
// Feed ids are 32-byte hashes — hand-copying one is how you end up marking your NVDA book against
// SPYG. This asks Hermes for the exact `Equity.US.<SYM>/USD` symbol and refuses anything else, so
// the file is only ever machine-written. Hermes' metadata endpoint is open; only the PRICE endpoint
// needs a key, so this runs with no credentials.
//
// Run from demo/:  npx tsx scripts/resolve-pyth-feeds.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LISTINGS, listed } from "../src/lib/listings";

const HERMES = process.env.HERMES_URL ?? "https://hermes.pyth.network";

interface FeedRow { id: string; attributes: { symbol: string; description?: string; asset_type?: string } }

async function resolve(sym: string): Promise<{ id: string; symbol: string; description?: string }> {
  const url = `${HERMES}/v2/price_feeds?query=${encodeURIComponent(sym)}&asset_type=equity`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hermes ${res.status} for ${sym}`);
  const rows = (await res.json()) as FeedRow[];
  const want = `Equity.US.${sym}/USD`;
  const hit = rows.find((r) => r.attributes.symbol === want);
  if (!hit) {
    const near = rows.map((r) => r.attributes.symbol).join(", ") || "(none)";
    throw new Error(`no feed named ${want}; hermes offered: ${near}`);
  }
  return { id: hit.id, symbol: hit.attributes.symbol, description: hit.attributes.description };
}

// A feed the free Pyth tier IS entitled to. Equity feeds need a Pyth Pro grant, so without one the
// mark line would be a dead panel and a reader could not tell a broken integration from an
// unentitled one. Probing a feed we can read proves the client, the auth header and the parsing all
// work, and isolates the gap to entitlement.
const PROBE = "Crypto.BTC/USD";

async function resolveExact(symbol: string, assetType: string): Promise<{ id: string; symbol: string; description?: string }> {
  const q = symbol.split(".").slice(-1)[0].split("/")[0];
  const res = await fetch(`${HERMES}/v2/price_feeds?query=${encodeURIComponent(q)}&asset_type=${assetType}`);
  if (!res.ok) throw new Error(`hermes ${res.status} for ${symbol}`);
  const rows = (await res.json()) as FeedRow[];
  const hit = rows.find((r) => r.attributes.symbol === symbol);
  if (!hit) throw new Error(`no feed named ${symbol}`);
  return { id: hit.id, symbol: hit.attributes.symbol, description: hit.attributes.description };
}

async function main() {
  const out: Record<string, { id: string; symbol: string; description?: string }> = {};
  for (const l of listed()) {
    const r = await resolve(l.symbol);
    out[l.symbol] = r;
    console.log(`${l.symbol.padEnd(6)} ${r.id}  ${r.symbol}`);
  }
  // Pre-IPO names that Pyth does index. Recording the real feed id keeps the site's claim about
  // them checkable rather than asserted — and if the indices grant ever lands, the mark is already
  // wired to the right feed.
  for (const l of LISTINGS.filter((x) => x.pythIndexName)) {
    const sym = `Equity.Index.${l.pythIndexName}/USD`;
    try {
      const r = await resolveExact(sym, "equity");
      out[l.symbol] = r;
      console.log(`${l.symbol.padEnd(6)} ${r.id}  ${r.symbol}`);
    } catch (e) {
      console.warn(`${l.symbol.padEnd(6)} no index feed (${(e as Error).message})`);
    }
  }

  const probe = await resolveExact(PROBE, "crypto");
  out._probe = probe;
  console.log(`${"_probe".padEnd(6)} ${probe.id}  ${probe.symbol}`);

  const path = join(import.meta.dirname, "../src/lib/pyth-feeds.json");
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${Object.keys(out).length} feeds -> src/lib/pyth-feeds.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
