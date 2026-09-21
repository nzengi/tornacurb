import { ExplorerView } from "@/components/ExplorerView";

export const metadata = {
  title: "Explorer · TornaCurb",
  description:
    "A Torna-aware view of every live TornaCurb book on devnet: the ask and bid B+ trees, every leaf account and the orders it holds, the market accounts, and the escrow vault balances.",
};

export default function ExplorerPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Block explorer</p>
      <h1 className="display mt-2 text-4xl font-semibold tracking-tight">Explorer</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
        Every listing on the venue, decoded down to the accounts: the ask and bid B+ trees, each leaf
        and the orders it holds, the market accounts, and the escrow vault balances. This is the actual
        on-chain state, read fresh each refresh — there is no indexer between this page and the chain,
        which is the point. Paste any account or transaction to decode it. Every address opens on the
        Solana Explorer.
      </p>
      <div className="mt-8">
        <ExplorerView />
      </div>
    </div>
  );
}
