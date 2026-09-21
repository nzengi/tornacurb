// Read every provisioned market's book straight off the on-chain B+ trees and print the ladder.
// This is the end-to-end check that bring-up actually produced tradeable markets — not that the
// script exited 0, but that the orders are really in the trees and readable by the same code path
// the UI uses.  Run from demo/:  npx tsx scripts/verify-venue.ts
import "../src/lib/polyfill";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import { Tree, keys, type AccountReader } from "torna-sdk";
import { LISTINGS } from "../src/lib/listings";

const V = JSON.parse(readFileSync(join(import.meta.dirname, "../src/lib/venue.json"), "utf8"));
const conn = new Connection(process.env.RPC ?? V.rpcUrl, "confirmed");
const reader: AccountReader = {
  async accountData(k: PublicKey) { const a = await conn.getAccountInfo(k, "confirmed"); return a ? Uint8Array.from(a.data) : null; },
};

const side = (s: "ask" | "bid") => (s === "ask" ? keys.Side.Ask : keys.Side.Bid);

async function ladder(treeId: number, s: "ask" | "bid") {
  const t = new Tree(new PublicKey(V.tornaProgramId), new PublicKey(V.creator), treeId);
  const rows = await t.scan(reader, 32);
  return rows
    .map((e) => {
      const dv = new DataView(e.value.buffer, e.value.byteOffset, e.value.byteLength);
      return { price: keys.priceOf(side(s), e.key), size: dv.getBigUint64(32, false) };
    })
    .filter((o) => o.size > 0n);
}

async function main() {
  let ok = 0, bad = 0;
  for (const L of LISTINGS) {
    const m = V.markets[L.symbol];
    if (!m) { console.log(`${L.symbol.padEnd(8)} NOT PROVISIONED`); bad++; continue; }
    try {
      const [asks, bids] = await Promise.all([ladder(m.askTreeId, "ask"), ladder(m.bidTreeId, "bid")]);
      const bestAsk = asks[0]?.price, bestBid = bids[0]?.price;
      const spread = bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : undefined;
      const health = asks.length && bids.length ? "ok" : "THIN";
      console.log(
        `${L.symbol.padEnd(8)} ${health.padEnd(5)} bid ${String(bestBid ?? "-").padStart(5)} / ask ${String(bestAsk ?? "-").padEnd(5)}` +
        ` spread ${String(spread ?? "-").padStart(4)}  (${bids.length} bid lvl, ${asks.length} ask lvl)  market ${m.marketId}`,
      );
      if (health === "ok") ok++; else bad++;
    } catch (e) {
      console.log(`${L.symbol.padEnd(8)} READ FAILED: ${(e as Error).message}`);
      bad++;
    }
  }
  console.log(`\n${ok} healthy, ${bad} not`);
  if (bad) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
