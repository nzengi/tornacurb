"use client";

// What the outside world says this listing is worth, and how much of that to believe.
//
// For the pre-IPO names the answer comes from the issuer. Every one of them is a PreStocks token,
// and PreStocks publishes two numbers: the mark, which is what the SPV says the underlying private
// company is worth, and the token price, which is what the claim on it actually changes hands at.
// The gap between them is the argument this venue exists to make — a claim with no exchange behind
// it drifts from the thing it tracks, and the thinner the secondary market, the further it drifts.
// Showing the issuer's own numbers, including the ones that are inconvenient, is the point.
//
// For the listed control pair the reference is a real exchange price via Pyth, reported with its
// credential state rather than blurred: no key, a key without the right grant, or a real mark.
import { useEffect, useState } from "react";
import { liveMarket } from "@/lib/venue";
import { shorten } from "@/lib/market";

interface MarkResponse {
  oracle: boolean;
  refKind?: "none" | "index" | "exchange";
  state?: "ok" | "unauthenticated" | "unentitled" | "stale" | "error";
  price?: number; conf?: number; feedId?: string; feedSymbol?: string;
  reason?: string;
  proof?: { symbol: string; price: number; publishTime: number } | null;
}
interface IssuerResponse {
  issuer: boolean; live?: boolean; unavailable?: boolean;
  symbol?: string; name?: string; mint?: string | null; url?: string | null;
  markPrice?: number; tokenPrice?: number; premium?: number;
  reason?: string;
}

const usd = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

export function OracleStrip({ symbol }: { symbol: string }) {
  const m = liveMarket(symbol);
  const [mark, setMark] = useState<MarkResponse | null>(null);
  const [issuer, setIssuer] = useState<IssuerResponse | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    const load = () => {
      fetch(`/api/mark?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
        .then((r) => r.json()).then((j) => { if (alive) setMark(j); }).catch(() => { if (alive) setMark(null); });
      fetch(`/api/prestocks?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
        .then((r) => r.json()).then((j) => { if (alive) setIssuer(j); }).catch(() => { if (alive) setIssuer(null); });
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [symbol]);

  if (!m) return null;

  // ---- pre-IPO: the issuer's own numbers -------------------------------------------------
  if (issuer?.issuer && issuer.markPrice !== undefined && issuer.tokenPrice !== undefined) {
    const prem = issuer.premium ?? 0;
    const wide = Math.abs(prem) >= 0.1;
    return (
      <div className="rounded-xl border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Issuer · PreStocks</span>
          <span className="text-sm text-muted">mark <span className="nums font-medium text-fg">${usd(issuer.markPrice)}</span></span>
          <span className="text-sm text-muted">token <span className="nums font-medium text-fg">${usd(issuer.tokenPrice)}</span></span>
          <span className={`nums text-sm font-medium ${prem >= 0 ? "text-bid" : "text-ask"}`}>{pct(prem)}</span>
          {issuer.live === false && <span className="text-[11px] text-serial">last resolved</span>}
          {issuer.url && (
            <a href={issuer.url} target="_blank" rel="noreferrer" className="text-[11px] text-brand hover:text-brand-hi">
              {issuer.symbol} on prestocks.com ↗
            </a>
          )}
          {issuer.mint && <span className="nums text-[11px] text-faint">{shorten(issuer.mint)} · mainnet</span>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          {wide ? (
            <>
              The token trades <strong className="text-muted">{pct(prem)}</strong> away from the mark
              it tracks. That gap is not a mispricing to be scolded — it is what happens to a claim
              with no exchange behind it. Closing it is what the book below is for.
            </>
          ) : (
            <>
              The mark is what the SPV says {issuer.name ?? m.name} is worth; the token price is what
              the claim on it actually trades at. Neither is an exchange price — there is no exchange —
              which is why the book below is where the price gets made.
            </>
          )}
          {mark?.refKind === "index" && mark.feedSymbol && (
            <> Pyth also publishes a derived index for it (<span className="nums">{mark.feedSymbol}</span>), gated behind a Pro grant.</>
          )}
        </p>
      </div>
    );
  }

  // ---- nothing published at all ----------------------------------------------------------
  if (mark?.refKind === "none") {
    return (
      <div className="rounded-xl border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Reference price</span>
          <span className="text-sm font-medium text-fg">none exists</span>
          <span className="text-[11px] text-faint">
            {m.name} is private and unindexed — no exchange, vendor or oracle publishes a price. The
            book below is the price.
          </span>
        </div>
      </div>
    );
  }

  // ---- the listed control pair -----------------------------------------------------------
  const state = mark?.state;
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Pyth reference</span>
        {state === "ok" || state === "stale" ? (
          <>
            <span className="nums text-sm font-medium text-fg">${usd(mark!.price!)}</span>
            {state === "stale" && <span className="text-[11px] text-serial">stale</span>}
          </>
        ) : (
          <span className="text-sm font-medium text-serial">
            {state === "unentitled" ? "awaiting Pyth Pro grant" : state === "unauthenticated" ? "not configured" : "loading"}
          </span>
        )}
        {mark?.feedSymbol && <span className="nums text-[11px] text-faint">{mark.feedSymbol}</span>}
      </div>
      {state === "unentitled" && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          The key authenticates; Pyth gates equity feeds behind a Pro grant.{" "}
          {mark?.proof && (
            <>Same client, same auth, on a feed this key can read:{" "}
            <span className="nums text-muted">{mark.proof.symbol} {usd(mark.proof.price)}</span> — so the
            integration is working, only the equity entitlement is missing.</>
          )}
        </p>
      )}
    </div>
  );
}
