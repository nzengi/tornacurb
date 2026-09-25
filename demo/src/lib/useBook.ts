"use client";

// Live book hook for ONE listing. Reads from the cached server endpoint (/api/book?symbol=...),
// which reads the on-chain Torna trees once per TTL and serves the snapshot to all viewers. So the
// browser polls our server, not the RPC directly: many viewers share one upstream read and the RPC
// is never hit constantly. Switching symbols resets the book so a stale one is never shown.
import { useCallback, useEffect, useRef, useState } from "react";

export interface Order {
  price: bigint;
  size: bigint;
  maker: string;
  keyHex: string;
}

export interface BookState {
  asks: Order[];
  bids: Order[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

type Row = { price: string; size: string; maker: string; keyHex: string };
const parse = (rows: Row[]): Order[] =>
  rows.map((o) => ({ price: BigInt(o.price), size: BigInt(o.size), maker: o.maker, keyHex: o.keyHex }));

/** A snapshot the server rendered into the page (lib/book-server.ts initialBook), so the book shows
 *  real prices in the HTML itself rather than dashes until the first client fetch lands. */
export interface InitialBook { symbol: string; asks: Row[]; bids: Row[] }

export function useBook(symbol: string, pollMs = 20000, initial?: InitialBook | null): BookState {
  // the server snapshot only stands in for the symbol it was read for
  const seed = initial && initial.symbol === symbol ? initial : null;
  const seeded = useRef(seed);
  const [asks, setAsks] = useState<Order[]>(() => (seed ? parse(seed.asks) : []));
  const [bids, setBids] = useState<Order[]>(() => (seed ? parse(seed.bids) : []));
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current || !symbol) return;
    busy.current = true;
    try {
      const res = await fetch(`/api/book?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const j = await res.json();
      setAsks(parse(j.asks ?? []));
      setBids(parse(j.bids ?? []));
      // "retrying" means the server could not read the chain this moment; it is a transient
      // state, not something to shout at the reader with an RPC stack trace
      setError(j.retrying ? "loading" : (j.error ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      busy.current = false;
    }
  }, [symbol]);

  useEffect(() => {
    // a symbol change must clear the previous market's ladder, not cross-fade into it -- except on
    // the first run for the symbol the server already rendered, whose snapshot is what is showing
    if (seeded.current?.symbol === symbol) seeded.current = null;
    else { setAsks([]); setBids([]); setLoading(true); setError(null); }
    load();
    // don't poll a backgrounded tab; refresh on regaining focus
    const id = setInterval(() => { if (!document.hidden) load(); }, pollMs);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load, pollMs, symbol]);

  return { asks, bids, loading, error, refresh: load };
}
