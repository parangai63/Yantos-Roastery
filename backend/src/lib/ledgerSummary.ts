// Kalimat singkat untuk riwayat aktivitas tentang satu entri ledger
// (versi ringkas dari describe() di frontend/src/utils/ledger.ts).

import type { Master } from "../engine/types";
import { fmtNum, fmtRp } from "./activity";

export const TYPE_LABEL: Record<string, string> = {
  opening: "saldo awal", green_in: "pembelian green", pack_in: "pembelian kemasan", roast: "roasting", blend: "racik blend",
  usage: "stok keluar", sale: "penjualan", kas: "kas", adjust: "stok opname",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function entrySummary(e: Record<string, any>, m: Master): string {
  const g = (id: string) => m.greens[id]?.name || "green bean terhapus";
  const b = (id: string) => m.blends[id]?.name || "blend terhapus";
  const p = (id: string) => m.packs[id]?.name || "kemasan terhapus";
  const item = (t: string, id: string) => (t === "pack" ? p(id) : t === "blend" ? b(id) : g(id)) + (t === "roasted" ? " (roasted)" : "");
  const date = e.date ? ` · ${e.date}` : "";
  const label = TYPE_LABEL[e.type] || e.type;
  let what = "";
  switch (e.type) {
    case "opening": what = `${item(e.target, e.itemId)} ${fmtNum(e.qty)}`; break;
    case "green_in": what = `${g(e.greenId)} ${fmtNum(e.kg)} kg · ${fmtRp(e.total)}`; break;
    case "pack_in": what = `${p(e.packId)} ${fmtNum(e.qty)} pcs · ${fmtRp(e.total)}`; break;
    case "roast": what = `${g(e.greenId)} ${fmtNum(e.inKg)} → ${fmtNum(e.outKg)} kg`; break;
    case "blend": what = `${b(e.blendId)} ${fmtNum((e.parts || []).reduce((a: number, x: any) => a + (+x.kg || 0), 0))} kg`; break;
    case "usage": what = `${item(e.target, e.itemId)} ${fmtNum(e.kg)} kg · ${e.category}`; break;
    case "adjust": what = `${item(e.target, e.itemId)} ${e.delta > 0 ? "+" : ""}${fmtNum(e.delta)}`; break;
    case "sale": what = `${e.customer || "Pelanggan umum"} · ${fmtRp(e.total)}`; break;
    case "kas": what = `${e.dir === "in" ? "masuk" : "keluar"} ${fmtRp(e.amount)} · ${e.desc || e.category}`; break;
  }
  return `${label}${what ? ": " + what : ""}${date}`;
}
