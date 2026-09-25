// Cached server read of a live book, one market at a time: GET /api/book?symbol=OPENAI
// The read and its cache live in lib/book-server.ts, which the pages also use for their first render.
import { NextResponse } from "next/server";
import { readBook } from "@/lib/book-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  const r = await readBook(symbol);
  if (r.kind === "unknown") {
    return NextResponse.json({ asks: [], bids: [], error: `unknown or unprovisioned market "${symbol}"` }, { status: 404 });
  }
  // no snapshot to fall back on. Say the book is still loading — which is true — rather than
  // printing an RPC error into the panel a visitor is trying to read prices from.
  if (r.kind === "retrying") return NextResponse.json({ asks: [], bids: [], retrying: true });
  return NextResponse.json(r.data, { headers: { "cache-control": `public, max-age=${r.fresh ? 8 : 4}` } });
}
