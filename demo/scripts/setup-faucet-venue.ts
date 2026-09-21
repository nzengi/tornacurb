// One-time: create a dedicated FAUCET keypair, fund it with SOL, and move the QUOTE mint authority
// from the deployer (id.json) to it. The faucet API route then mints mock USDC to a connected
// wallet using ONLY this key — id.json (upgrade authority + main funds) never touches the app.
//
// The base mints stay under the deployer's authority on purpose: the faucet hands out cash, never
// shares, so it never needs to mint a listing.
//
// Run from demo/:  npx tsx scripts/setup-faucet-venue.ts
// Fund a different amount:  FAUCET_SOL=0.5 npx tsx scripts/setup-faucet-venue.ts
import "../src/lib/polyfill";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { setAuthority, AuthorityType } from "@solana/spl-token";

const V = JSON.parse(readFileSync(join(import.meta.dirname, "../src/lib/venue.json"), "utf8"));
const conn = new Connection(process.env.RPC ?? V.rpcUrl, "confirmed");
const id = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(), ".config/solana/id.json"), "utf8"))));
const faucetPath = join(import.meta.dirname, "../deploy/faucet-keypair.json");
const TARGET = Math.round(Number(process.env.FAUCET_SOL ?? "0.3") * 1e9);

async function main() {
  if (!V.quoteMint) throw new Error("venue.json has no quoteMint — run scripts/bringup-venue.ts first");

  const faucet = existsSync(faucetPath)
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(faucetPath, "utf8"))))
    : Keypair.generate();
  if (!existsSync(faucetPath)) writeFileSync(faucetPath, JSON.stringify(Array.from(faucet.secretKey)));
  console.log("faucet:", faucet.publicKey.toBase58());

  const bal = await conn.getBalance(faucet.publicKey);
  if (bal < TARGET) {
    const top = TARGET - bal;
    const mine = await conn.getBalance(id.publicKey);
    if (mine < top + 50_000_000) throw new Error(`deployer has ${(mine / 1e9).toFixed(3)} SOL, needs ${(top / 1e9).toFixed(3)} for the faucet + a reserve`);
    await sendAndConfirmTransaction(conn, new Transaction().add(
      SystemProgram.transfer({ fromPubkey: id.publicKey, toPubkey: faucet.publicKey, lamports: top }),
    ), [id], { commitment: "confirmed" });
    console.log(`funded faucet to ${(TARGET / 1e9).toFixed(3)} SOL`);
  } else {
    console.log("faucet already funded:", bal / 1e9, "SOL");
  }

  // move QUOTE mint authority from id.json to the faucet (mint layout: authority option(4) then pubkey)
  const info = await conn.getAccountInfo(new PublicKey(V.quoteMint));
  const currentAuth = info ? new PublicKey(info.data.slice(4, 36)) : null;
  if (currentAuth && currentAuth.equals(faucet.publicKey)) {
    console.log("quote mint authority already = faucet");
  } else {
    await setAuthority(conn, id, new PublicKey(V.quoteMint), id, AuthorityType.MintTokens, faucet.publicKey);
    console.log("quote mint authority -> faucet");
  }

  console.log("\nDONE. deploy/faucet-keypair.json written. For hosting, set FAUCET_SECRET to its JSON array.");
}
main().catch((e) => { console.error(e); process.exit(1); });
