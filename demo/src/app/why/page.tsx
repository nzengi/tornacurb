import Link from "next/link";
import { WhyBook } from "@/components/WhyBook";

export const metadata = {
  title: "Why an order book · TornaCurb",
  description:
    "Tokenised equities arrived on Solana at scale but kept the wrong market structure. The case for a central limit order book over a constant-product pool for stock tokens, and why the argument is strongest for pre-IPO names that have no reference price at all.",
};

const TOC: [string, string][] = [
  ["arrived", "1. The assets arrived"],
  ["amm", "2. What a pool is actually doing"],
  ["noprice", "3. Pre-IPO breaks the assumption"],
  ["thin", "4. Thin floats favour books"],
  ["compare", "5. The same order, both ways"],
  ["book", "6. What a book buys you"],
  ["against", "7. When a pool is the right answer"],
  ["solana", "8. Why this was hard on Solana"],
  ["real", "9. What makes this real"],
];

function H({ id, n, children }: { id: string; n?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="display mt-12 scroll-mt-24 text-2xl font-semibold tracking-tight text-fg">
      {n && <span className="text-faint">{n} </span>}{children}
    </h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-[1.75] text-muted">{children}</p>;
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-serial/40 bg-serial/[0.06] px-4 py-3 text-sm leading-relaxed text-muted">
      <span className="font-semibold text-serial">Honest note. </span>{children}
    </div>
  );
}

export default function WhyPage() {
  return (
    <>
      <div className="mx-auto max-w-6xl gap-12 px-6 py-12 lg:grid lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-0.5 text-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Contents</div>
            {TOC.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-muted transition-colors duration-100 hover:bg-panel-hi hover:text-fg">{label}</a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-3xl">
          <header className="border-b border-line pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Market structure</p>
            <h1 className="display mt-2 text-4xl font-semibold leading-tight tracking-tight">
              Why an <span className="text-gradient">order book</span>, not a pool
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Tokenised equities arrived on Solana at real scale and kept the market structure of a
              memecoin. This is the case for the other one — and why the argument stops being a
              preference and becomes a requirement once the asset has no published price at all.
            </p>
          </header>

          <H id="arrived" n="1.">The assets arrived. The market structure did not.</H>
          <P>
            Tokenised stocks on Solana did roughly <strong className="text-fg">$5.77B in Q2 2026</strong>,
            about <strong className="text-fg">96% of the category</strong> across all chains. Ondo Global
            Markets listed 200+ US stocks and ETFs; xStocks carries 130+ instruments. Whatever one thinks
            of the idea, the demand is no longer hypothetical.
          </P>
          <P>
            Almost all of that flow sits in constant-product pools. Every equity market in the world runs
            on a central limit order book — that is not tradition, it is what the instrument requires —
            and on-chain the same asset trades on a curve designed for tokens with no external price.
            The asset class was ported. Its market structure was not.
          </P>

          <H id="amm" n="2.">What a pool is actually doing</H>
          <P>
            A constant-product AMM does not form a price. It quotes a curve around its current inventory
            ratio and waits to be corrected. When the outside world reprices the asset, the pool is still
            quoting yesterday&apos;s number, and an arbitrageur takes the difference. That transfer has a
            name — loss-versus-rebalancing — and it is not a bug in a particular pool, it is the
            mechanism working as designed.
          </P>
          <P>
            This is tolerable when the asset is volatile in both directions and the fee income covers the
            bleed. It is much less tolerable for an equity, which spends most of its time flat and then
            gaps on an earnings call, a guidance revision, a lawsuit. The pool cannot step back before the
            gap because it cannot cancel. A maker on a book can, and does, which is the entire reason
            market makers exist as a profession.
          </P>

          <H id="noprice" n="3.">Pre-IPO breaks the assumption completely</H>
          <P>
            Everything above assumes there is an outside price the pool is lagging toward. For a private
            company there is no exchange forming one. For Anduril, Neuralink, Kalshi and Polymarket
            nothing publishes a price at all.
          </P>
          <P>
            For OpenAI and Anthropic the picture is more interesting, and worth stating precisely rather
            than rounding off. Pyth does publish a feed for both —{" "}
            <span className="nums text-fg">Equity.Index.OPENAI/USD</span> and{" "}
            <span className="nums text-fg">Equity.Index.ANTHROPIC/USD</span>, 24/7. But look at what it
            is: an <em className="not-italic text-fg">index</em>, not an exchange price, because there is
            no exchange to take a price from. It is derived from wherever these claims actually change
            hands — secondary venues, tokenised markets, broker indications. It reports price discovery.
            It does not perform it.
          </P>
          <Note>
            This matters for the argument, so we would rather be exact than rhetorical: a price for
            OpenAI does exist, published by Pyth. What does not exist is a venue where that price is
            formed. An index is a mirror; somebody still has to be the market it reflects.
          </Note>
          <P>
            Either way the AMM&apos;s implicit contract fails at the first clause. Where nothing is
            published, an LP who seeds a pre-IPO pool is not providing liquidity around a known price;
            they are asserting one, with capital, against anyone who disagrees. Where an index exists,
            anchoring to it is circular: the index is derived from the thin venues the pool is supposed
            to be improving on, so the pool ends up quoting a reflection of itself. Neither case is
            price discovery.
          </P>
          <P>
            An order book has no such dependency. It does not need to know what the asset is worth. It
            collects what people are willing to pay and accept, sorts them, and the best of each is the
            price — which is exactly how price discovery has always worked, and the only mechanism that
            works when there is nothing to copy from, or nothing worth copying.
          </P>

          <H id="thin" n="4.">Thin floats favour books, structurally</H>
          <P>
            A pool must hold inventory across every price simultaneously. That is what the curve is:
            capital committed at prices nobody asked for. To show a usable spread it therefore needs
            depth, and pre-IPO floats are thin by construction — these are secondary claims on private
            shares, not a free-floating supply.
          </P>
          <P>
            A book inverts that. A maker commits capital only at the price they chose, cancels when they
            change their mind, and pays nothing for the levels they are not quoting. That is why order
            books function in markets far too thin to support a pool at all — corporate bonds and small
            caps have traded this way for a century on a fraction of the capital a pool would need.
          </P>
          <P>
            PreStocks state the consequence on their own site: their tokens carry{" "}
            <em className="text-fg not-italic">&ldquo;no guaranteed secondary-market liquidity.&rdquo;</em>{" "}
            That is a market-structure problem with a known solution, not a fact of nature.
          </P>

          <H id="compare" n="5.">The same order, both ways</H>
          <P>
            The section below is computed live, not asserted: it walks the real resting book on devnet and
            prices the same quantity against a modelled constant-product pool.
          </P>
        </article>
      </div>

      <WhyBook />

      <div className="mx-auto max-w-6xl gap-12 px-6 pb-16 lg:grid lg:grid-cols-[210px_1fr]">
        <div className="hidden lg:block" />
        <article className="min-w-0 max-w-3xl">
          <H id="book" n="6.">What a book buys you that a curve cannot</H>
          <P>
            <strong className="text-fg">A real limit order.</strong> &ldquo;Buy at 180 or better&rdquo; is
            the most ordinary instruction in equities and a curve cannot express it. You get the curve&apos;s
            price or you do not trade.
          </P>
          <P>
            <strong className="text-fg">Price-time priority.</strong> The maker who quotes first and
            tightest is filled first. That rule is what makes anyone quote tight; without it there is no
            reward for competing on price, so nobody does.
          </P>
          <P>
            <strong className="text-fg">The right to change your mind.</strong> A maker cancels. A pool
            cannot, and that single asymmetry is most of what LVR measures.
          </P>
          <P>
            <strong className="text-fg">A depth curve that means something.</strong> A book tells you
            plainly that it cannot fill your size. A pool always fills you — at a price that silently
            gets worse the larger you go. For a venue that wants to serve borrowing and liquidation
            later, a real depth curve is the thing you size against.
          </P>

          <H id="against" n="7.">When a pool is the right answer</H>
          <P>
            The honest version of this argument has to include where it loses. A constant-product pool is
            better when there are no makers at all: it is always quoting, with nobody at the keyboard.
            For a long tail of assets that nobody wants to make a market in, a mediocre always-on quote
            genuinely beats an empty book.
          </P>
          <P>
            Pools are also simpler to integrate, compose trivially with routers, and for very small
            orders on a deep pool the slippage difference is noise. And a book with no makers is worse
            than useless — it looks broken. An order book is not free; it is a venue that has to be
            populated, which is why maker incentives are on our roadmap rather than an afterthought.
          </P>
          <Note>
            Our claim is narrow and we would rather state it narrowly: for assets that have a genuine
            two-sided interest and no reference price, a book is the correct instrument and a curve is
            the wrong one. We are not claiming AMMs are obsolete.
          </Note>

          <H id="solana" n="8.">Why this was hard on Solana until now</H>
          <P>
            If books are so clearly right for this asset, the obvious question is why Solana has so few.
            The answer is structural, not ideological. The classic on-chain book keeps the whole thing in
            one account per side, so every maker write takes the same write lock and Sealevel serialises
            them: one writer per slot, however many quotes arrive. A venue whose makers re-quote
            constantly is exactly the workload that design punishes hardest.
          </P>
          <P>
            TornaCurb runs on Torna, our own open-source index, where every B+ tree node is its own
            account. Quotes at different price levels touch different leaves, carry disjoint write sets,
            and commit in the same slot. The engineering case — prior designs, the alternatives we
            rejected, the measurements — is written up separately.
          </P>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link href="/research" className="font-medium text-brand hover:text-brand-hi">Read the engineering research →</Link>
            <Link href="/trade" className="text-muted hover:text-fg">Or just trade it on devnet</Link>
          </div>

          <H id="real" n="9.">What makes this real</H>
          <P>
            Everything above runs on devnet against mock share tokens, and the honest question is what
            stands between that and a venue people actually trade on. Two things, in order, and the
            second is harder than the first.
          </P>
          <P>
            <strong className="text-fg">The audit is the gate.</strong> The engine and the order book
            have been through in-house adversarial review, and a September 2026 pass still found and
            fixed critical issues, which is the argument for an external audit; it is pending. We are not putting an unaudited matching engine in front of real collateral, and
            no amount of hackathon pressure changes that. Nothing about the venue changes once it
            clears — listing a real token is a config row, not a protocol change, because the venue
            reads mints from a table and has no opinion about which ones.
          </P>
          <P>
            <strong className="text-fg">We are not issuing anything.</strong> That distinction is
            worth stating plainly, because it is what makes the path walkable. The shares are issued,
            custodied and legally wrapped by their issuers — every pre-IPO name here is a PreStocks
            token. Those tokens already exist and already trade. TornaCurb does not create exposure to a private company — it
            gives exposure that is already trading somewhere worse a better place to trade. A matching
            venue for existing tokens is a different undertaking, legally and operationally, from an
            issuer.
          </P>
          <P>
            <strong className="text-fg">Liquidity is the real gate.</strong> An order book with no
            makers is worse than a pool: a pool at least always quotes, while an empty book just looks
            broken. So the venue does not open with ten listings on mainnet. It opens with one, with
            a maker who has committed to quote it, and widens only as fast as someone is willing to
            stand behind each new name. Rebates on resting volume are the standard way to pay for
            that, and they cost nothing until somebody actually quotes.
          </P>
          <P>
            <strong className="text-fg">Which suggests where a curve does belong.</strong> A newly
            tokenised name has no makers yet, and we said earlier that an always-on quote beats an
            empty book in exactly that case. So the honest sequence is not book-versus-curve but
            curve-then-book: launch a thin listing on a bonding curve, where something has to quote
            before anyone will, and graduate it into the order book once there is two-sided interest
            to carry it. Meteora&apos;s DBC graduates into an AMM pool today; graduating into a book
            instead is the same mechanism pointed at the venue the asset ends up needing. We have not
            built that — it is the shape of the liquidity answer, not a claim about what exists.
          </P>
          <Note>
            We would rather show you a working venue and name the two gates than claim a mainnet we
            have not earned. Both are gates we can walk through; neither is one we can skip.
          </Note>

          <div className="mt-12 border-t border-line pt-6 text-sm leading-relaxed text-faint">
            Market-size figures are third-party reporting on Q2 2026 tokenised-equity volume and listing
            counts, not our own measurements. The pool comparison above is a model, clearly labelled as
            one: no constant-product pool exists for a pre-IPO name, which is rather the point.
          </div>
        </article>
      </div>
    </>
  );
}
