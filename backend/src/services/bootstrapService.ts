// GET /api/bootstrap: semua yang dibutuhkan AppData di frontend dalam SATU request:
// master (bentuk sama dengan GET /api/master), meta, config, costs, names.
// Sebelumnya lima request terpisah, masing-masing dengan cek sesi dan sebagian memuat
// ulang seluruh ledger. Di sini semuanya diambil dari satu loadState() (biasanya dari cache).

import { CATS_IN, CATS_OUT, CHANNELS, GROUPS, METHODS, USE_CATS } from "../engine/vocab";
import { costsOf } from "./reportService";
import { loadState } from "./stateService";

const byName = <T extends { name: string }>(o: Record<string, T>) =>
  Object.values(o).sort((a, b) => a.name.localeCompare(b.name, "id"));

export const META = { catsIn: CATS_IN, catsOut: CATS_OUT, useCats: USE_CATS, groups: GROUPS, channels: CHANNELS, methods: METHODS };

export async function bootstrap() {
  const state = await loadState();
  const { master, entries } = state;

  const cust = new Set<string>(), sup = new Set<string>();
  for (const e of entries as unknown as Record<string, unknown>[]) {
    if (e.type === "sale" && typeof e.customer === "string" && e.customer) cust.add(e.customer);
    if ((e.type === "green_in" || e.type === "pack_in") && typeof e.supplier === "string" && e.supplier) sup.add(e.supplier);
  }
  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "id"));

  return {
    master: {
      greens: byName(master.greens),
      blends: byName(master.blends),
      packs: byName(master.packs),
      products: byName(master.products).sort((a, b) => a.name.localeCompare(b.name, "id") || a.grams - b.grams),
    },
    meta: META,
    config: master.config,
    costs: costsOf(state),
    names: { customers: sorted(cust), suppliers: sorted(sup) },
  };
}
