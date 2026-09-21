// The venue: every market on TornaCurb, keyed by symbol.
//
// Written by scripts/bringup-venue.ts. Before that script has run, venue.json is a valid but
// empty placeholder so the app still builds and typechecks — call isProvisioned() before
// touching any on-chain accessor, and render an empty-venue state when it returns false.
import "./polyfill";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Tree } from "torna-sdk";
import venueJson from "./venue.json";
import { LISTINGS, bySymbol, feedIdOf, type Listing } from "./listings";

export { connection, reader, rpcUrl, explorerAddr, explorerTx, shorten } from "./market";

export interface MarketState {
  symbol: string; marketId: number; askTreeId: number; bidTreeId: number; bookBump: number;
  baseMint: string; baseVault: string; quoteVault: string; book: string; cfg: string;
}
export interface Venue {
  cluster: string; rpcUrl: string; tornaProgramId: string; orderbookProgramId: string;
  creator: string; quoteMint: string;
  demos: { pubkey: string; secret: number[] }[];
  markets: Record<string, MarketState>;
}

export const VENUE = venueJson as Venue;

/** A listing joined with its on-chain accounts — what every trading view needs. */
export interface LiveMarket extends Listing, MarketState {}

export const isProvisioned = (): boolean => VENUE.creator !== "" && Object.keys(VENUE.markets).length > 0;

/** Listings that actually have a market on-chain, in listing-table order. */
export function liveMarkets(): LiveMarket[] {
  return LISTINGS.flatMap((l) => {
    const s = VENUE.markets[l.symbol];
    return s ? [{ ...l, ...s }] : [];
  });
}

export function liveMarket(symbol: string): LiveMarket | undefined {
  const l = bySymbol(symbol);
  const s = l && VENUE.markets[l.symbol];
  return l && s ? { ...l, ...s } : undefined;
}

/** Throwing accessor for routes that have already checked the symbol exists. */
export function mustLiveMarket(symbol: string): LiveMarket {
  const m = liveMarket(symbol);
  if (!m) throw new Error(`no live market for "${symbol}" — run scripts/bringup-venue.ts`);
  return m;
}

export const tornaProgram = (): PublicKey => new PublicKey(VENUE.tornaProgramId);
export const orderbookProgram = (): PublicKey => new PublicKey(VENUE.orderbookProgramId);
export const quoteMint = (): PublicKey => new PublicKey(VENUE.quoteMint);
export const creator = (): PublicKey => new PublicKey(VENUE.creator);

export const askTree = (m: LiveMarket): Tree => new Tree(tornaProgram(), creator(), m.askTreeId);
export const bidTree = (m: LiveMarket): Tree => new Tree(tornaProgram(), creator(), m.bidTreeId);
export const marketIdOf = (m: LiveMarket): bigint => BigInt(m.marketId);

export const demoKeypair = (i: number): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(VENUE.demos[i].secret));

/** Pre-IPO has no oracle by definition; only listed tickers carry a Pyth feed. */
export const hasOracle = (m: Listing): boolean => m.kind === "listed" && !!feedIdOf(m.symbol);
