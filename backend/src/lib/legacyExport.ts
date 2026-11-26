// Membaca ekspor database artifact di folder data/ (satu file JSON per
// dokumen) menjadi bentuk Master + LedgerEntry[] yang dipakai engine.
// Dipakai oleh prisma/seed.ts dan oleh test angka patokan.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DEFAULT_CONFIG } from "../engine/vocab";
import type { Config, GreenBean, LedgerEntry, Master, Supplier } from "../engine/types";

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

  // Ekspor lama menyimpan supplier sebagai teks di green bean; dipisah ke master supplier.
  const rawGreens = readDir<GreenBean & { supplier?: string }>(path.join(dataDir, "greens"));
  const greens = rawGreens.map(({ supplier: _s, ...g }) => g); // eslint-disable-line @typescript-eslint/no-unused-vars

  // Ledger dipecah per bulan (2026-10.json, 2026-10_2.json, ...) berisi map entries.
  // Sama seperti rebuildEntries() lama: entri terhapus dan yang tak lengkap dibuang.
  const entries: LedgerEntry[] = [];
  for (const doc of readDir<{ entries?: Record<string, Record<string, unknown>> }>(path.join(dataDir, "ledger"))) {
    for (const [id, e] of Object.entries(doc.entries || {})) {
      if (e && !e.deleted && e.type && e.date) entries.push({ ...e, id } as unknown as LedgerEntry);
    }
  }

  const master: Master = {
    greens: byId(greens),
    blends: byId(readDir<Master["blends"][string]>(path.join(dataDir, "blends")).map((b) => ({ ...b, recipe: b.recipe || [] }))),
    packs: byId(readDir(path.join(dataDir, "packs"))),
    products: byId(readDir(path.join(dataDir, "products"))),
    suppliers: suppliersFromText(rawGreens.map((g) => ({ greenId: g.id, name: g.supplier })), entries),
    config,
  };
  return { master, entries };
}

/** id supplier dari nama, sama dengan masterService.newId dan migrasi 20261126000000_suppliers. */
export const supplierIdOf = (name: string) => {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return "s_" + (slug || crypto.createHash("md5").update(name).digest("hex").slice(0, 8));
};

/**
 * Bentuk master supplier dari nama supplier berupa teks (data lama): dari green bean dan dari
 * transaksi green_in/pack_in. Entri beli yang punya nama supplier diberi supplierId (diubah di tempat).
 */
export function suppliersFromText(
  greenSuppliers: { greenId: string; name?: string }[], entries: LedgerEntry[],
): Record<string, Supplier> {
  const out: Record<string, Supplier> = {};
  const add = (raw: string | undefined, kind: "greenIds" | "packIds", itemId: string) => {
    const name = (raw || "").trim();
    if (!name) return undefined;
    const id = supplierIdOf(name);
    const s = (out[id] ||= { id, name, phone: "", address: "", note: "", greenIds: [], packIds: [], active: true });
    if (itemId && !s[kind].includes(itemId)) s[kind].push(itemId);
    return id;
  };
  for (const g of greenSuppliers) add(g.name, "greenIds", g.greenId);
  for (const e of entries) {
    if (e.type === "green_in") { const id = add(e.supplier, "greenIds", e.greenId); if (id) e.supplierId = id; }
    if (e.type === "pack_in") { const id = add(e.supplier, "packIds", e.packId); if (id) e.supplierId = id; }
  }
  return out;
}
