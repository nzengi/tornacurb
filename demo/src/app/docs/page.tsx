import Link from "next/link";
import { TornaDocs, DexDocs, TORNA_TOC, DEX_TOC } from "@/components/DocsContent";

export const metadata = {
  title: "Docs · TornaCurb and Torna",
  description:
    "Documentation for TornaCurb, a central limit order book for pre-IPO stock tokens on Solana, and Torna, the parallel ordered on-chain index it runs on.",
};

// Tabs are driven by the URL (?tab=torna), so the whole page stays a server component and the code
// blocks are syntax-highlighted at build time. The tab is shareable and survives reload.
export default async function DocsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  // The venue is the default now; the primitive is one click away. ?tab=tornadex still resolves so
  // links shared before the rename keep working.
  const tab = sp.tab === "torna" ? "torna" : "tornacurb";
  const toc = tab === "torna" ? TORNA_TOC : DEX_TOC;
  const tabs: [string, string, string][] = [
    ["tornacurb", "/docs", "TornaCurb · the venue"],
    ["torna", "/docs?tab=torna", "Torna · the primitive underneath"],
  ];
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Documentation</p>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        Two layers, documented separately. <span className="font-medium text-fg">TornaCurb</span> is the
        venue — ten order books, eight of them PreStocks pre-IPO tokens. <span className="font-medium text-fg">Torna</span>{" "}
        is the on-chain index underneath it, which you can build your own sorted state on.
      </p>
      <p className="mt-2 text-sm text-muted">
        In a hurry? <Link href="/build" className="font-medium text-brand hover:text-brand-hi">The code-first quickstart</Link>{" "}
        gets a tree running in TypeScript or Rust, and{" "}
        <Link href="/research" className="font-medium text-brand hover:text-brand-hi">the engineering research</Link>{" "}
        covers the designs we rejected and the numbers we measured.
      </p>
      <div className="mt-5 inline-flex rounded-xl border border-line p-1 text-sm">
        {tabs.map(([t, href, label]) => (
          <Link key={t} href={href} scroll={false}
            className={`rounded-lg px-4 py-2 font-medium transition-colors duration-100 ${tab === t ? "bg-brand text-onbrand" : "text-muted hover:text-fg"}`}>
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-8 gap-12 lg:grid lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-0.5 text-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">On this page</div>
            {toc.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-muted transition-colors duration-100 hover:bg-panel-hi hover:text-fg">{label}</a>
            ))}
          </nav>
        </aside>
        {tab === "torna" ? <TornaDocs /> : <DexDocs />}
      </div>
    </div>
  );
}
