// Reads the Explorer's view of one book -- the tree header, every leaf, every resting order -- and the
// market's vault balances. Pure over an AccountReader, so the server (/api/explorer, cached and shared
// by every viewer) and anything else can use the same decoding.
import { PublicKey } from "@solana/web3.js";
import { keys, type Tree, type Header, type AccountReader } from "torna-sdk";

const NODE_HDR = 44, N_KEY_COUNT = 2, N_NEXT_LEAF = 20, KEY = 32;
const u64le = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, true);
const u64be = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, false);
const u16le = (d: Uint8Array, o: number) => new DataView(d.buffer, d.byteOffset, d.byteLength).getUint16(o, true);
const hex = (d: Uint8Array) => Buffer.from(d).toString("hex");

export interface Order { price: bigint; size: bigint; maker: string; keyHex: string; leaf: bigint; slot: bigint; }
export interface Leaf { idx: bigint; pk: string; next: bigint; count: number; }
export interface SideView { header: Header; leaves: Leaf[]; orders: Order[]; }
export interface Overview { baseVault: bigint; quoteVault: bigint; baseDec: number; quoteDec: number; }

export async function readSide(r: AccountReader, tree: Tree, side: typeof keys.Side.Ask | typeof keys.Side.Bid): Promise<SideView | null> {
  const header = await tree.header(r);
  if (!header) return null;
  const voff = NODE_HDR + (header.fanout + 1) * KEY;
  const leaves: Leaf[] = [];
  const orders: Order[] = [];
  let idx = header.leftmost;
  let guard = 0;
  while (idx !== 0n && guard++ < 64) {
    const pk = tree.nodePda(idx)[0];
    const d = await r.accountData(pk);
    if (!d) break;
    const cnt = u16le(d, N_KEY_COUNT);
    let live = 0;
    for (let i = 0; i < cnt; i++) {
      const keyBytes = d.subarray(NODE_HDR + i * KEY, NODE_HDR + i * KEY + KEY);
      const size = u64be(d, voff + i * header.valueSize + 32);
      if (size === 0n) continue;
      live++;
      orders.push({
        price: keys.priceOf(side, keyBytes), size,
        maker: new PublicKey(d.subarray(voff + i * header.valueSize, voff + i * header.valueSize + 32)).toBase58(),
        keyHex: hex(keyBytes), slot: u64be(keyBytes, 8), leaf: idx,
      });
    }
    leaves.push({ idx, pk: pk.toBase58(), next: u64le(d, N_NEXT_LEAF), count: live });
    idx = u64le(d, N_NEXT_LEAF);
  }
  return { header, leaves, orders };
}
export async function tokenAmount(r: AccountReader, addr: string): Promise<bigint> {
  const d = await r.accountData(new PublicKey(addr));
  return d && d.length >= 72 ? u64le(d, 64) : 0n;
}
export async function mintDecimals(r: AccountReader, addr: string): Promise<number> {
  const d = await r.accountData(new PublicKey(addr));
  return d && d.length >= 45 ? d[44] : 0;
}


/** The whole Explorer payload for one market. */
export interface ExplorerView { ask: SideView | null; bid: SideView | null; ov: Overview }

// JSON cannot carry bigint or PublicKey: bigints travel as {"$b": "..."}, the header's authority as
// base58, and parseExplorer puts both back.
export const stringifyExplorer = (v: ExplorerView): string =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? { $b: x.toString() } : x));
export function parseExplorer(text: string): ExplorerView {
  const v = JSON.parse(text, (_k, x) => (x && typeof x === "object" && "$b" in x ? BigInt(x.$b) : x)) as ExplorerView;
  for (const s of [v.ask, v.bid]) if (s) s.header.authority = new PublicKey(s.header.authority as unknown as string);
  return v;
}
