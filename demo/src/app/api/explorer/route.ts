// The Explorer's view of one market, read on the server: GET /api/explorer?symbol=OPENAI
//
// The Explorer page used to walk both trees and read the vaults from the browser, through /api/rpc.
// That is a dozen-plus reads per viewer every 20s, and each 429 set web3.js retrying in the browser,
// so a busy moment left the page on "reading on-chain" with an empty book. Here the read happens once
// per TTL for every viewer, with the book's retry/fallback policy and a deadline, and a slow read
// serves the last snapshot instead of nothing.
import { NextResponse } from "next/server";
import { keys } from "torna-sdk";
import venue from "@/lib/venue.json";
import { askTree, bidTree, liveMarket } from "@/lib/venue";
import { resilientReader } from "@/lib/book-server";
import { mintDecimals, readSide, stringifyExplorer, tokenAmount, type ExplorerView } from "@/lib/explorer-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 10_000;
const DEADLINE_MS = 9_000;
const cache = new Map<string, { at: number; body: string }>();

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  const m = liveMarket(symbol);
  if (!m) return NextResponse.json({ error: `unknown or unprovisioned market "${symbol}"` }, { status: 404 });

  const hit = cache.get(m.symbol);
  const send = (body: string, maxAge: number) =>
    new NextResponse(body, { headers: { "content-type": "application/json", "cache-control": `public, max-age=${maxAge}` } });
  if (hit && Date.now() - hit.at < TTL_MS) return send(hit.body, 8);

  const r = resilientReader;
  const read = (async (): Promise<ExplorerView> => {
    // the two tree walks in sequence (parallel walks are what trip the per-second limit)
    const ask = await readSide(r, askTree(m), keys.Side.Ask);
    const bid = await readSide(r, bidTree(m), keys.Side.Bid);
    const [baseVault, quoteVault, baseDec, quoteDec] = await Promise.all([
      tokenAmount(r, m.baseVault), tokenAmount(r, m.quoteVault),
      mintDecimals(r, m.baseMint), mintDecimals(r, venue.quoteMint),
    ]);
    return { ask, bid, ov: { baseVault, quoteVault, baseDec, quoteDec } };
  })();
  // a read that loses the race still finishes; let it refresh the cache for the next request
  void read.then((v) => cache.set(m.symbol, { at: Date.now(), body: stringifyExplorer(v) })).catch(() => {});
  try {
    const v = await Promise.race([read, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("deadline")), DEADLINE_MS))]);
    const body = stringifyExplorer(v);
    cache.set(m.symbol, { at: Date.now(), body });
    return send(body, 8);
  } catch (e) {
    if (hit) return send(hit.body, 4);
    console.error("explorer read failed:", e);
    return NextResponse.json({ retrying: true }, { status: 503 });
  }
}
