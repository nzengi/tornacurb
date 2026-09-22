// Server-side Solana RPC proxy for the browser.
//
// The venue's dedicated RPC key lives in RPC_URL, which never ships to the client — anything in
// NEXT_PUBLIC_* is bundled into the page and readable by every visitor. So the browser cannot use
// it directly, and falling back to public devnet means a 429 the moment anyone opens the explorer
// (a tree walk is dozens of account reads) or tries to trade. Routing the browser's Connection
// through here gives it the good endpoint without ever exposing the key.
//
// This is deliberately NOT an open relay:
//   - only the methods this app actually calls are forwarded; anything else is refused
//   - per-IP rate limiting, so one visitor cannot burn the venue's monthly credits
//   - batch size is capped
//
// NOTE: the limiter is in-memory and therefore per serverless instance, which makes it a speed
// bump rather than a guarantee. The method whitelist is the real constraint: every allowed method
// is a read, or a send of an already-signed transaction, so the worst case is wasted credits.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = process.env.RPC_URL || "https://api.devnet.solana.com";

// Everything the venue calls, and nothing else. Subscriptions are not here: they are websocket,
// which this proxy does not carry.
const ALLOWED = new Set([
  "getAccountInfo", "getMultipleAccounts", "getBalance", "getTransaction",
  "getSignaturesForAddress", "getSignatureStatuses", "getLatestBlockhash",
  "getMinimumBalanceForRentExemption", "getSlot", "getBlockHeight",
  "sendTransaction", "simulateTransaction", "getFeeForMessage", "getTokenAccountBalance",
  "getVersion", "getGenesisHash", "getEpochInfo",
]);

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;      // generous: one explorer page load is dozens of reads
const MAX_BATCH = 100;

const hits = new Map<string, { n: number; at: number }>();
const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

function overLimit(ip: string, cost: number): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now - cur.at > WINDOW_MS) { hits.set(ip, { n: cost, at: now }); return false; }
  cur.n += cost;
  return cur.n > MAX_PER_WINDOW;
}

type RpcCall = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };

export async function POST(req: Request) {
  let body: RpcCall | RpcCall[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const calls = Array.isArray(body) ? body : [body];
  if (calls.length > MAX_BATCH) {
    return NextResponse.json({ error: "batch too large" }, { status: 413 });
  }

  const bad = calls.find((c) => typeof c?.method !== "string" || !ALLOWED.has(c.method as string));
  if (bad) {
    // a JSON-RPC shaped refusal, so web3.js surfaces it as a method error rather than a parse failure
    return NextResponse.json(
      { jsonrpc: "2.0", id: bad.id ?? null, error: { code: -32601, message: `method not allowed: ${String(bad.method)}` } },
      { status: 200 },
    );
  }

  if (overLimit(clientIp(req), calls.length)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: calls[0]?.id ?? null, error: { code: 429, message: "rate limited by the venue proxy" } },
      { status: 429 },
    );
  }

  try {
    const res = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: calls[0]?.id ?? null, error: { code: -32603, message: e instanceof Error ? e.message : "upstream failed" } },
      { status: 502 },
    );
  }
}
