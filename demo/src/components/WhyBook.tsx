"use client";

// The argument, computed rather than asserted: what a given order costs on the real book versus
// what it would cost on a constant-product pool holding the same asset.
//
// The book side walks the ACTUAL on-chain ladder. The AMM side is a MODEL — there is no OpenAI
// pool to measure, which is rather the point — so the pool's size is stated as an assumption and
// adjustable. Labelling that honestly matters more than winning the comparison: an AMM curve is
// not a strawman, it is just the wrong instrument for an asset with no reference price.
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useBook, type InitialBook } from "@/lib/useBook";
import { liveMarkets } from "@/lib/venue";

const SIZES = [10, 50, 200];
const POOLS = [
  { label: "$100k pool", tvl: 100_000 },
  { label: "$1M pool", tvl: 1_000_000 },
];

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
// a fixed locale: this renders on the server too (from the page's book snapshot), and server and
// browser must print the same text
const usd = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function WhyBook({ initial }: { initial?: InitialBook | null }) {
  const markets = liveMarkets();
  const [sym, setSym] = useState(markets[0]?.symbol ?? "");
  const [size, setSize] = useState(SIZES[1]);
  const [pool, setPool] = useState(POOLS[0]);
  const { asks, loading, error } = useBook(sym, 30000, initial);

  const result = useMemo(() => {
    if (!asks.length) return null;
    const best = Number(asks[0].price);

    // walk the real ladder
    let rem = size, cost = 0, filled = 0;
    for (const lvl of asks) {
      const take = Math.min(Number(lvl.size), rem);
      cost += take * Number(lvl.price);
      filled += take;
      rem -= take;
      if (rem <= 0) break;
    }
    const bookAvg = filled ? cost / filled : 0;
    const bookSlip = filled ? bookAvg / best - 1 : 0;

    // Compare like for like. If the resting book cannot fill the whole size, both sides are priced
    // for the quantity it CAN fill — quoting our slippage on 32 shares against a pool's on 50 would
    // flatter us for the wrong reason. The shortfall is reported separately, because running out of
    // depth is a real property of a thin book and hiding it would be the same dishonesty inverted.
    const qty = filled;
    const rQuote = pool.tvl / 2;
    const rBase = rQuote / best;
    const ammFills = qty > 0 && qty < rBase;
    const ammCost = ammFills ? (rQuote * qty) / (rBase - qty) : Infinity;
    const ammAvg = ammFills ? ammCost / qty : Infinity;
    const ammSlip = ammFills ? ammAvg / best - 1 : Infinity;

    return { best, bookAvg, bookSlip, filled, qty, shortBy: Math.max(0, size - filled), ammAvg, ammSlip, ammFills, rBase };
  }, [asks, size, pool]);

  if (!markets.length) return null;

  return (
    <section className="border-y border-line bg-bg-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Why a book, not a pool</div>
          <h2 className="display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            A curve has to guess. A book already knows.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            An automated market maker quotes off a formula anchored to a reference price. For a private
            company there is no reference price to anchor to, and the float is thin, so the curve is
            steep exactly where it matters. A book quotes where makers are actually willing to trade.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-faint">Buy</span>
            <select value={size} onChange={(e) => setSize(Number(e.target.value))}
              className="rounded-md border border-line bg-panel px-2 py-1 text-fg">
              {SIZES.map((s) => <option key={s} value={s}>{s} shares</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-faint">of</span>
            <select value={sym} onChange={(e) => setSym(e.target.value)}
              className="rounded-md border border-line bg-panel px-2 py-1 text-fg">
              {markets.map((m) => <option key={m.symbol} value={m.symbol}>{m.symbol}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-faint">against a</span>
            <select value={pool.label} onChange={(e) => setPool(POOLS.find((p) => p.label === e.target.value)!)}
              className="rounded-md border border-line bg-panel px-2 py-1 text-fg">
              {POOLS.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
            </select>
          </label>
        </div>

        {loading && <p className="mt-8 text-sm text-faint">reading the book …</p>}
        {error && <p className="mt-8 text-sm text-ask">book unavailable right now ({error})</p>}

        {result && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-brand/40 bg-panel p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-brand">TornaCurb order book</div>
                <div className="mt-1 text-[11px] text-faint">for {result.qty} shares</div>
                <div className="nums mt-3 text-3xl font-semibold text-fg">{usd(result.bookAvg)}</div>
                <div className="mt-1 text-sm text-muted">average fill price</div>
                <div className="mt-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-faint">slippage vs best ask</span><span className="nums text-bid">{pct(result.bookSlip)}</span></div>
                  <div className="flex justify-between"><span className="text-faint">depth reached</span><span className="nums text-muted">{result.filled} / {size}</span></div>
                </div>
                {result.shortBy > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-faint">
                    The resting book is {result.shortBy} short of {size}, so both sides above are priced for
                    the {result.qty} it can fill. A book tells you it ran out; a curve just charges more.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-line bg-panel p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-faint">Constant-product pool (modelled)</div>
                <div className="mt-1 text-[11px] text-faint">for {result.qty} shares</div>
                <div className="nums mt-3 text-3xl font-semibold text-fg">{result.ammFills ? usd(result.ammAvg) : "—"}</div>
                <div className="mt-1 text-sm text-muted">average fill price</div>
                <div className="mt-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-faint">slippage vs spot</span>
                    <span className="nums text-ask">{result.ammFills ? pct(result.ammSlip) : "unfillable"}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-faint">pool depth</span><span className="nums text-muted">{Math.floor(result.rBase)} shares</span></div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-faint">
                  Modelled, not measured: no such pool exists for a pre-IPO name. Half the stated TVL in
                  each leg, priced at the book&apos;s best ask.
                </p>
              </div>
            </div>

            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
              The gap is not a trick of the numbers — it is the instrument. A pool must hold inventory
              across every price at once, so thin liquidity means a steep curve. A maker on a book commits
              capital only at the price they chose, which is why order books work in markets that are too
              thin to support a pool at all.
            </p>
          </>
        )}

        <div className="mt-8">
          <a href="/trade" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hi">
            Trade it on devnet <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
