// Pull the PreStocks catalogue and write it to src/lib/prestocks.json.
//
// Every pre-IPO name on this venue is a PreStocks token, so their API — not our guesses — is the
// source for what exists, what it is worth, and which mint it lives at on mainnet. Seeding a book
// at a price we invented, when the issuer publishes one, is exactly the kind of detail that tells
// a reader we never looked at their product.
//
// The API returns two prices per token and the gap between them is the venue's whole argument:
//   markPrice   what the SPV says the underlying private company is worth
//   tokenPrice  what the token itself actually changes hands at
// A thin secondary market lets those drift apart. An order book is how they get pulled back.
//
// Run from demo/:  npx tsx scripts/resolve-prestocks.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const API = process.env.PRESTOCKS_API ?? "https://prestocks.com/api/prestocks";

interface ApiRow {
  name: string; symbol: string; description?: string; image?: string; external_url?: string;
  contract_address?: string; markPrice?: number; tokenPrice?: number;
  markValuation?: number; impliedValuation?: number; supply?: number;
}

export interface PreStock {
  symbol: string; name: string; mint: string;
  markPrice: number; tokenPrice: number;
  markValuation: number | null; impliedValuation: number | null;
  url: string | null; image: string | null;
}

async function main() {
  const res = await fetch(API, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`prestocks api ${res.status}`);
  const rows = (await res.json()) as ApiRow[];
  if (!Array.isArray(rows) || !rows.length) throw new Error("prestocks api returned nothing");

  const out: Record<string, PreStock> = {};
  for (const r of rows) {
    if (!r.symbol || typeof r.markPrice !== "number") {
      console.warn(`skipping malformed row: ${JSON.stringify(r).slice(0, 80)}`);
      continue;
    }
    out[r.symbol] = {
      symbol: r.symbol,
      name: r.name?.replace(/\s+PreStocks$/i, "") ?? r.symbol,
      mint: r.contract_address ?? "",
      markPrice: r.markPrice,
      tokenPrice: typeof r.tokenPrice === "number" ? r.tokenPrice : r.markPrice,
      markValuation: r.markValuation ?? null,
      impliedValuation: r.impliedValuation ?? null,
      url: r.external_url ?? null,
      image: r.image ?? null,
    };
    const prem = ((out[r.symbol].tokenPrice / out[r.symbol].markPrice) - 1) * 100;
    console.log(`${r.symbol.padEnd(12)} mark ${out[r.symbol].markPrice.toFixed(2).padStart(9)}  token ${out[r.symbol].tokenPrice.toFixed(2).padStart(9)}  ${prem >= 0 ? "+" : ""}${prem.toFixed(1)}%  ${out[r.symbol].mint}`);
  }

  const path = join(import.meta.dirname, "../src/lib/prestocks.json");
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${Object.keys(out).length} tokens -> src/lib/prestocks.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
