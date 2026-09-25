// The identities the market maker quotes with.
//
// The demo traders' secrets ship in venue.json on purpose: the browser signs with them, so anyone
// can trade without a wallet. That also means anyone can cancel an order they own or move their
// tokens -- fine for a visitor's order, not for the quotes that make the book look alive. So the
// maker quotes from its own identities, kept out of the bundle in MM_MAKERS (a JSON array of secret
// keys, written by scripts/setup-mm-makers.ts). Without it the maker falls back to the demo traders,
// which is how the venue ran before.
//
// Server/script-only: MM_MAKERS must never reach the client bundle.
import { Keypair } from "@solana/web3.js";
import venue from "./venue.json";

export function mmMakers(raw: string | undefined = process.env.MM_MAKERS): Keypair[] {
  if (raw) {
    let secrets: number[][];
    try { secrets = JSON.parse(raw); } catch { throw new Error("MM_MAKERS is not valid JSON"); }
    // two at least: uncrossing the book takes the top order with a maker other than its owner
    if (!Array.isArray(secrets) || secrets.length < 2) throw new Error("MM_MAKERS needs at least two secret keys");
    return secrets.map((s) => Keypair.fromSecretKey(Uint8Array.from(s)));
  }
  return (venue.demos as { secret: number[] }[]).map((d) => Keypair.fromSecretKey(Uint8Array.from(d.secret)));
}
