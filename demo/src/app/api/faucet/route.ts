// Devnet faucet: mints mock USDC (+ a little SOL for fees) to a connected wallet so a juror can
// trade with their OWN wallet. Signs ONLY with the dedicated FAUCET key (never id.json).
// Server-only (nodejs). Set FAUCET_SECRET in prod; locally reads deploy/faucet-keypair.json.
//
// Venue note: the faucet dispenses CASH ONLY, never shares. You arrive with USDC and buy stock
// from the book like anywhere else — which is both the honest market flow and the only thing that
// fits in one transaction (8 listings x ATA+mintTo would blow the 1232-byte tx limit). The seeded
// maker identities hold the inventory on the ask side, so there is always something to buy.
//
// Hardening (adversarial review, 2 rounds): single atomic tx; idempotent on the quote balance;
// a reserve floor (incl. rent) so the faucet can never be fully drained; a per-instance daily
// lamport budget; per-dest + per-IP + global cooldowns recorded before the spend and ROLLED BACK on
// no-spend branches; generic client errors. NOTE: the cooldown/daily limiters are in-memory (per
// process); on a SERVERLESS deploy move them to shared storage (Upstash/KV) and read the client IP
// from the platform's TRUSTED signal (x-forwarded-for's left hop is spoofable). The reserve floor
// reads on-chain balance so it is shared and remains the real anti-drain backstop.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction,
  getAssociatedTokenAddressSync, getAccount,
} from "@solana/spl-token";
import venue from "@/lib/venue.json";

export const runtime = "nodejs";

const QUOTE_AMT = 1_000_000n;             // mock USDC, enough to buy across several listings
// 0.012 SOL: fees, plus the rent for the share accounts a first buy opens (~0.002 SOL each, one per
// listing bought). At 0.002 a fresh wallet could take cash but never open an account to buy into.
const SOL_LAMPORTS = 12_000_000;
const ATA_RENT = 2_040_000;               // rent for the one token account the faucet may create
const CALL_COST = SOL_LAMPORTS + ATA_RENT + 10_000; // true per-call cost (incl. rent + fee)
const RESERVE_LAMPORTS = 100_000_000;     // never dispense below 0.1 SOL
const MAX_DAILY_LAMPORTS = 1_000_000_000; // per-instance daily dispense cap (~1 SOL/day)
const DEST_COOLDOWN_MS = 5 * 60_000;      // one top-up per wallet / 5 min
const IP_COOLDOWN_MS = 30_000;            // one request per IP / 30s
const GLOBAL_MAX_PER_MIN = 30;            // hard global rate cap
const FUNDED_QUOTE = 500_000n;            // "already funded" threshold (skip re-fund)

function faucetKey(): Keypair {
  const env = process.env.FAUCET_SECRET;
  const raw = env ? JSON.parse(env) : JSON.parse(readFileSync(join(process.cwd(), "deploy/faucet-keypair.json"), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// in-memory limiters (per process, see header note)
const destSeen = new Map<string, number>();
const ipSeen = new Map<string, number>();
let globalHits: { t: number }[] = [];
let dayStart = 0;
let daySpent = 0;

// The RPC rate-limits per second, and a 429 is the provider saying "not this instant", not "no".
// The book and the RPC proxy already absorb it; the faucet passed it straight to the visitor as
// "faucet unavailable" on the first busy moment, so retry transient failures briefly here too.
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let wait = 300;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      const transient = msg.includes("429") || msg.includes("-32429") || msg.toLowerCase().includes("rate limit")
        || msg.toLowerCase().includes("fetch failed") || msg.includes("503") || msg.includes("502");
      if (i >= attempts || !transient) throw e;
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
    }
  }
}

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
const tooSoon = (m: Map<string, number>, k: string, ms: number, now: number) => now - (m.get(k) ?? 0) < ms;

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 1024) return NextResponse.json({ error: "bad request" }, { status: 413 });
  if (!venue.quoteMint) return NextResponse.json({ error: "venue not provisioned" }, { status: 503 });

  let dest: PublicKey;
  try {
    const { pubkey } = await req.json();
    dest = new PublicKey(pubkey);
  } catch {
    return NextResponse.json({ error: "invalid pubkey" }, { status: 400 });
  }
  const destStr = dest.toBase58();

  const now = Date.now();
  const ip = clientIp(req);
  globalHits = globalHits.filter((h) => now - h.t < 60_000);
  if (now - dayStart > 86_400_000) { dayStart = now; daySpent = 0; }
  if (globalHits.length >= GLOBAL_MAX_PER_MIN) return NextResponse.json({ error: "faucet busy, try again shortly" }, { status: 429 });
  if (tooSoon(ipSeen, ip, IP_COOLDOWN_MS, now)) return NextResponse.json({ error: "rate limited, wait a moment" }, { status: 429 });
  if (tooSoon(destSeen, destStr, DEST_COOLDOWN_MS, now)) return NextResponse.json({ error: "this wallet was funded recently" }, { status: 429 });
  if (daySpent + CALL_COST > MAX_DAILY_LAMPORTS) return NextResponse.json({ error: "faucet daily limit reached" }, { status: 503 });

  // reserve ALL limiters (incl. the daily budget) BEFORE spending so concurrent/retry spam can't
  // bypass the windows. globalHits uses an object so rollback removes THIS entry by identity (not
  // LIFO, which could pop a concurrent request's slot).
  const myHit = { t: now };
  destSeen.set(destStr, now);
  ipSeen.set(ip, now);
  globalHits.push(myHit);
  daySpent += CALL_COST;
  const rollback = () => {
    destSeen.delete(destStr);
    const i = globalHits.indexOf(myHit);
    if (i >= 0) globalHits.splice(i, 1);
    daySpent = Math.max(0, daySpent - CALL_COST); // clamp: a 24h reset between reserve+rollback can't go negative
  };

  try {
    // server-only route, so prefer the server-only endpoint: a dedicated RPC key belongs in
    // RPC_URL, never in NEXT_PUBLIC_* which ships to every visitor's browser
    const conn = new Connection(process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || venue.rpcUrl, "confirmed");
    const faucet = faucetKey();
    const quoteMint = new PublicKey(venue.quoteMint);
    const quoteAta = getAssociatedTokenAddressSync(quoteMint, dest);

    // idempotent: skip if the wallet still holds cash. A trader who spent it all on shares can
    // re-fund, which is the point. A missing ATA reads as 0.
    const amt = async (a: PublicKey) => { try { return (await withRetry(() => getAccount(conn, a))).amount; } catch { return 0n; } };
    if ((await amt(quoteAta)) >= FUNDED_QUOTE) {
      rollback();
      return NextResponse.json({ alreadyFunded: true });
    }

    // reserve floor: never drain below 0.1 SOL (true per-call cost incl. rent)
    if (await withRetry(() => conn.getBalance(faucet.publicKey)) < RESERVE_LAMPORTS + CALL_COST) {
      rollback();
      return NextResponse.json({ error: "faucet temporarily out of funds" }, { status: 503 });
    }

    // ONE atomic tx: create the ATA (idempotent) + mint cash + transfer SOL, all-or-nothing
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(faucet.publicKey, quoteAta, dest, quoteMint),
      createMintToInstruction(quoteMint, quoteAta, faucet.publicKey, QUOTE_AMT),
      SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: dest, lamports: SOL_LAMPORTS }),
    );
    // send, then confirm by polling signature status: sendAndConfirmTransaction waits on the RPC's
    // websocket, which a serverless function cannot rely on (the browser path already polls, for the
    // same reason). Re-sending a signed transaction after a 429 is safe: it has one signature.
    const { blockhash, lastValidBlockHeight } = await withRetry(() => conn.getLatestBlockhash("confirmed"));
    tx.recentBlockhash = blockhash;
    tx.feePayer = faucet.publicKey;
    tx.sign(faucet);
    const sig = await withRetry(() => conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 }));
    for (;;) {
      const st = (await withRetry(() => conn.getSignatureStatuses([sig]))).value[0];
      if (st?.err) throw new Error(`faucet tx failed: ${JSON.stringify(st.err)}`);
      if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") break;
      if ((await withRetry(() => conn.getBlockHeight("confirmed"))) > lastValidBlockHeight) throw new Error("faucet tx expired");
      await new Promise((r) => setTimeout(r, 800));
    }
    return NextResponse.json({ sig, quote: QUOTE_AMT.toString(), sol: SOL_LAMPORTS / 1e9 });
  } catch (e) {
    rollback(); // the spend didn't land; don't burn the user's dest cooldown
    console.error("faucet error:", e);
    return NextResponse.json({ error: "faucet unavailable, try again" }, { status: 500 });
  }
}
