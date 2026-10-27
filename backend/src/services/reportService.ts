// Laporan siap tampil untuk frontend. Semua angka berasal dari compute();
// tidak ada yang dibaca dari kolom tersimpan.

import {
  alertsList, avgOf, cashUntil, distrib, labaOf, minOf, monthOf, productCost, yieldOf,
} from "../engine/compute";
import type { StockKind } from "../engine/types";
import { loadState } from "./stateService";

const pad = (n: number) => String(n).padStart(2, "0");
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const addMonths = (m: string, k: number) => {
  let y = +m.slice(0, 4), mo = +m.slice(5, 7) + k;
  while (mo < 1) { mo += 12; y--; }
  while (mo > 12) { mo -= 12; y++; }
  return y + "-" + pad(mo);
};

export async function summary(month: string) {
  const { master, C } = await loadState();
  const x = monthOf(C, month);
  const months = [-5, -4, -3, -2, -1, 0].map((k) => addMonths(month, k));
  const overdue = C.recv.filter((e) => e.due && e.due < today());
  return {
    month,
    kpi: {
      cin: x.cin, cout: x.cout, laba: labaOf(master, x), basis: master.config.basis, bal: C.bal,
      recvTotal: C.recv.reduce((a, e) => a + (+e.total || 0), 0), recvCount: C.recv.length,
      invT: C.invT, inv: C.inv,
    },
    chart: months.map((m) => ({ month: m, cin: monthOf(C, m).cin, cout: monthOf(C, m).cout })),
    alerts: alertsList(master, C),
    overdue: { count: overdue.length, total: overdue.reduce((a, e) => a + (+e.total || 0), 0) },
  };
}

const SRC: Record<StockKind, "greens" | "blends" | "packs"> = { green: "greens", roasted: "greens", blend: "blends", pack: "packs" };

export async function stock(kind: StockKind) {
  const { master, C } = await loadState();
  const rows = Object.values(master[SRC[kind]]).map((x) => {
    const s = C.st[kind][x.id];
    const qty = s?.qty ?? 0;
    const min = minOf(kind, x as never);
    return {
      id: x.id, name: x.name, active: x.active, qty, val: Math.max(0, s?.val ?? 0),
      avg: s ? avgOf(s) || C.cost(kind, x.id) : C.cost(kind, x.id),
      min, status: qty <= 1e-6 ? "habis" : min && qty < min ? "menipis" : "aman",
      yield: kind === "roasted" ? yieldOf(C, x.id) : undefined,
      roastIn: kind === "roasted" ? C.roast[x.id]?.in ?? 0 : undefined,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "id"));
  return { kind, rows, total: C.inv[kind] };
}

export async function monthly(month: string) {
  const { master, C } = await loadState();
  const x = monthOf(C, month);
  const laba = labaOf(master, x);
  const start = cashUntil(C, addMonths(month, -1));
  const cats = Object.entries(x.cat);
  return {
    month, basis: master.config.basis, config: master.config,
    start, end: start + x.cin - x.cout, cin: x.cin, cout: x.cout,
    ins: cats.filter(([, v]) => v.in).map(([k, v]) => ({ cat: k, amt: v.in })).sort((a, b) => b.amt - a.amt),
    outs: cats.filter(([, v]) => v.out).map(([k, v]) => ({ cat: k, amt: v.out })).sort((a, b) => b.amt - a.amt),
    laba, distrib: distrib(master, laba),
    realized: (x.cat["Distribusi/Dividen (Realisasi)"] || { out: 0 }).out,
  };
}

export async function yearly(year: string) {
  const { master, C } = await loadState();
  let kas = cashUntil(C, `${+year - 1}-12`);
  const rows = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${pad(i + 1)}`, x = monthOf(C, m), laba = labaOf(master, x), d = distrib(master, laba);
    const awal = kas;
    kas += x.cin - x.cout;
    return { month: m, cin: x.cin, cout: x.cout, laba, shares: d.shares, saving: d.saving, sisa: d.sisa, awal, akhir: kas };
  });
  return { year, shareLabels: master.config.shares.map((s) => s.label), rows };
}

export async function hpp(month: string) {
  const { master, C } = await loadState();
  const x = monthOf(C, month);
  const sold = C.soldBy[month] || {};
  const products = Object.values(master.products).filter((p) => p.active !== false).map((p) => {
    const cost = productCost(C, p);
    return {
      id: p.id, name: p.name, group: p.group || "Lainnya", grams: p.grams, packId: p.packId, cost, price: p.price,
      margin: p.price - cost, soldQty: sold[p.id]?.qty || 0, rev: sold[p.id]?.rev || 0,
    };
  });
  return {
    month, sales: x.sales, disc: x.disc, cogs: x.cogs, gross: x.sales - x.disc - x.cogs,
    usage: Object.entries(x.usage).map(([cat, u]) => ({ cat, ...u })).sort((a, b) => b.val - a.val),
    products,
  };
}

// Ringkasan tab Produksi: roasting, blend, terjual lewat nota, stok keluar per kategori.
export async function production(month: string) {
  const { C } = await loadState();
  const x = monthOf(C, month);
  return {
    month, roastIn: x.roastIn, roastOut: x.roastOut, blendKg: x.blendKg, kgSold: x.kgSold,
    usage: Object.entries(x.usage).map(([cat, u]) => ({ cat, ...u })).sort((a, b) => b.kg - a.kg),
  };
}

export async function bills() {
  const { C } = await loadState();
  return {
    recv: C.recv.slice().sort((a, b) => (a.due || a.date).localeCompare(b.due || b.date)),
    pay: C.pay.slice().sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function cashbook(month: string) {
  const { C } = await loadState();
  const x = monthOf(C, month), start = cashUntil(C, addMonths(month, -1));
  return { month, start, cin: x.cin, cout: x.cout, end: start + x.cin - x.cout, lines: C.cash.filter((c) => c.date.startsWith(month)) };
}

// Biaya rata-rata saat ini per item, untuk estimasi di form (HPP penjualan, nilai stok keluar).
export async function costs() {
  const { master, C } = await loadState();
  const out: Record<StockKind, Record<string, { qty: number; cost: number }>> = { green: {}, roasted: {}, blend: {}, pack: {} };
  (Object.keys(SRC) as StockKind[]).forEach((k) => {
    for (const id in master[SRC[k]]) out[k][id] = { qty: C.st[k][id]?.qty ?? 0, cost: C.cost(k, id) };
  });
  return out;
}
