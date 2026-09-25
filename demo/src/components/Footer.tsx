import { VENUE } from "@/lib/venue";
import { LISTINGS } from "@/lib/listings";
import { GH_TORNA, GH_TORNACURB } from "@/lib/links";
import { Address } from "./ui/Address";
import { GithubIcon } from "./ui/GithubIcon";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line">
      {/* The venue lists real company names next to real issuer prices, so what is and is not being
          traded has to be said plainly, on every page -- the listing names come from LISTINGS so a
          new listing cannot be left out of it. */}
      <div id="notice" className="mx-auto max-w-6xl scroll-mt-20 px-6 pt-8 text-xs leading-relaxed text-faint">
        <p className="max-w-4xl">
          <span className="font-medium text-muted">Notice.</span> TornaCurb is a technology demonstration
          on Solana devnet. Everything traded here is a devnet test token with no monetary value: it is not a
          share, a security or a claim on any company, and it is not a PreStocks token. TornaCurb is not
          affiliated with, endorsed by or sponsored by PreStocks or any company whose name appears here
          ({LISTINGS.map((l) => l.name).join(", ")}). Those names identify the reference prices shown, which
          come from PreStocks&apos; public catalogue and from Pyth and are displayed for comparison only.
          Nothing on this site is an offer to buy or sell securities, or investment advice.
        </p>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href={GH_TORNACURB} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-fg transition-colors duration-100 hover:text-brand">
              <GithubIcon className="h-4 w-4" /> TornaCurb
            </a>
            <a href={GH_TORNA} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-fg transition-colors duration-100 hover:text-brand">
              <GithubIcon className="h-4 w-4" /> Torna engine
            </a>
            <a href="https://www.npmjs.com/package/torna-sdk" target="_blank" rel="noreferrer" className="font-medium text-fg transition-colors duration-100 hover:text-brand">torna-sdk (npm)</a>
            <a href="https://crates.io/crates/torna-sdk" target="_blank" rel="noreferrer" className="font-medium text-fg transition-colors duration-100 hover:text-brand">torna-sdk (crates.io)</a>
          </div>
          {/* A venue with no name attached to it is asking for trust it has not offered. This is
              also the only channel anyone has for telling us something is broken. */}
          <div className="text-muted">
            Built by{" "}
            <a href="https://x.com/furkanzkx" target="_blank" rel="noreferrer"
               className="font-medium text-fg transition-colors duration-100 hover:text-brand">@furkanzkx</a>
            {" · "}questions and bug reports welcome
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5 text-muted">engine <Address value={VENUE.tornaProgramId} /></span>
            <span className="flex items-center gap-1.5 text-muted">book <Address value={VENUE.orderbookProgramId} /></span>
            <span className="flex items-center gap-1.5 text-muted">quote <Address value={VENUE.quoteMint} /></span>
          </div>
        </div>
        <p className="max-w-md leading-relaxed">
          In-house adversarial review (engine, orderbook, SDK); a September 2026 pass found and fixed
          critical issues, and the fixed programs are redeployed. External audit pending, do not treat as
          production-audited. Devnet only.
        </p>
      </div>
    </footer>
  );
}
