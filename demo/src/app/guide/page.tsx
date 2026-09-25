import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LISTINGS } from "@/lib/listings";

export const metadata = {
  title: "How to trade · TornaCurb",
  description:
    "From nothing to a filled order in about three minutes. Connect a wallet or use a pre-funded demo trader, get mock USDC from the faucet, place and take orders on a real on-chain book, and verify every transaction on the Solana Explorer.",
};

const TOC: [string, string][] = [
  ["fast", "The fastest route"],
  ["wallet", "With your own wallet"],
  ["book", "Reading the book"],
  ["place", "Placing an order"],
  ["take", "Taking liquidity"],
  ["verify", "Checking it is real"],
  ["honest", "What is real, what is not"],
  ["trouble", "If something goes wrong"],
  ["poke", "Worth poking at"],
];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="display mt-12 scroll-mt-24 text-2xl font-semibold tracking-tight text-fg">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-[1.75] text-muted">{children}</p>;
}
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand/50 text-[11px] font-semibold text-brand">{n}</span>
      <span className="text-[15px] leading-[1.7] text-muted">{children}</span>
    </li>
  );
}
const K = ({ children }: { children: React.ReactNode }) => (
  <span className="nums rounded border border-line bg-panel px-1.5 py-0.5 text-[13px] text-fg">{children}</span>
);

export default function GuidePage() {
  const first = LISTINGS[0];
  return (
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">How to trade</p>
          <h1 className="display mt-2 text-4xl font-semibold leading-tight tracking-tight">
            From nothing to a <span className="text-gradient">filled order</span>, in about three minutes
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Everything here happens on Solana devnet. It costs nothing, and nothing at risk is real —
            but the programs, the escrow and every transaction you send are.
          </p>
        </header>

        {/* The point of this box is to remove the wallet from the critical path entirely: the
            fastest way to understand an order book is to use one, not to install something first. */}
        <div id="fast" className="mt-10 scroll-mt-24 rounded-xl border border-brand/40 bg-brand/[0.04] px-5 py-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">The fastest route · no wallet at all</div>
          <ol className="mt-3 space-y-2">
            <Step n={1}>Open <Link href="/trade" className="font-medium text-brand hover:text-brand-hi">the markets</Link></Step>
            <Step n={2}>Pick a listing from the strip at the top — <K>{first.symbol}</K> is a good first one</Step>
            <Step n={3}>Under <strong className="text-fg">Trade as</strong>, click any of <strong className="text-fg">Trader 1–4</strong></Step>
          </ol>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Those are pre-funded identities that sign in your browser. You are now trading — skip
            ahead to <a href="#book" className="text-brand hover:text-brand-hi">reading the book</a>.
            Use a wallet instead if you want the orders to be yours.
          </p>
        </div>

        <H id="wallet">With your own wallet</H>
        <ol className="mt-4 space-y-3">
          <Step n={1}>
            Any Solana wallet works — Phantom, Solflare, Backpack. In its settings, switch the network
            to <strong className="text-fg">Devnet</strong>. This matters: on mainnet you will see
            nothing, because the venue is not there.
          </Step>
          <Step n={2}>
            On <Link href="/trade" className="font-medium text-brand hover:text-brand-hi">/trade</Link>,
            press <strong className="text-fg">Connect wallet</strong> and approve.
          </Step>
          <Step n={3}>
            Press <strong className="text-fg">Get demo tokens</strong>. The faucet sends{" "}
            <K>1,000,000</K> mock USDC — the quote currency, shared across every listing — and{" "}
            <K>0.012</K> SOL — enough for fees and to open the share accounts your first few buys need.
          </Step>
        </ol>
        <P>
          You get cash, not shares. That is deliberate: you arrive with money and buy stock from the
          book, the same way you would anywhere else. Nobody hands out free OpenAI shares. If you
          already hold USDC the faucet says so and skips rather than topping you up twice.
        </P>

        <H id="book">Reading the book</H>
        <P>
          The book has two halves. <span className="text-ask">Asks</span> above are people willing to
          sell, cheapest first. <span className="text-bid">Bids</span> below are people willing to buy,
          highest first. The line between them is the <strong className="text-fg">spread</strong> — the
          gap between the best buyer and the best seller.
        </P>
        <P>
          Each row reads <K>price · size · maker</K>. Size is a number of shares. Prices are whole
          numbers, because the mints are zero-decimal: <K>352</K> means 352 USDC per share. A blue dot
          marks an order you placed.
        </P>

        <H id="place">Placing an order — you are the maker</H>
        <P>
          The <strong className="text-fg">Place (maker)</strong> tab rests an order on the book and
          waits for someone to trade against it. Choose a side, a price and a size, then press{" "}
          <strong className="text-fg">Place order</strong>. To rest rather than trade immediately, a
          buy must sit below the best ask and a sell above the best bid.
        </P>
        <P>
          The form previews what will happen before you commit, and if your price would cross the book
          it says so and points you at the Take tab rather than quietly doing something you did not
          mean. Your order then appears under <strong className="text-fg">Your open orders</strong> and
          on the book with a blue dot; the tokens sit in the market&apos;s vault until it fills or you
          cancel. Cancelling returns the escrow immediately.
        </P>

        <H id="take">Taking liquidity — you are the taker</H>
        <P>
          The <strong className="text-fg">Take (taker)</strong> tab trades against what is already
          there. Set a limit price — the worst price you will accept — and a size. The preview shows
          how much will fill and at what average.
        </P>
        <P>
          If the book cannot fill your whole size it tells you, rather than filling you at any price.
          That is the difference between a book and a curve, and the reason this venue exists.
        </P>

        <H id="verify">Checking that any of this is real</H>
        <P>
          Every confirmed action gives you a link to the Solana Explorer. Open it: that is your
          transaction, on chain, readable by anyone.
        </P>
        <P>
          For the full picture, open{" "}
          <Link href="/explorer" className="font-medium text-brand hover:text-brand-hi">the explorer</Link>.
          Pick a listing and you will see the ask and bid B+ trees with their height and root, every
          leaf account and how many orders it holds, every resting order with its price, size, maker and
          key, and the escrow vault balances. There is no database between that page and Solana — it is
          read fresh each refresh, which is why it can be a little slow and why you can check every
          number yourself.
        </P>

        <H id="honest">What is real, and what is not</H>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-bid/30 bg-bid/[0.04] px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-bid">Real</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The programs, the accounts, the B+ trees, the escrow, the matching, and every transaction
              you send. All on Solana devnet, all independently verifiable.
            </p>
          </div>
          <div className="rounded-lg border border-ask/30 bg-ask/[0.04] px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ask">Not real</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The share tokens. <K>{first.symbol}</K> here is a mock mint created for the venue, not a
              claim on anything, and the mock USDC is ours too. Real tokenised shares live on mainnet,
              and the venue will not point at them until its external audit is complete.
            </p>
          </div>
          <div className="rounded-lg border border-serial/40 bg-serial/[0.06] px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-serial">Partly real</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The prices. They start from plausible valuations and are moved by a market maker, not by
              demand. Pyth does publish a derived index for OpenAI and Anthropic, which the venue shows
              and labels; for the other four listings no price exists anywhere.
            </p>
          </div>
        </div>

        <H id="trouble">If something goes wrong</H>
        <dl className="mt-4 space-y-3 text-[15px] leading-[1.7]">
          <div><dt className="font-medium text-fg">&ldquo;Transaction expired&rdquo;</dt><dd className="text-muted">Devnet dropped it. Try again — nothing was lost.</dd></div>
          <div><dt className="font-medium text-fg">Nothing happens when you press a button</dt><dd className="text-muted">Check your wallet is on <strong className="text-fg">Devnet</strong>, not mainnet. This is the usual one.</dd></div>
          <div><dt className="font-medium text-fg">&ldquo;This wallet was funded recently&rdquo;</dt><dd className="text-muted">The faucet allows one top-up per wallet every few minutes.</dd></div>
          <div><dt className="font-medium text-fg">The book looks stale</dt><dd className="text-muted">A market maker re-quotes each listing every few minutes. Give it a moment, or switch listings and come back.</dd></div>
        </dl>

        <H id="poke">Worth poking at</H>
        <P>
          If you want to stress this rather than click through it:
        </P>
        <ul className="mt-3 space-y-2 text-[15px] leading-[1.7] text-muted">
          <li>· Place a buy just under the best ask, then take it as another trader. Does the fill match what the preview promised?</li>
          <li>· Ask for more size than the book holds. Does it tell you, or fill you anyway?</li>
          <li>· Compare the same order on the <Link href="/" className="text-brand hover:text-brand-hi">book-versus-pool panel</Link>. Does the gap look like the instrument, or like a trick of the numbers?</li>
          <li>· Open the <Link href="/explorer" className="text-brand hover:text-brand-hi">explorer</Link> and check your orders really are in the leaf accounts it lists.</li>
        </ul>
        <P>
          Then tell us what broke —{" "}
          <a href="https://x.com/furkanzkx" target="_blank" rel="noreferrer"
             className="font-medium text-brand hover:text-brand-hi">@furkanzkx</a>. A venue is only
          worth anything if the people using it can say when it is wrong.
        </P>

        <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-sm">
          <Link href="/trade" className="inline-flex items-center gap-1.5 font-medium text-brand hover:text-brand-hi">
            Open the markets <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/why" className="text-muted hover:text-fg">Why an order book at all</Link>
        </div>
      </article>
    </div>
  );
}
