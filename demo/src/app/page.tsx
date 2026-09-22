import Link from "next/link";
import { ArrowRight, Gauge, LineChart, Scale } from "lucide-react";
import { GithubIcon } from "@/components/ui/GithubIcon";
import { LiveMarket } from "@/components/LiveMarket";
import { Parallelism } from "@/components/Parallelism";
import { WhyBook } from "@/components/WhyBook";
import { LISTINGS } from "@/lib/listings";

const GH = "https://github.com/nzengi/torna";

export default function Home() {
  const preipo = LISTINGS.filter((l) => l.kind === "preipo");
  const listed = LISTINGS.filter((l) => l.kind === "listed");

  return (
    <>
      {/* Hero: the asset has no price anywhere. That is the whole product. */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="hero-glow pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <div className="mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
          <p className="enter text-xs font-semibold uppercase tracking-[0.2em] text-brand">Pre-IPO stock tokens, on an order book</p>
          <h1 className="enter display mt-4 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ animationDelay: "70ms" }}>
            There is no exchange for <span className="text-gradient">OpenAI stock</span>.
          </h1>
          <p className="enter mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted" style={{ animationDelay: "140ms" }}>
            An automated market maker quotes against a price formed somewhere else. For these companies
            there is nowhere else. <span className="font-medium text-fg">TornaCurb</span> is where the
            price gets made — a real order book for shares that never had a venue.
          </p>
          <div className="enter mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "210ms" }}>
            <Link href="/trade" className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-onbrand transition-colors duration-100 hover:bg-brand-hi active:translate-y-px">
              Open the markets <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/research" className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-5 py-2.5 text-sm font-medium text-fg transition-colors duration-100 hover:border-muted active:translate-y-px">
              Why an order book
            </Link>
          </div>
          <p className="enter mt-5 text-sm text-muted" style={{ animationDelay: "260ms" }}>
            Never used an order book?{" "}
            <Link href="/guide" className="font-medium text-brand hover:text-brand-hi">
              Three minutes, no wallet needed →
            </Link>
          </p>
          <p className="mt-3 text-xs text-faint">Live on devnet · real SPL escrow, no indexer · external audit pending</p>
        </div>
      </section>

      {/* Where the name comes from — the thesis in one anecdote */}
      <section className="mx-auto max-w-3xl px-6 py-14 text-center">
        <p className="text-[15px] leading-relaxed text-muted">
          Before a company was listed on the New York Stock Exchange, its shares traded <em className="text-fg not-italic">on the curb</em> —
          literally on the sidewalk outside the exchange. The Curb Market existed for one reason: there were
          shares people wanted to trade, and no exchange willing to list them. That gap is open again.
        </p>
      </section>

      {/* The problem, computed rather than asserted */}
      <WhyBook />

      {/* The venue */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">The venue</div>
            <h2 className="display mt-2 text-3xl font-semibold tracking-tight">Eight listings, two kinds</h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
              The split is the argument. For most of these private companies nothing publishes a price at
              all; Pyth does index OpenAI and Anthropic, but an index reports discovery happening on
              secondary venues rather than performing it, and it gives you no limit order and no
              price-time priority. The listed pair is a control group: where a price is formed on a real
              exchange, you can watch how closely the book tracks it — and only then is it reasonable to
              trust the same machinery where no exchange exists at all.
            </p>

            <div className="mt-6">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Pre-IPO · no exchange anywhere</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {preipo.map((l) => (
                  <span key={l.symbol} className="rounded-lg border border-line bg-panel px-3 py-1.5">
                    <span className="text-sm font-semibold text-fg">{l.symbol}</span>
                    <span className="ml-2 text-[11px] text-faint">{l.name}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">Listed · a real exchange price, used to check the book</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {listed.map((l) => (
                  <span key={l.symbol} className="rounded-lg border border-line bg-panel px-3 py-1.5">
                    <span className="text-sm font-semibold text-fg">{l.symbol}</span>
                    <span className="ml-2 text-[11px] text-faint">{l.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 lg:mt-0"><LiveMarket /></div>
        </div>
      </section>

      {/* What an order book buys you that a pool cannot */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Scale, t: "Real limit orders", d: "“Buy at 180 or better” is the most basic instruction in equities. A curve cannot express it; a book is made of them." },
            { icon: Gauge, t: "Price-time priority", d: "The maker who quotes first and tightest gets filled first. That is what makes anyone quote tight." },
            { icon: LineChart, t: "Makers keep their edge", d: "A pool cannot move its quote when the world reprices, so it gets picked off. A maker cancels and re-quotes." },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-line bg-panel p-5">
              <c.icon className="h-5 w-5 text-brand" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold text-fg">{c.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The engine, kept underneath: one bridging line, then let Parallelism make the case */}
      <section className="mx-auto max-w-6xl px-6 pt-4">
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
          None of this works if the book cannot take concurrent quotes. TornaCurb runs on{" "}
          <a href={GH} target="_blank" rel="noreferrer" className="font-medium text-brand hover:text-brand-hi">Torna</a>,
          our own open-source index, which is what makes that possible on Solana.
        </p>
      </section>
      <Parallelism />

      {/* Go deeper */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="display text-center text-2xl font-semibold tracking-tight">Look under it yourself</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "How to trade", d: "Three minutes, no wallet needed.", href: "/guide" },
            { t: "Markets", d: "Trade all eight listings on devnet.", href: "/trade" },
            { t: "Why a book", d: "The market-structure case, in full.", href: "/why" },
            { t: "Explorer", d: "Decode the live on-chain trees and transactions.", href: "/explorer" },
          ].map((c) => (
            <Link key={c.t} href={c.href} className="group rounded-xl border border-line bg-panel p-5 transition-colors duration-150 hover:border-brand/40">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">{c.t} <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden /></div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{c.d}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
          <a href={GH} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-brand"><GithubIcon className="h-4 w-4" /> Torna on GitHub</a>
          <span className="text-faint">TornaCurb is built on Torna, our own open-source primitive.</span>
        </div>
      </section>
    </>
  );
}
