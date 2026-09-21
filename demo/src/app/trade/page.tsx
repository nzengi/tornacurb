import { Venue } from "@/components/Venue";
import { DevX } from "@/components/DevX";

export default function TradePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Pre-IPO, on an order book</p>
        <h1 className="display mt-2 text-3xl font-semibold tracking-tight">TornaCurb</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Nobody publishes a price for OpenAI stock, so an AMM has nothing to quote against. An order
          book does not need one — it discovers the price from the orders themselves. TornaCurb runs a
          central limit order book per listing on the Torna index, with every B+ tree node in its own
          account so quotes at different price levels commit in the same slot. Place, take and cancel
          are real devnet transactions; the book is read straight from the tree, with no indexer.
        </p>
      </div>

      <Venue />

      <div className="mt-12">
        <DevX />
      </div>
    </div>
  );
}
