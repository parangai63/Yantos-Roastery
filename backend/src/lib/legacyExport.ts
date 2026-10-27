// Membaca ekspor database artifact di folder data/ (satu file JSON per
// dokumen) menjadi bentuk Master + LedgerEntry[] yang dipakai engine.
// Dipakai oleh prisma/seed.ts dan oleh test angka patokan.

import fs from "fs";
import path from "path";
import { DEFAULT_CONFIG } from "../engine/vocab";
import type { Config, LedgerEntry, Master } from "../engine/types";

export const DEFAULT_DATA_DIR = path.resolve(__dirname, "..", "..", "..", "data");

function readDir<T>(dir: string): T[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as T);
}

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}

export function loadLegacyExport(dataDir = DEFAULT_DATA_DIR): { master: Master; entries: LedgerEntry[] } {
  const configFile = path.join(dataDir, "config", "main.json");
  const rawConfig = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
  const config: Config = { ...DEFAULT_CONFIG, ...rawConfig };

  const master: Master = {
    greens: byId(readDir(path.join(dataDir, "greens"))),
    blends: byId(readDir<Master["blends"][string]>(path.join(dataDir, "blends")).map((b) => ({ ...b, recipe: b.recipe || [] }))),
    packs: byId(readDir(path.join(dataDir, "packs"))),
    products: byId(readDir(path.join(dataDir, "products"))),
    config,
  };

  // Ledger dipecah per bulan (2026-10.json, 2026-10_2.json, ...) berisi map entries.
  // Sama seperti rebuildEntries() lama: entri terhapus dan yang tak lengkap dibuang.
  const entries: LedgerEntry[] = [];
  for (const doc of readDir<{ entries?: Record<string, Record<string, unknown>> }>(path.join(dataDir, "ledger"))) {
    for (const [id, e] of Object.entries(doc.entries || {})) {
      if (e && !e.deleted && e.type && e.date) entries.push({ ...e, id } as unknown as LedgerEntry);
    }
  }
  return { master, entries };
}
