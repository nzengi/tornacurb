// One-time (and safe to re-run): give the market maker its own identities, so the quotes that keep
// the book alive are not signed by the public demo traders -- whose secrets ship in venue.json, and
// whose orders any visitor can therefore cancel.
//
// Creates (or reuses) deploy/mm-makers.json -- N secret keys, gitignored -- and tops each identity
// up to a target: SOL from the deployer (id.json), shares minted by the deployer (it keeps the base
// mint authority), cash minted by the faucet key (it holds the quote mint authority, see
// setup-faucet-venue.ts). Nothing is taken from the demo traders.
//
// Run from demo/:  npx tsx scripts/setup-mm-makers.ts            (2 identities)
//                  MM_COUNT=3 npx tsx scripts/setup-mm-makers.ts
// Then:
//   1. vercel env add MM_MAKERS production < deploy/mm-makers.json   (and redeploy)
//   2. npx tsx scripts/cancel-all.ts   -- clears the quotes the demo traders still hold, which the
//      maker no longer owns and so would never re-quote or prune
import "../src/lib/polyfill";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const V = JSON.parse(readFileSync(join(import.meta.dirname, "../src/lib/venue.json"), "utf8"));
const conn = new Connection(process.env.RPC ?? V.rpcUrl, "confirmed");
const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const id = load(join(homedir(), ".config/solana/id.json"));
const faucetPath = join(import.meta.dirname, "../deploy/faucet-keypair.json");
const outPath = join(import.meta.dirname, "../deploy/mm-makers.json");

const COUNT = Number(process.env.MM_COUNT ?? 2);
// Targets per identity. A tick quotes 3 levels a side at 25-70 shares, so ~200 shares and, on the
// bid side, ~200 x price in cash are escrowed per listing at a time, plus the churn of re-quoting.
const SOL = 50_000_000;            // 0.05 SOL: a few thousand devnet fees
const SHARES = 2_000n;             // per listing
const CASH = 50_000_000n;          // quote atoms, shared across every listing's bids

async function main() {
  if (COUNT < 2) throw new Error("the maker needs at least two identities (uncrossing takes with a second one)");
  if (!existsSync(faucetPath)) throw new Error("deploy/faucet-keypair.json not found -- it holds the quote mint authority");
  const faucet = load(faucetPath);

  const secrets: number[][] = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
  while (secrets.length < COUNT) secrets.push(Array.from(Keypair.generate().secretKey));
  writeFileSync(outPath, JSON.stringify(secrets), { mode: 0o600 });
  const makers = secrets.map((s) => Keypair.fromSecretKey(Uint8Array.from(s)));

  const held = async (mint: PublicKey, owner: PublicKey) => {
    const ata = (await getOrCreateAssociatedTokenAccount(conn, id, mint, owner)).address;
    return { ata, amount: (await getAccount(conn, ata)).amount };
  };

  for (const m of makers) {
    console.log("maker", m.publicKey.toBase58());
    const sol = await conn.getBalance(m.publicKey);
    if (sol < SOL) {
      await sendAndConfirmTransaction(conn, new Transaction().add(
        SystemProgram.transfer({ fromPubkey: id.publicKey, toPubkey: m.publicKey, lamports: SOL - sol }),
      ), [id], { commitment: "confirmed" });
      console.log(`  SOL -> ${SOL / 1e9}`);
    }
    const cash = await held(new PublicKey(V.quoteMint), m.publicKey);
    if (cash.amount < CASH) {
      await mintTo(conn, id, new PublicKey(V.quoteMint), cash.ata, faucet, CASH - cash.amount);
      console.log(`  cash -> ${CASH}`);
    }
    for (const [symbol, mk] of Object.entries(V.markets as Record<string, { baseMint: string }>)) {
      const shares = await held(new PublicKey(mk.baseMint), m.publicKey);
      if (shares.amount < SHARES) {
        await mintTo(conn, id, new PublicKey(mk.baseMint), shares.ata, id, SHARES - shares.amount);
        console.log(`  ${symbol} shares -> ${SHARES}`);
      }
    }
  }

  console.log(`\nDONE. ${makers.length} maker identities in deploy/mm-makers.json (keep it out of git and chat).`);
  console.log("Next: vercel env add MM_MAKERS production < deploy/mm-makers.json, redeploy,");
  console.log("then npx tsx scripts/cancel-all.ts to clear the quotes the demo traders still hold.");
}
main().catch((e) => { console.error(e); process.exit(1); });
