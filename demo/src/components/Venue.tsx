"use client";

// The venue view: the listing strip on top, the terminal for whatever is selected below.
//
// The strip is split into the two kinds of listing because that split IS the product argument —
// pre-IPO names have no oracle anywhere, so the book is the only price; the listed names have a
// Pyth reference to check the book against. Keeping them visually apart makes the point without
// a paragraph of copy.
import { useState } from "react";
import { Terminal } from "./Terminal";
import { liveMarkets, type LiveMarket } from "@/lib/venue";

function Strip({ title, note, rows, sel, onPick }: {
  title: string; note: string; rows: LiveMarket[]; sel: string; onPick: (s: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</h2>
        <span className="text-[11px] text-faint/70">{note}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {rows.map((m) => {
          const on = m.symbol === sel;
          return (
            <button
              key={m.symbol}
              onClick={() => onPick(m.symbol)}
              aria-pressed={on}
              className={`rounded-lg border px-3 py-2 text-left transition-colors duration-100 active:translate-y-px ${
                on ? "border-brand bg-brand/5" : "border-line hover:border-muted"
              }`}
            >
              <div className={`text-sm font-semibold ${on ? "text-fg" : "text-muted"}`}>{m.symbol}</div>
              <div className="text-[11px] text-faint">{m.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Venue() {
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
      <div className="space-y-5 rounded-xl border border-line bg-panel px-4 py-4">
        <Strip
          title="Pre-IPO" note="no oracle exists — the book is the price"
          rows={markets.filter((m) => m.kind === "preipo")} sel={sel} onPick={setSel}
        />
        <Strip
          title="Listed" note="Pyth reference available"
          rows={markets.filter((m) => m.kind === "listed")} sel={sel} onPick={setSel}
        />
      </div>
      <Terminal key={sel} symbol={sel} />
    </div>
  );
}
