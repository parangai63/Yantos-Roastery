// Konversi baris Prisma <-> bentuk engine. Decimal diubah ke number di sini
// saja, supaya engine dan response API selalu bekerja dengan angka biasa.

import type { Prisma } from "@prisma/client";
import type * as DB from "@prisma/client";
import { DEFAULT_CONFIG } from "../engine/vocab";
import type { Blend, Config, GreenBean, LedgerEntry, Pack, Product, Routine, Share } from "../engine/types";

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

export const toGreen = (g: DB.GreenBean): GreenBean => ({
  id: g.id, name: g.name, category: g.category, price: num(g.price), minKg: num(g.minKg),
  minRoastedKg: num(g.minRoastedKg), supplier: g.supplier, active: g.active,
});

export const toBlend = (b: DB.Blend & { recipe: DB.BlendRecipeItem[] }): Blend => ({
  id: b.id, name: b.name, cogs: num(b.cogs), minKg: num(b.minKg), active: b.active,
  recipe: b.recipe.map((r) => ({ greenId: r.greenId, pct: num(r.pct) })),
});

export const toPack = (p: DB.Pack): Pack => ({
  id: p.id, name: p.name, unit: p.unit, price: num(p.price), minQty: num(p.minQty), active: p.active,
});

export const toProduct = (p: DB.Product): Product => ({
  id: p.id, name: p.name, kind: p.kind, beanId: (p.kind === "blend" ? p.blendId : p.greenId) || "",
  grams: p.grams, price: num(p.price), group: p.group, packId: p.packId || "", active: p.active,
});

export const productData = (p: Product) => ({
  name: p.name, kind: p.kind, grams: Math.round(+p.grams || 0), price: +p.price || 0, group: p.group || "Lainnya",
  greenId: p.kind === "roasted" ? p.beanId : null,
  blendId: p.kind === "blend" ? p.beanId : null,
  packId: p.packId || null, active: p.active !== false,
});

export const toConfig = (c: DB.Config | null): Config =>
  c
    ? {
        bizName: c.bizName, basis: c.basis === "op" ? "op" : "kas", savingPct: num(c.savingPct),
        savingMin: num(c.savingMin), shares: c.shares as unknown as Share[], routine: c.routine as unknown as Routine[],
      }
    : { ...DEFAULT_CONFIG };

// LedgerEntry di DB = kolom umum + data (JSON). Engine memakai bentuk datar.
export const toEntry = (row: DB.LedgerEntry): LedgerEntry =>
  ({
    ...(row.data as Record<string, unknown>),
    id: row.id, type: row.type, date: row.date, at: row.at.toISOString(), by: row.by,
  }) as LedgerEntry;

const COMMON = new Set(["id", "type", "date", "at", "by", "deleted"]);
export const entryData = (e: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(e).filter(([k, v]) => !COMMON.has(k) && v !== undefined)) as Prisma.InputJsonObject;
