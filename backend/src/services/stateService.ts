// Memuat seluruh master + ledger dari database lalu menjalankan engine.
// Data Yantos kecil (ratusan entri), jadi hitung ulang setiap request
// masih murah. Kalau nanti lambat, tambahkan cache di sini, bukan simpan
// hasil hitungan ke database.

import prisma from "../prismaClient";
import { compute, type ComputeResult } from "../engine/compute";
import type { LedgerEntry, Master } from "../engine/types";
import { toBlend, toConfig, toEntry, toGreen, toPack, toProduct } from "../lib/mappers";

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

export async function loadState(): Promise<State> {
  const [master, entries] = await Promise.all([loadMaster(), loadEntries()]);
  return { master, entries, C: compute(master, entries) };
}
