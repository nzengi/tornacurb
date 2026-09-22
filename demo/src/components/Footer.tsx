import { VENUE } from "@/lib/venue";
import { Address } from "./ui/Address";
import { GithubIcon } from "./ui/GithubIcon";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="https://github.com/nzengi/torna" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-fg transition-colors duration-100 hover:text-brand">
              <GithubIcon className="h-4 w-4" /> GitHub
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
          In-house adversarial review to convergence (engine, orderbook, SDK). External audit pending,
          do not treat as production-audited. Devnet only.
        </p>
      </div>
    </footer>
  );
}
