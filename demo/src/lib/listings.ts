// The TornaCurb listing table — the single source for what trades on the venue.
//
// Two kinds of listing, and the difference is the whole product thesis:
//   "preipo" — a private company. There is no exchange, so no price is formed anywhere. For most
//              of these names nothing publishes a price at all; for a couple Pyth publishes a
//              derived 24/7 index (see pythIndexName), which reports discovery happening on
//              secondary venues rather than performing it. Either way the book is where the price
//              gets made, and an index gives you no limit order and no price-time priority.
//   "listed" — a public ticker. Pyth publishes a reference price, so we can anchor a mark and
//              show how far the book trades from it. These exist as a control group: they prove
//              the venue tracks a known-good price before you trust it where no price exists.
//
// marketId must be unique per orderbook program (book/cfg PDAs are derived from it alone).
// 1 is taken by the original Torna reference market, so this venue starts at 101.
// Tree ids are derived from (torna program, creator, treeId) and our creator key is fresh,
// so 1..16 are free for us.

import feeds from "./pyth-feeds.json";
import prestocks from "./prestocks.json";

export type ListingKind = "preipo" | "listed";

export interface Listing {
  symbol: string;
  name: string;
  kind: ListingKind;
  marketId: number;
  askTreeId: number;
  bidTreeId: number;
  /** PreStocks' own symbol for this company, where the listing is one of their tokens. Every
   *  pre-IPO name here is, so the issuer's catalogue — not our guesses — supplies the opening
   *  price, the mainnet mint and the page a reader can check it against. */
  prestocksSymbol?: string;
  /** Opening mid for listings with no issuer price behind them (the listed control group).
   *  PreStocks names take theirs from the catalogue instead — see openingMid(). */
  seedMid?: number;
  /** Pyth's name for this company in its Equity.Index.* namespace, where one exists.
   *  Pyth publishes a derived 24/7 index for a couple of private companies — NOT an exchange price,
   *  since there is no exchange, but a real published number all the same. Recording which listings
   *  have one keeps the venue's claims checkable per listing instead of hand-waved across all six. */
  pythIndexName?: string;
  blurb: string;
}

export const LISTINGS: Listing[] = [
  // --- Pre-IPO: no oracle, pure price discovery -------------------------------------------
  { symbol: "OPENAI",  name: "OpenAI",      kind: "preipo", marketId: 101, askTreeId: 1,  bidTreeId: 2,  prestocksSymbol: "OPENAI",     pythIndexName: "OPENAI",    blurb: "Frontier AI lab" },
  { symbol: "ANTHRO",  name: "Anthropic",   kind: "preipo", marketId: 102, askTreeId: 3,  bidTreeId: 4,  prestocksSymbol: "ANTHROPIC",  pythIndexName: "ANTHROPIC", blurb: "Frontier AI lab" },
  { symbol: "ANDURL",  name: "Anduril",     kind: "preipo", marketId: 103, askTreeId: 5,  bidTreeId: 6,  prestocksSymbol: "ANDURIL",    blurb: "Defense technology" },
  { symbol: "NEURA",   name: "Neuralink",   kind: "preipo", marketId: 104, askTreeId: 7,  bidTreeId: 8,  prestocksSymbol: "NEURALINK",  blurb: "Neurotechnology" },
  { symbol: "KALSHI",  name: "Kalshi",      kind: "preipo", marketId: 105, askTreeId: 9,  bidTreeId: 10, prestocksSymbol: "KALSHI",     blurb: "Regulated event exchange" },
  { symbol: "POLYMKT", name: "Polymarket",  kind: "preipo", marketId: 106, askTreeId: 11, bidTreeId: 12, prestocksSymbol: "POLYMARKET", blurb: "Prediction market" },
  { symbol: "SPACEX",  name: "SpaceX",      kind: "preipo", marketId: 110, askTreeId: 20, bidTreeId: 21, prestocksSymbol: "SPACEX",     blurb: "Launch and satellite internet" },
  { symbol: "FIGURE",  name: "Figure AI",   kind: "preipo", marketId: 111, askTreeId: 22, bidTreeId: 23, prestocksSymbol: "FIGUREAI",   blurb: "Humanoid robotics" },

  // --- Listed: Pyth-anchored control group ------------------------------------------------
  { symbol: "NVDA",    name: "NVIDIA",      kind: "listed", marketId: 107, askTreeId: 13, bidTreeId: 14, seedMid: 184, blurb: "US equity" },
  { symbol: "SPY",     name: "S&P 500 ETF", kind: "listed", marketId: 108, askTreeId: 15, bidTreeId: 16, seedMid: 640, blurb: "US equity ETF" },
];

/** PreStocks' catalogue, keyed by their symbol. */
export interface PreStock {
  symbol: string; name: string; mint: string;
  markPrice: number; tokenPrice: number;
  markValuation: number | null; impliedValuation: number | null;
  url: string | null; image: string | null;
}
export const preStockOf = (l: Listing): PreStock | undefined =>
  l.prestocksSymbol ? (prestocks as Record<string, PreStock>)[l.prestocksSymbol] : undefined;

/** The price a market opens at. For a PreStocks name that is the issuer's own mark, rounded to a
 *  whole unit because the mints are zero-decimal; for the listed control group it is set by hand. */
export const openingMid = (l: Listing): number => {
  const ps = preStockOf(l);
  if (ps) return Math.max(1, Math.round(ps.markPrice));
  return l.seedMid ?? 100;
};

// Pyth feed ids live in pyth-feeds.json, written by scripts/resolve-pyth-feeds.ts. Pre-IPO names
// are absent from it by definition: no public market means no oracle to look up.
export const feedIdOf = (symbol: string): string | undefined =>
  (feeds as Record<string, { id: string }>)[symbol]?.id;

/** A feed the free tier is entitled to, used to prove the Pyth client works when the equity feeds
 *  are gated behind a Pyth Pro grant. */
export const probeFeed = (): { id: string; symbol: string } | undefined =>
  (feeds as Record<string, { id: string; symbol: string }>)._probe;

/** Pyth's own name for this listing's feed, as resolved from Hermes — never a guessed template. */
export const feedSymbolOf = (symbol: string): string | undefined =>
  (feeds as Record<string, { symbol: string }>)[symbol]?.symbol;

export const bySymbol = (s: string): Listing | undefined =>
  LISTINGS.find((l) => l.symbol.toLowerCase() === s.toLowerCase());

/** Listings for which nothing, anywhere, publishes a price. */
export const unpriced = (): Listing[] => LISTINGS.filter((l) => l.kind === "preipo" && !l.pythIndexName);

export const preipo = (): Listing[] => LISTINGS.filter((l) => l.kind === "preipo");
export const listed = (): Listing[] => LISTINGS.filter((l) => l.kind === "listed");
