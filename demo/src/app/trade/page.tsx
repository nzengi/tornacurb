import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Venue } from "@/components/Venue";
import { DevX } from "@/components/DevX";
import { initialBook } from "@/lib/book-server";
import { liveMarkets } from "@/lib/venue";

// Render the first listing's book into the HTML, refreshed at most every 30s, so the terminal opens
// on real prices instead of dashes (and so does anything reading the page without running scripts).
export const revalidate = 30;

export default async function TradePage() {
  const first = liveMarkets()[0];
  const initial = first ? await initialBook(first.symbol) : null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Pre-IPO, on an order book</p>
        <h1 className="display mt-2 text-3xl font-semibold tracking-tight">TornaCurb</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          There is no exchange for OpenAI stock, so an AMM has no formed price to quote against. An
          order book does not need one — it discovers the price from the orders themselves. TornaCurb runs a
          central limit order book per listing on the Torna index, with every B+ tree node in its own
          account so quotes at different price levels commit in the same slot. Place, take and cancel
          are real devnet transactions; the book is read straight from the tree, with no indexer.
        </p>
        <p className="mt-3 text-sm text-muted">
          First time here?{" "}
          <Link href="/guide" className="inline-flex items-center gap-1 font-medium text-brand hover:text-brand-hi">
            Three minutes, no wallet needed <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      </div>

      <Venue initial={initial} />

      <div className="mt-12">
        <DevX />
      </div>
    </div>
  );
}
