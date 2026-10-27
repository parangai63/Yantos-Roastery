// Label dan deskripsi entri ledger (port dari describe() di app.js lama).

import type { LedgerEntry, MasterData, StockKind } from "../types";
import { nf, pct, today } from "./format";

export const TYPE_LABEL: Record<LedgerEntry["type"], string> = {
  opening: "Saldo awal", green_in: "Beli green", pack_in: "Beli kemasan", roast: "Roasting", blend: "Racik blend",
  usage: "Stok keluar", sale: "Penjualan", kas: "Kas", adjust: "Stok opname",
};
export const T_LABEL: Record<StockKind, string> = { green: "Green bean", roasted: "Roasted bean", blend: "Blend", pack: "Kemasan" };
export const T_UNIT: Record<StockKind, string> = { green: "kg", roasted: "kg", blend: "kg", pack: "pcs" };
export const T_SRC: Record<StockKind, "greens" | "blends" | "packs"> = { green: "greens", roasted: "greens", blend: "blends", pack: "packs" };
export const TYPE_TONE: Partial<Record<LedgerEntry["type"], "ok" | "warn" | "bean" | "roast">> = {
  green_in: "bean", roast: "roast", blend: "roast", usage: "warn", sale: "ok", adjust: "warn",
};

// Item aktif urut nama (activeList() lama).
export const activeList = <T extends { active: boolean; name: string }>(list: T[]) =>
  list.filter((x) => x.active !== false).sort((a, b) => (a.name || "").localeCompare(b.name || "", "id"));

export function namer(m: MasterData) {
  const find = <T extends { id: string; name: string }>(list: T[], id: string, fallback: string) =>
    list.find((x) => x.id === id)?.name || fallback;
  const g = (id: string) => find(m.greens, id, "Green bean terhapus");
  const b = (id: string) => find(m.blends, id, "Blend terhapus");
  const p = (id: string) => find(m.packs, id, "Kemasan terhapus");
  const item = (t: StockKind, id: string) => (t === "pack" ? p(id) : t === "blend" ? b(id) : g(id));
  const label = (t: StockKind, id: string) => item(t, id) + (t === "roasted" ? " (roasted)" : t === "green" ? " (green)" : "");
  return { g, b, p, item, label };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function describe(e: LedgerEntry, m: MasterData): { text: string; amt: number | null } {
  const n = namer(m);
  const x = e as any;
  switch (e.type) {
    case "opening": return { text: `${n.label(x.target, x.itemId)} · ${nf(x.qty)} ${T_UNIT[x.target as StockKind]}`, amt: null };
    case "green_in": return { text: `${n.g(x.greenId)} · ${nf(x.kg)} kg${x.supplier ? " dari " + x.supplier : ""}`, amt: -(+x.total || 0) };
    case "pack_in": return { text: `${n.p(x.packId)} · ${nf(x.qty, 0)} pcs${x.supplier ? " dari " + x.supplier : ""}`, amt: -(+x.total || 0) };
    case "roast": {
      const s = x.inKg ? 1 - x.outKg / x.inKg : 0;
      return { text: `${n.g(x.greenId)} · ${nf(x.inKg)} → ${nf(x.outKg)} kg (susut ${pct(s)})${x.batch ? " · " + x.batch : ""}`, amt: null };
    }
    case "blend": {
      const parts = (x.parts || []) as { greenId: string; kg: number }[];
      return { text: `${n.b(x.blendId)} · ${nf(parts.reduce((a, p) => a + (+p.kg || 0), 0))} kg dari ${parts.map((p) => `${n.g(p.greenId)} ${nf(p.kg)}`).join(" + ")}`, amt: null };
    }
    case "usage": return { text: `${n.label(x.target, x.itemId)} ${nf(x.kg)} kg · ${x.category}${x.packId ? ` · ${nf(x.packQty, 0)}× ${n.p(x.packId)}` : ""}${x.note ? " · " + x.note : ""}`, amt: null };
    case "sale": return { text: `${x.customer || "Pelanggan umum"} · ${(x.items || []).map((i: any) => `${nf(i.qty, 0)}× ${i.name}`).join(", ")}`, amt: +x.total || 0 };
    case "kas": return { text: `${x.desc || x.category}${x.desc ? " · " + x.category : ""}`, amt: (x.dir === "in" ? 1 : -1) * (+x.amount || 0) };
    case "adjust": return { text: `${n.label(x.target, x.itemId)} · ${x.delta > 0 ? "+" : ""}${nf(x.delta)} ${T_UNIT[x.target as StockKind] || ""}${x.note ? " · " + x.note : ""}`, amt: null };
  }
  return { text: e.type, amt: null };
}

export function payStatus(e: LedgerEntry): { label: string; tone: "ok" | "warn" | "bad" } | null {
  const x = e as any;
  if (e.type === "sale") {
    if (x.paid) return { label: "Lunas", tone: "ok" };
    if (x.due && x.due < today()) return { label: "Lewat tempo", tone: "bad" };
    return { label: "Belum lunas", tone: "warn" };
  }
  if (e.type === "green_in" || e.type === "pack_in") return x.paid ? { label: "Lunas", tone: "ok" } : { label: "Belum dibayar", tone: "warn" };
  return null;
}
