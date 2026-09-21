"use client";

// Explorer, scoped to one listing at a time. The venue has eight books and decoding all of them at
// once would be a wall of hex nobody reads — and eight parallel tree walks per refresh is exactly
// the RPC load the cached endpoints elsewhere exist to avoid.
import { useState } from "react";
import { Explorer } from "./Explorer";
import { liveMarkets } from "@/lib/venue";

export function ExplorerView() {
  const markets = liveMarkets();
  const [sel, setSel] = useState(markets[0]?.symbol ?? "");

  if (!markets.length) {
    return (
      <div className="rounded-xl border border-line bg-panel px-4 py-10 text-center text-sm text-faint">
        No markets provisioned yet — run <code className="text-muted">scripts/bringup-venue.ts</code>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Listing</span>
        {markets.map((m) => {
          const on = m.symbol === sel;
          return (
            <button
              key={m.symbol}
              onClick={() => setSel(m.symbol)}
              aria-pressed={on}
              title={`${m.name} · market ${m.marketId}`}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors duration-100 active:translate-y-px ${
                on ? "border-brand bg-brand/5 font-medium text-fg" : "border-line text-muted hover:border-muted"
              }`}
            >
              {m.symbol}
            </button>
          );
        })}
      </div>
      <Explorer key={sel} symbol={sel} />
    </div>
  );
}
