// Server-side read of a live book, one listing at a time, shared by /api/book and by the pages that
// render a first snapshot into their HTML (so the book shows prices before any client script runs).
//
// The browser polls /api/book, not the RPC, so many viewers share one upstream read per TTL (a
// load-balancer effect) and the RPC is never hit "constantly". The RPC is server-only (RPC_URL env,
// defaults to public devnet) so no key is exposed to the browser.
//
// The cache is keyed by symbol: each listing gets its own snapshot and its own TTL, so a viewer
// sitting on OPENAI never forces a re-read of the other listings.
//
// Server-only: import it from route handlers and server components, never from a "use client" file.
import { Connection, PublicKey } from "@solana/web3.js";
import { Tree, keys, type AccountReader } from "torna-sdk";
import venue from "@/lib/venue.json";
import { bySymbol } from "@/lib/listings";

const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const TTL_MS = 10_000;

const conn = new Connection(RPC, "confirmed");
// A second endpoint for when the first is rate-limiting. The dedicated RPC's per-second budget is
// shared with everything else server-side, so a busy moment elsewhere used to surface here as an
// empty "loading" book. Public devnet is slower but separately budgeted: better than no book.
const PUBLIC = "https://api.devnet.solana.com";
const fallbackConn = RPC !== PUBLIC ? new Connection(PUBLIC, "confirmed") : null;

// The RPC's free tier limits requests per second, and reading two trees is a burst of account
// fetches. A cold instance with nothing cached used to pass that straight through, which surfaced in
// the UI as a raw JSON-RPC error where the order book should be — the worst place to show one.
// Retrying briefly costs a moment; a book that says "rate limited" costs the reader's trust.
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let wait = 250;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      const transient = msg.includes("429") || msg.includes("-32429") || msg.toLowerCase().includes("rate limit");
      if (i >= attempts || !transient) throw e;
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
    }
  }
}
const readerOf = (c: Connection): AccountReader => ({
  async accountData(k) { const a = await c.getAccountInfo(k, "confirmed"); return a ? Uint8Array.from(a.data) : null; },
});
const readers = [readerOf(conn), ...(fallbackConn ? [readerOf(fallbackConn)] : [])];

export interface OrderJSON { price: string; size: string; maker: string; keyHex: string }
function decode(side: typeof keys.Side.Ask | typeof keys.Side.Bid, e: { key: Uint8Array; value: Uint8Array }): OrderJSON {
  const dv = new DataView(e.value.buffer, e.value.byteOffset, e.value.byteLength);
  return {
    price: keys.priceOf(side, e.key).toString(),
    size: dv.getBigUint64(32, false).toString(),
    maker: new PublicKey(e.value.subarray(0, 32)).toBase58(),
    keyHex: Buffer.from(e.key).toString("hex"),
  };
}
async function scanSide(tree: Tree, side: typeof keys.Side.Ask | typeof keys.Side.Bid): Promise<OrderJSON[]> {
  let last: unknown;
  for (const r of readers) {
    try {
      const rows = await withRetry(() => tree.scan(r, 64));
      return rows.map((e) => decode(side, e)).filter((o) => o.size !== "0");
    } catch (e) { last = e; }
  }
  throw last;
}

export type Snap = { asks: OrderJSON[]; bids: OrderJSON[] };
const cache = new Map<string, { at: number; data: Snap }>();

export type BookRead =
  | { kind: "ok"; data: Snap; fresh: boolean }
  | { kind: "unknown" }
  | { kind: "retrying" };

/** The book for `symbol`: a cached snapshot inside the TTL, else a fresh read. On a transient RPC
 *  error the last good snapshot is served (fresh: false); with none, the caller is told to retry. */
export async function readBook(symbol: string): Promise<BookRead> {
  const listing = bySymbol(symbol);
  const state = listing && (venue.markets as Record<string, { askTreeId: number; bidTreeId: number }>)[listing.symbol];
  if (!listing || !state) return { kind: "unknown" };

  const hit = cache.get(listing.symbol);
  if (hit && Date.now() - hit.at < TTL_MS) return { kind: "ok", data: hit.data, fresh: true };
  try {
    const torna = new PublicKey(venue.tornaProgramId);
    const creator = new PublicKey(venue.creator);
    // sequential, not parallel: two concurrent tree walks are what trips the per-second limit
    const asks = await scanSide(new Tree(torna, creator, state.askTreeId), keys.Side.Ask);
    const bids = await scanSide(new Tree(torna, creator, state.bidTreeId), keys.Side.Bid);
    const data: Snap = { asks, bids };
    cache.set(listing.symbol, { at: Date.now(), data });
    return { kind: "ok", data, fresh: true };
  } catch (e) {
    // serve the last good snapshot on a transient RPC error (e.g. a 429), instead of failing the UI
    if (hit) return { kind: "ok", data: hit.data, fresh: false };
    console.error("book read failed:", e);
    return { kind: "retrying" };
  }
}

/** A first snapshot to render into a page's HTML, or null if the chain could not be read right now
 *  (the page then renders as before and the client fills the book in). Never throws: a page render,
 *  or a build, must not fail because the RPC is busy. */
export async function initialBook(symbol: string): Promise<(Snap & { symbol: string }) | null> {
  try {
    const r = await readBook(symbol);
    return r.kind === "ok" ? { symbol, ...r.data } : null;
  } catch {
    return null;
  }
}
