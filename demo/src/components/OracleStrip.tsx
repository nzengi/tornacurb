"use client";

// What the outside world says this listing is worth. Three answers, and keeping them apart is the
// venue's whole argument:
//   none      nothing publishes a price at all. The book is the only price there is.
//   index     Pyth publishes a derived 24/7 index. Real, but not an exchange price — there is no
//             exchange. It reports discovery happening elsewhere; it does not perform it.
//   exchange  a listed ticker with a primary market behind it. The control group.
//
// Whichever it is, the Pyth credential state is reported precisely rather than blurred: no key, a
// key without the right grant, or a real mark. In the middle case a live price fetched through the
// same client on an entitled feed makes "integration pending" checkable rather than a claim.
import { useEffect, useState } from "react";
import { liveMarket } from "@/lib/venue";

interface MarkResponse {
  oracle: boolean;
  refKind?: "none" | "index" | "exchange";
  state?: "ok" | "unauthenticated" | "unentitled" | "stale" | "error";
  price?: number;
  conf?: number;
  publishTime?: number;
  feedId?: string;
  feedSymbol?: string;
  reason?: string;
  proof?: { symbol: string; price: number; publishTime: number } | null;
}

const usd = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
const short = (id: string) => `${id.slice(0, 8)}…${id.slice(-6)}`;

export function OracleStrip({ symbol }: { symbol: string }) {
  const m = liveMarket(symbol);
  const [r, setR] = useState<MarkResponse | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    const load = () => {
      fetch(`/api/mark?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((j) => { if (alive) setR(j); })
        .catch(() => { if (alive) setR(null); });
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [symbol]);

  if (!m) return null;

  const kind = r?.refKind;

  // nothing publishes a price for this one. That absence is the headline, not an error.
  if (kind === "none") {
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

  const state = r?.state;
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          {kind === "index" ? "Pyth index" : "Pyth reference"}
        </span>

        {state === "ok" || state === "stale" ? (
          <>
            <span className="nums text-sm font-medium text-fg">{usd(r!.price!)}</span>
            {r!.conf !== undefined && <span className="nums text-[11px] text-faint">±{usd(r!.conf)}</span>}
            {state === "stale" && <span className="text-[11px] text-serial">stale</span>}
          </>
        ) : (
          <span className="text-sm font-medium text-serial">
            {state === "unentitled" ? "awaiting Pyth Pro grant" : state === "unauthenticated" ? "not configured" : "unavailable"}
          </span>
        )}

        {r?.feedSymbol && <span className="nums text-[11px] text-faint">{r.feedSymbol}</span>}
        {r?.feedId && <span className="nums text-[11px] text-faint">{short(r.feedId)}</span>}
      </div>

      {kind === "index" && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Pyth publishes a derived 24/7 index for {m.name}. It is not an exchange price — there is no
          exchange — so it reports discovery happening on secondary venues rather than performing it.
          An index also gives you no limit order and no price-time priority, which is what the book
          below is for.
        </p>
      )}

      {state === "unentitled" && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          The key authenticates; Pyth gates equity feeds behind a Pro grant.{" "}
          {r?.proof ? (
            <>
              Same client, same auth, on a feed this key can read:{" "}
              <span className="nums text-muted">{r.proof.symbol} {usd(r.proof.price)}</span> — so the
              integration is working, only the equity entitlement is missing.
            </>
          ) : (
            <>The integration is wired and gated on that grant.</>
          )}
        </p>
      )}
    </div>
  );
}
