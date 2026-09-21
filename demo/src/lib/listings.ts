// The TornaCurb listing table — the single source for what trades on the venue.
//
// Two kinds of listing, and the difference is the whole product thesis:
//   "preipo" — a private company. There is no public market and therefore no oracle: nothing
//              anywhere publishes a price for OpenAI stock. The book IS the price discovery.
//   "listed" — a public ticker. Pyth publishes a reference price, so we can anchor a mark and
//              show how far the book trades from it. These exist as a control group: they prove
//              the venue tracks a known-good price before you trust it where no price exists.
//
// marketId must be unique per orderbook program (book/cfg PDAs are derived from it alone).
// 1 is taken by the original Torna reference market, so this venue starts at 101.
// Tree ids are derived from (torna program, creator, treeId) and our creator key is fresh,
// so 1..16 are free for us.

import feeds from "./pyth-feeds.json";

export type ListingKind = "preipo" | "listed";

export interface Listing {
  symbol: string;
  name: string;
  kind: ListingKind;
  marketId: number;
  askTreeId: number;
  bidTreeId: number;
  /** Opening mid in whole quote units. Mints are 0-decimal, so price is integer dollars. */
  seedMid: number;
  blurb: string;
}

export const LISTINGS: Listing[] = [
  // --- Pre-IPO: no oracle, pure price discovery -------------------------------------------
  { symbol: "OPENAI",  name: "OpenAI",      kind: "preipo", marketId: 101, askTreeId: 1,  bidTreeId: 2,  seedMid: 350, blurb: "Frontier AI lab" },
  { symbol: "ANTHRO",  name: "Anthropic",   kind: "preipo", marketId: 102, askTreeId: 3,  bidTreeId: 4,  seedMid: 285, blurb: "Frontier AI lab" },
  { symbol: "ANDURL",  name: "Anduril",     kind: "preipo", marketId: 103, askTreeId: 5,  bidTreeId: 6,  seedMid: 210, blurb: "Defense technology" },
  { symbol: "NEURA",   name: "Neuralink",   kind: "preipo", marketId: 104, askTreeId: 7,  bidTreeId: 8,  seedMid: 165, blurb: "Neurotechnology" },
  { symbol: "KALSHI",  name: "Kalshi",      kind: "preipo", marketId: 105, askTreeId: 9,  bidTreeId: 10, seedMid:  95, blurb: "Regulated event exchange" },
  { symbol: "POLYMKT", name: "Polymarket",  kind: "preipo", marketId: 106, askTreeId: 11, bidTreeId: 12, seedMid:  78, blurb: "Prediction market" },

  // --- Listed: Pyth-anchored control group ------------------------------------------------
  { symbol: "NVDA",    name: "NVIDIA",      kind: "listed", marketId: 107, askTreeId: 13, bidTreeId: 14, seedMid: 184, blurb: "US equity" },
  { symbol: "SPY",     name: "S&P 500 ETF", kind: "listed", marketId: 108, askTreeId: 15, bidTreeId: 16, seedMid: 640, blurb: "US equity ETF" },
];

// Pyth feed ids live in pyth-feeds.json, written by scripts/resolve-pyth-feeds.ts. Pre-IPO names
// are absent from it by definition: no public market means no oracle to look up.
export const feedIdOf = (symbol: string): string | undefined =>
  (feeds as Record<string, { id: string }>)[symbol]?.id;

export const bySymbol = (s: string): Listing | undefined =>
  LISTINGS.find((l) => l.symbol.toLowerCase() === s.toLowerCase());

export const preipo = (): Listing[] => LISTINGS.filter((l) => l.kind === "preipo");
export const listed = (): Listing[] => LISTINGS.filter((l) => l.kind === "listed");
