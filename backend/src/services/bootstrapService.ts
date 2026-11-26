// GET /api/bootstrap: semua yang dibutuhkan AppData di frontend dalam SATU request:
// master (bentuk sama dengan GET /api/master), meta, config, costs, names, buys.
// Sebelumnya lima request terpisah, masing-masing dengan cek sesi dan sebagian memuat
// ulang seluruh ledger. Di sini semuanya diambil dari satu loadState() (biasanya dari cache).

import { CATS_IN, CATS_OUT, CHANNELS, GROUPS, METHODS, USE_CATS } from "../engine/vocab";
import type { LedgerEntry } from "../engine/types";
import { costsOf } from "./reportService";
import { loadState } from "./stateService";

const byName = <T extends { name: string }>(o: Record<string, T>) =>
  Object.values(o).sort((a, b) => a.name.localeCompare(b.name, "id"));

export const META = { catsIn: CATS_IN, catsOut: CATS_OUT, useCats: USE_CATS, groups: GROUPS, channels: CHANNELS, methods: METHODS };

export async function bootstrap() {
  const state = await loadState();
  const { master, entries } = state;

  const cust = new Set<string>();
  for (const e of entries) if (e.type === "sale" && e.customer) cust.add(e.customer);
  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "id"));

  return {
    master: {
      greens: byName(master.greens),
      blends: byName(master.blends),
      packs: byName(master.packs),
      products: byName(master.products).sort((a, b) => a.name.localeCompare(b.name, "id") || a.grams - b.grams),
      suppliers: byName(master.suppliers),
    },
    meta: META,
    config: master.config,
    costs: costsOf(state),
    names: { customers: sorted(cust) },
    buys: lastBuys(entries),
  };
}

/**
 * Pembelian terakhir untuk isian otomatis form beli:
 * - prices["<supplierId>|<itemId>"] = harga satuan (per kg / per pcs) & tanggal pembelian terakhir
 * - lastSupplier[itemId] = supplier pembelian terakhir item itu
 * itemId = greenId atau packId (prefix g_/p_ berbeda, jadi aman digabung).
 */
export function lastBuys(entries: LedgerEntry[]) {
  const buys = entries
    .filter((e) => (e.type === "green_in" || e.type === "pack_in") && e.supplierId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  const prices: Record<string, { price: number; date: string }> = {};
  const lastSupplier: Record<string, string> = {};
  for (const e of buys) {
    if (e.type !== "green_in" && e.type !== "pack_in") continue;
    const itemId = e.type === "green_in" ? e.greenId : e.packId;
    const qty = e.type === "green_in" ? e.kg : e.qty;
    if (!(qty > 0) || !(e.total > 0)) continue;
    prices[`${e.supplierId}|${itemId}`] = { price: e.total / qty, date: e.date };
    lastSupplier[itemId] = e.supplierId!;
  }
  return { prices, lastSupplier };
}
