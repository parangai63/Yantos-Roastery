// Penulisan ledger. Entri hanya ditambah; "hapus" = deleted: true dan
// "tandai lunas" = patch paid/paidDate, sama seperti versi artifact.

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../prismaClient";
import { badRequest, notFound } from "../lib/httpError";
import { entryData, toEntry } from "../lib/mappers";
import { LEDGER_TYPES, type LedgerType, type SaleItem, type StockKind } from "../engine/types";
import { CATS_IN, CATS_OUT, USE_CATS } from "../engine/vocab";
import { loadMaster } from "./stateService";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STOCK_KINDS: StockKind[] = ["green", "roasted", "blend", "pack"];

type Body = Record<string, unknown>;

const str = (b: Body, k: string) => String(b[k] ?? "").trim();
const pos = (b: Body, k: string, label: string) => {
  const n = Number(b[k]);
  if (!(n > 0)) throw badRequest(`${label} harus lebih dari 0.`);
  return n;
};
const date = (b: Body, k = "date") => {
  const d = str(b, k);
  if (!DATE_RE.test(d)) throw badRequest("Tanggal tidak valid (format YYYY-MM-DD).");
  return d;
};
const opt = (b: Body, k: string) => str(b, k) || undefined;

// Membentuk entri bersih dari input klien. Field di luar daftar ini dibuang.
async function buildEntry(b: Body): Promise<Body> {
  const type = str(b, "type") as LedgerType;
  if (!LEDGER_TYPES.includes(type)) throw badRequest("Jenis transaksi tidak dikenal.");
  const master = await loadMaster();
  const need = (coll: Record<string, unknown>, id: string, label: string) => {
    if (!id || !coll[id]) throw badRequest(`${label} tidak ditemukan.`);
    return id;
  };
  const target = () => {
    const t = str(b, "target") as StockKind;
    if (!STOCK_KINDS.includes(t)) throw badRequest("Jenis stok tidak valid.");
    return t;
  };
  const base = { type, date: date(b), note: opt(b, "note") };
  const payable = () => {
    const paid = b.paid !== false;
    return { total: pos(b, "total", "Total"), supplier: opt(b, "supplier"), paid, paidDate: paid ? str(b, "paidDate") || base.date : undefined };
  };

  switch (type) {
    case "opening": {
      const t = target();
      return { ...base, target: t, itemId: str(b, "itemId"), qty: Number(b.qty) || 0, value: Number(b.value) || 0 };
    }
    case "green_in":
      return { ...base, greenId: need(master.greens, str(b, "greenId"), "Green bean"), kg: pos(b, "kg", "Jumlah kg"), ...payable() };
    case "pack_in":
      return { ...base, packId: need(master.packs, str(b, "packId"), "Kemasan"), qty: Math.round(pos(b, "qty", "Jumlah")), ...payable() };
    case "roast": {
      const inKg = pos(b, "inKg", "Berat green"), outKg = pos(b, "outKg", "Berat roasted");
      if (outKg > inKg) throw badRequest("Berat roasted tidak boleh melebihi berat green.");
      return { ...base, greenId: need(master.greens, str(b, "greenId"), "Green bean"), inKg, outKg, batch: opt(b, "batch") };
    }
    case "blend": {
      const parts = (Array.isArray(b.parts) ? b.parts : [])
        .map((p: Body) => ({ greenId: str(p, "greenId"), kg: Number(p.kg) || 0 }))
        .filter((p) => p.greenId && p.kg > 0);
      if (!parts.length) throw badRequest("Isi minimal satu komponen blend.");
      parts.forEach((p) => need(master.greens, p.greenId, "Roasted bean"));
      return { ...base, blendId: need(master.blends, str(b, "blendId"), "Blend"), parts };
    }
    case "usage": {
      const t = target();
      const category = str(b, "category");
      if (!USE_CATS.includes(category)) throw badRequest("Kategori stok keluar tidak valid.");
      const e: Body = { ...base, target: t, itemId: str(b, "itemId"), kg: pos(b, "kg", "Jumlah kg"), category };
      if (str(b, "packId") && Number(b.packQty) > 0) {
        e.packId = need(master.packs, str(b, "packId"), "Kemasan");
        e.packQty = Math.round(Number(b.packQty));
      }
      return e;
    }
    case "adjust": {
      const delta = Math.round((Number(b.delta) || 0) * 1000) / 1000;
      if (!delta) throw badRequest("Tidak ada selisih stok.");
      return { ...base, target: target(), itemId: str(b, "itemId"), delta };
    }
    case "sale": {
      // Detail item diambil dari daftar harga di server; klien hanya kirim productId, qty, price.
      const items: SaleItem[] = (Array.isArray(b.items) ? b.items : []).map((it: Body) => {
        const p = master.products[str(it, "productId")];
        if (!p) throw badRequest("Produk tidak ditemukan.");
        const qty = Math.round(Number(it.qty) || 0);
        const price = it.price == null ? p.price : Number(it.price) || 0;
        return { productId: p.id, name: p.name, kind: p.kind, beanId: p.beanId, grams: p.grams, packId: p.packId, qty, price };
      }).filter((i) => i.qty > 0);
      if (!items.length) throw badRequest("Tambahkan minimal satu produk.");
      const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0);
      const discount = Number(b.discount) || 0, shipping = Number(b.shipping) || 0;
      const paid = b.paid !== false;
      return {
        ...base, customer: opt(b, "customer"), channel: opt(b, "channel"), method: opt(b, "method"), items,
        subtotal, discount, shipping, total: subtotal - discount + shipping, paid,
        paidDate: paid ? base.date : undefined, due: !paid ? opt(b, "due") : undefined,
      };
    }
    case "kas": {
      const dir = b.dir === "in" ? "in" : "out";
      const category = str(b, "category");
      if (!(dir === "in" ? CATS_IN : CATS_OUT).includes(category)) throw badRequest("Kategori kas tidak sesuai arah transaksi.");
      const desc = str(b, "desc");
      if (!desc) throw badRequest("Isi keterangan.");
      return { ...base, dir, category, desc, amount: pos(b, "amount", "Nominal") };
    }
  }
}

export async function createEntry(body: Body, by: string) {
  const e = await buildEntry(body);
  const row = await prisma.ledgerEntry.create({
    data: { id: randomUUID(), type: e.type as LedgerType, date: e.date as string, by, data: entryData(e) },
  });
  return toEntry(row);
}

// order "recent" = urut waktu input (dipakai "Aktivitas terbaru"), default urut tanggal transaksi.
export async function listEntries(q: { month?: string; types?: string[]; limit?: number; order?: string }) {
  const where: Prisma.LedgerEntryWhereInput = { deleted: false };
  if (q.month) where.date = { startsWith: q.month };
  if (q.types?.length) where.type = { in: q.types.filter((t): t is LedgerType => LEDGER_TYPES.includes(t as LedgerType)) };
  const rows = await prisma.ledgerEntry.findMany({
    where, orderBy: q.order === "recent" ? [{ at: "desc" }] : [{ date: "desc" }, { at: "desc" }], take: q.limit,
  });
  return rows.map(toEntry);
}

// Nama pelanggan & supplier yang pernah dipakai, untuk isian otomatis di form.
export async function names() {
  const rows = await prisma.ledgerEntry.findMany({
    where: { deleted: false, type: { in: ["sale", "green_in", "pack_in"] } }, select: { type: true, data: true },
  });
  const cust = new Set<string>(), sup = new Set<string>();
  for (const r of rows) {
    const d = r.data as Prisma.JsonObject;
    if (r.type === "sale" && typeof d.customer === "string" && d.customer) cust.add(d.customer);
    if (r.type !== "sale" && typeof d.supplier === "string" && d.supplier) sup.add(d.supplier);
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "id"));
  return { customers: sort(cust), suppliers: sort(sup) };
}

async function getRow(id: string) {
  const row = await prisma.ledgerEntry.findUnique({ where: { id } });
  if (!row || row.deleted) throw notFound("Transaksi tidak ditemukan.");
  return row;
}

export async function markPaid(id: string, paidDate: string) {
  const row = await getRow(id);
  if (!["sale", "green_in", "pack_in"].includes(row.type)) throw badRequest("Transaksi ini tidak punya status lunas.");
  if (!DATE_RE.test(paidDate)) throw badRequest("Tanggal lunas tidak valid.");
  const data = { ...(row.data as Prisma.JsonObject), paid: true, paidDate };
  return toEntry(await prisma.ledgerEntry.update({ where: { id }, data: { data } }));
}

export async function softDelete(id: string) {
  await getRow(id);
  await prisma.ledgerEntry.update({ where: { id }, data: { deleted: true } });
}
