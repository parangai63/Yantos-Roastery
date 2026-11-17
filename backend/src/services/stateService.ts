// Memuat seluruh master + ledger dari database lalu menjalankan engine.
//
// Cache: hasil compute() disimpan di memori proses, ditandai dengan angka `data_rev.rev`.
// Trigger Postgres menaikkan angka itu di setiap perubahan tabel master/config/ledger
// (migrasi 20261117000000_session_idle_data_rev), jadi setiap request cukup membaca satu
// angka. Bila sama dengan yang di cache, hitungan lama dipakai; bila beda, muat ulang.
// Tetap tidak ada hasil hitungan yang disimpan ke database.
//
// Hasil di cache dipakai bersama oleh banyak request: JANGAN mengubah (mutate) objek
// master/entries/C yang dikembalikan; salin dulu (slice, map, spread) sebelum sort/ubah.

import prisma from "../prismaClient";
import { compute, type ComputeResult } from "../engine/compute";
import type { LedgerEntry, Master } from "../engine/types";
import { toBlend, toConfig, toEntry, toGreen, toPack, toProduct } from "../lib/mappers";
import { mark, timed } from "../lib/timing";

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));

export async function loadMaster(): Promise<Master> {
  const [greens, blends, packs, products, config] = await Promise.all([
    prisma.greenBean.findMany(),
    prisma.blend.findMany({ include: { recipe: true } }),
    prisma.pack.findMany(),
    prisma.product.findMany(),
    prisma.config.findUnique({ where: { id: "main" } }),
  ]);
  return {
    greens: byId(greens.map(toGreen)),
    blends: byId(blends.map(toBlend)),
    packs: byId(packs.map(toPack)),
    products: byId(products.map(toProduct)),
    config: toConfig(config),
  };
}

export async function loadEntries(): Promise<LedgerEntry[]> {
  const rows = await prisma.ledgerEntry.findMany({ where: { deleted: false } });
  return rows.map(toEntry);
}

export interface State {
  master: Master;
  entries: LedgerEntry[];
  C: ComputeResult;
}

async function loadFresh(): Promise<State> {
  const [master, entries] = await timed("db", () => Promise.all([loadMaster(), loadEntries()]));
  const C = await timed("compute", () => compute(master, entries));
  return { master, entries, C };
}

/** Angka revisi data, atau null bila tabel data_rev belum ada (migrasi belum dijalankan). */
async function currentRev(): Promise<string | null> {
  try {
    const row = await timed("rev", () => prisma.dataRev.findUnique({ where: { id: 1 } }));
    return row ? row.rev.toString() : null;
  } catch {
    return null;
  }
}

let cached: { rev: string; state: State } | null = null;
// Beberapa request bersamaan dengan rev yang sama cukup memuat sekali.
let loading: { rev: string; promise: Promise<State> } | null = null;

export async function loadState(): Promise<State> {
  // rev dibaca SEBELUM data dimuat. Bila ada tulis di antaranya, data yang dimuat lebih baru
  // dari rev-nya, dan request berikutnya hanya akan memuat ulang (tidak pernah basi).
  const rev = await currentRev();
  if (rev === null) {
    mark("cache", "off");
    return loadFresh();
  }
  if (cached?.rev === rev) {
    mark("cache", "hit");
    return cached.state;
  }
  mark("cache", "miss");
  if (loading?.rev === rev) return loading.promise;
  const promise = loadFresh();
  loading = { rev, promise };
  promise
    .then((state) => { cached = { rev, state }; })
    .catch(() => undefined)
    .finally(() => { if (loading?.promise === promise) loading = null; });
  return promise;
}
