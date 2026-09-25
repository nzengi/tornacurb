# Torna

[![CI](https://github.com/nzengi/torna/actions/workflows/ci.yml/badge.svg)](https://github.com/nzengi/torna/actions/workflows/ci.yml)
[![crates.io](https://img.shields.io/crates/v/torna-sdk.svg)](https://crates.io/crates/torna-sdk)
[![docs.rs](https://docs.rs/torna-sdk/badge.svg)](https://docs.rs/torna-sdk)
[![npm](https://img.shields.io/npm/v/torna-sdk.svg)](https://www.npmjs.com/package/torna-sdk)
[![license](https://img.shields.io/crates/l/torna-sdk.svg)](LICENSE)

The first parallel, ordered, on-chain index primitive for Solana: a sorted key to value store where
every B+ tree node lives in its own account, so writes at different keys carry disjoint write sets and
the Sealevel scheduler commits them in the same slot. It is a generic sorted index, not a matching
engine. The engine is written in C for SBF; **TornaDEX** is the reference order book built on it.

- **Live demo:** TornaCurb on devnet at https://tornacurb.vercel.app (source in `demo/`)
- **Repositories:** venue at [nzengi/tornacurb](https://github.com/nzengi/tornacurb), engine at [nzengi/torna](https://github.com/nzengi/torna)
- **SDK:** `torna-sdk` on [npm](https://www.npmjs.com/package/torna-sdk) (TypeScript) and [crates.io](https://crates.io/crates/torna-sdk) (Rust), byte-equivalent
- **Status:** deployed on devnet; in-house reviewed, and a September 2026 pass found and fixed critical issues (see [Status](#status-and-honesty)); external audit pending

## Why

Sorted on-chain state with many concurrent writers (an order book, a liquidation queue, a leaderboard)
is hard on Solana because of three scarce resources: the per-transaction account budget, account-lock
parallelism, and rent. A single-account slab loses all three. A high-fanout B+ tree with one node per
account is near-optimal on all three: height about three (account budget), one node per account
(parallelism), and high fanout amortizes per-account rent. The moat is not the B+ tree, which is
textbook; it is this layout plus a client SDK that makes account resolution invisible.

## Layout

| Path | What it is | Language |
|---|---|---|
| `sbf/` | The Torna engine: the parallel ordered B+ tree, one node per account. 15 instructions. | C / SBF |
| `sdk/` | Rust client SDK: the PathPlanner, key-based instruction builders. | Rust |
| `ts-sdk/` | TypeScript SDK, a byte-equivalent 1:1 port, published as `torna-sdk`. | TypeScript |
| `cpi/` | [`torna-cpi`](https://crates.io/crates/torna-cpi) crate: invoke_signed helpers so a program drives Torna as a PDA authority. | Rust |
| `orderbook/` | TornaDEX, the reference two-sided escrow CLOB built on Torna. | Rust / SBF |
| `cpi-probe/` | Composability proof: a program CPIs InsertFast and parallelism survives. | Rust / SBF |
| `bench/` | The parallelism benchmark on a real validator banking stage. | Rust |
| `integration/`, `test/` | LiteSVM integration, on-chain differential, fuzz, CU, host property tests. | Rust / C |
| `demo/` | The Next.js demo site: TornaDEX trading, docs, research, and a Torna-aware explorer. | TypeScript |

## Quickstart (SDK)

```
npm install torna-sdk @solana/web3.js   # TypeScript
cargo add torna-sdk solana-sdk           # Rust
```

```ts
import { Tree, keys } from "torna-sdk";

const tree = new Tree(program, creator, treeId);
const key  = keys.orderKey(keys.Side.Ask, price, slot, maker, nonce);

// the planner resolves the exact accounts off-chain
const ix = await tree.insertFastIx(reader, authority, key, value);
// node_idx / bump / path / spares: never touched by you
```

## Build and test

Add the Solana platform-tools to PATH, then from the repo root:

```
make test         # host unit + differential
make sbf          # build the on-chain program
make integration  # LiteSVM: smoke, inttest, cpitest, sdktest, obtest, alttest
make diff         # on-chain differential vs an oracle (8000 ops)
make fuzz FUZZ_ITERS=60000
make cu           # compute units at production scale
make all          # all of the above
make ts           # TS SDK: golden vectors + bankrun e2e
cd bench && ./run.sh   # the parallelism benchmark (real validator)
```

## Status and honesty

Deployed and live on devnet. The engine, SDK, and orderbook each went through rounds of in-house
adversarial review that ended in two consecutive clean passes, with a token-conservation invariant on
the order book.

"Two clean passes" did not mean done. A further pass in September 2026, after the hackathon
submission, found and fixed critical issues that the earlier rounds had missed:

| Where | Issue | Fix |
|---|---|---|
| Orderbook | A vault keeping a `close_authority` could be closed and re-created, redirecting all later escrow | Vaults must be the book PDA's ATAs; ownership re-checked on every deposit (#1) |
| Orderbook | The order key's slot came from the maker, so anyone could claim time priority | The slot is read from the clock (#2) |
| Orderbook | 1-atom orders could clog the best price; a pre-funded config PDA blocked a market id; unrepresentable asks could rest | Per-market `min_size`, pre-fund-safe account creation, `price*size` checked at place (#6) |
| Engine | A RangeScan scratch account could pass for a node | Exact header checks in `check_node` (#3) |
| Engine | A node created with 0 lamports was dropped after being linked in, bricking the tree; a pre-funded node PDA stopped all splits; a second header at a non-canonical bump shared a tree's nodes; >40 accounts were read past the array | One checked creation path: PDA address with canonical bump, non-zero rent, pre-fund-safe; `ka_num` bounded (#7) |

Each fix ships with a test that fails without it (inttest 70/70, obtest 99/99), and the fixed code was
rehearsed on devnet before going live. The original program ids could not be upgraded, because their
upgrade key is unavailable. The fixed programs were therefore deployed under new ids, and the venue was
rebuilt on them:

- Torna `DQW2KqoFvrLaBgkH9ig6TWmY9nWTVSwpyNisXELDxw3A`
- Orderbook `5FZVhBTp4TMvUz9XmheVuzyXULCeC4g4NMSego8GP2AC`

Other corrections to claims made at submission:

- The 4.6-7.1x parallelism figure was measured on a local Agave validator (the real banking stage) with
  `bench/run.sh`, not on devnet.
- Pyth equity feeds (NVDA, SPY) are wired in but need a Pyth Pro grant to return prices.
- With the fixes, a splitting insert costs ~56k CU at fanout 64 and ~76k at fanout 128 (previously ~38k
  and ~68k); both are well under the 200k default. The demo venue runs fanout 8.

None of this is a substitute for an external audit, which is pending; do not treat as
production-audited. See `demo/` for the live docs and a research writeup.

## License

MIT. See [LICENSE](LICENSE).
