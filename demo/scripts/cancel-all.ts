// Cancel every resting order on the given markets, so a book can be re-seeded at a new level.
//
// Needed when a listing's opening price changes materially — the PreStocks catalogue put OpenAI at
// ~1004 where the book had been seeded at 350. Left alone the maker would quote the new level while
// the old orders still rested at the old one, and the venue would spend a while visibly crossed
// while it matched its way out. Clearing first is faster and never shows a broken-looking book.
//
// Only cancels orders owned by the venue's own demo identities; anything a visitor placed is left
// exactly where it is.
//
// Run from demo/:  npx tsx scripts/cancel-all.ts               (every market)
//                  npx tsx scripts/cancel-all.ts OPENAI ANTHRO (named markets)
import "../src/lib/polyfill";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Tree, keys, type AccountReader } from "torna-sdk";
import { ASK, BID, cancelIx, type Side } from "../src/lib/orderbook";
import { LISTINGS } from "../src/lib/listings";

const V = JSON.parse(readFileSync(join(import.meta.dirname, "../src/lib/venue.json"), "utf8"));
const conn = new Connection(process.env.RPC ?? V.rpcUrl, "confirmed");
const TORNA = new PublicKey(V.tornaProgramId);
const ORDERBOOK = new PublicKey(V.orderbookProgramId);
const CREATOR = new PublicKey(V.creator);

const reader: AccountReader = {
  async accountData(k: PublicKey) { const a = await conn.getAccountInfo(k, "confirmed"); return a ? Uint8Array.from(a.data) : null; },
};
const demos: Keypair[] = V.demos.map((d: { secret: number[] }) => Keypair.fromSecretKey(Uint8Array.from(d.secret)));
const byPk = new Map(demos.map((k) => [k.publicKey.toBase58(), k]));
const ata = (mint: string, owner: PublicKey) => getAssociatedTokenAddressSync(new PublicKey(mint), owner, true);

async function main() {
  const want = process.argv.slice(2).map((s) => s.toUpperCase());
  const targets = LISTINGS.filter((l) => V.markets[l.symbol] && (!want.length || want.includes(l.symbol)));
  if (!targets.length) throw new Error("no provisioned markets matched");

  for (const L of targets) {
    const m = V.markets[L.symbol];
    let cancelled = 0, skipped = 0;
    for (const side of [ASK, BID] as Side[]) {
      const treeId = side === ASK ? m.askTreeId : m.bidTreeId;
      const tree = new Tree(TORNA, CREATOR, treeId);
      const sd = side === ASK ? keys.Side.Ask : keys.Side.Bid;
      // re-scan each pass: cancelling mutates the tree, so a single snapshot goes stale
      for (let pass = 0; pass < 12; pass++) {
        const rows = (await tree.scan(reader, 64))
          .map((e) => {
            const dv = new DataView(e.value.buffer, e.value.byteOffset, e.value.byteLength);
            return { key: e.key, size: dv.getBigUint64(32, false), maker: new PublicKey(e.value.subarray(0, 32)).toBase58(), price: keys.priceOf(sd, e.key) };
          })
          .filter((o) => o.size > 0n && byPk.has(o.maker));
        if (!rows.length) break;
        for (const o of rows) {
          const maker = byPk.get(o.maker)!;
          try {
            const ix = await cancelIx({
              reader, tree, orderbook: ORDERBOOK, torna: TORNA, marketId: BigInt(m.marketId),
              side, key: o.key, maker: maker.publicKey, vault: new PublicKey(side === ASK ? m.baseVault : m.quoteVault),
              makerDst: ata(side === ASK ? m.baseMint : V.quoteMint, maker.publicKey),
            });
            await sendAndConfirmTransaction(conn, new Transaction().add(ix), [maker], { commitment: "confirmed" });
            cancelled++;
          } catch { skipped++; }
        }
      }
    }
    console.log(`${L.symbol.padEnd(8)} cancelled ${cancelled}${skipped ? `, ${skipped} skipped` : ""}`);
  }
  console.log("\ndone — the maker will re-seed at the new level on its next tick");
}
main().catch((e) => { console.error(e); process.exit(1); });
