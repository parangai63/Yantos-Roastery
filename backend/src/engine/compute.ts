// Inti perhitungan: memutar ulang semua entri ledger berurutan tanggal dan
// menghasilkan stok, nilai stok (rata-rata tertimbang), ringkasan bulanan,
// buku kas, piutang, dan hutang.
//
// Port langsung dari compute() di src/app.js lama. Urutan operasi dan
// pembulatan sengaja dibiarkan sama supaya angka patokan di CLAUDE.md tidak
// bergeser. Jangan "merapikan" aritmetika di sini tanpa menjalankan test.

import { NON_OP } from "./vocab";
import type {
  LedgerEntry, Master, Product, SaleEntry, GreenInEntry, PackInEntry, StockKind,
} from "./types";

export interface Stock {
  qty: number;
  val: number;
  last: number; // biaya rata-rata terakhir, dipakai saat stok sudah habis
}

export interface CatFlow {
  in: number;
  out: number;
}

export interface MonthSummary {
  cin: number;
  cout: number;
  cat: Record<string, CatFlow>;
  nonIn: number;
  nonOut: number;
  sales: number;
  disc: number;
  ship: number;
  cogs: number;
  orders: number;
  kgSold: number;
  roastIn: number;
  roastOut: number;
  blendKg: number;
  usage: Record<string, { kg: number; val: number }>;
  adj: number;
  buyGreen: number;
  buyPack: number;
}

export interface CashLine {
  date: string;
  dir: "in" | "out";
  cat: string;
  amt: number;
  desc: string;
  entryId: string;
  at: string;
  bal: number;
}

export interface SoldLine {
  qty: number;
  rev: number;
  name: string;
}

// Nilai turunan per entri (dulu ditempel ke objek entri sebagai e._kg dst.)
export interface Derived {
  kg?: number;
  val?: number;
  cogs?: number;
}

export type StockTable = Record<StockKind, Record<string, Stock>>;
export type CostFn = (t: StockKind, id: string) => number;

export interface ComputeResult {
  st: StockTable;
  M: Record<string, MonthSummary>;
  roast: Record<string, { in: number; out: number }>;
  recv: SaleEntry[];
  pay: (GreenInEntry | PackInEntry)[];
  soldBy: Record<string, Record<string, SoldLine>>;
  cash: CashLine[];
  bal: number;
  inv: Record<StockKind, number>;
  invT: number;
  derived: Record<string, Derived>;
  cost: CostFn;
}

const NF = new Map<number, Intl.NumberFormat>();
export const nf = (n: number, d = 2) => {
  let f = NF.get(d);
  if (!f) NF.set(d, (f = new Intl.NumberFormat("id-ID", { maximumFractionDigits: d })));
  return f.format(n || 0);
};

export const avgOf = (s: Stock) => (s.qty > 1e-9 ? s.val / s.qty : s.last);

export const newMonth = (): MonthSummary => ({
  cin: 0, cout: 0, cat: {}, nonIn: 0, nonOut: 0, sales: 0, disc: 0, ship: 0, cogs: 0, orders: 0, kgSold: 0,
  roastIn: 0, roastOut: 0, blendKg: 0, usage: {}, adj: 0, buyGreen: 0, buyPack: 0,
});

const isStockKind = (t: string): t is StockKind => t === "green" || t === "roasted" || t === "blend" || t === "pack";

function makeCost(master: Master, st: StockTable, roast: ComputeResult["roast"]): CostFn {
  const cost: CostFn = (t, id) => {
    const s = st[t] && st[t][id];
    const a = s ? avgOf(s) : 0;
    if (a) return a;
    if (t === "green") return +(master.greens[id]?.price ?? 0) || 0;
    if (t === "roasted") {
      const r = roast[id];
      const y = r && r.in ? r.out / r.in : 0.8;
      const gc = cost("green", id);
      return gc ? gc / y : 0;
    }
    if (t === "blend") return +(master.blends[id]?.cogs ?? 0) || 0;
    if (t === "pack") return +(master.packs[id]?.price ?? 0) || 0;
    return 0;
  };
  return cost;
}

export const sortKey = (e: { date: string; at?: string }) => e.date + (e.at || "");

export function compute(master: Master, entries: LedgerEntry[]): ComputeResult {
  const gName = (id: string) => master.greens[id]?.name || "Green bean terhapus";
  const pName = (id: string) => master.packs[id]?.name || "Kemasan terhapus";

  const E = entries.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const st: StockTable = { green: {}, roasted: {}, blend: {}, pack: {} };
  const roast: ComputeResult["roast"] = {};
  const M: Record<string, MonthSummary> = {};
  const recv: SaleEntry[] = [];
  const pay: (GreenInEntry | PackInEntry)[] = [];
  const soldBy: ComputeResult["soldBy"] = {};
  const cash: Omit<CashLine, "bal">[] = [];
  const derived: Record<string, Derived> = {};
  const cost = makeCost(master, st, roast);

  const g = (k: StockKind, id: string) => st[k][id] || (st[k][id] = { qty: 0, val: 0, last: 0 });
  const take = (k: StockKind, id: string, q: number) => {
    const s = g(k, id);
    const a = avgOf(s) || cost(k, id);
    s.qty -= q;
    s.val -= a * q;
    if (s.qty <= 1e-9) s.val = s.qty * a;
    if (a) s.last = a;
    return a * q;
  };
  const put = (k: StockKind, id: string, q: number, v: number) => {
    const s = g(k, id);
    s.qty += q;
    s.val += v;
    if (s.qty > 1e-9) s.last = s.val / s.qty;
  };
  const mo = (d: string) => {
    const k = String(d || "").slice(0, 7);
    return M[k] || (M[k] = newMonth());
  };
  const flow = (date: string, dir: "in" | "out", cat: string, amt: number, desc: string, e: LedgerEntry) => {
    if (!amt) return;
    const m = mo(date);
    const c = m.cat[cat] || (m.cat[cat] = { in: 0, out: 0 });
    if (dir === "in") {
      m.cin += amt;
      c.in += amt;
      if (NON_OP.includes(cat)) m.nonIn += amt;
    } else {
      m.cout += amt;
      c.out += amt;
      if (NON_OP.includes(cat)) m.nonOut += amt;
    }
    cash.push({ date, dir, cat, amt, desc, entryId: e.id, at: e.at || "" });
  };

  for (const e of E) {
    const m = mo(e.date);
    switch (e.type) {
      case "opening":
        if (isStockKind(e.target)) put(e.target, e.itemId, +e.qty || 0, +e.value || 0);
        break;
      case "green_in":
      case "pack_in": {
        const t = +e.total || 0;
        if (e.type === "green_in") {
          put("green", e.greenId, +e.kg || 0, t);
          m.buyGreen += t;
        } else {
          put("pack", e.packId, +e.qty || 0, t);
          m.buyPack += t;
        }
        if (e.paid) {
          const desc = e.type === "green_in"
            ? `Beli green ${gName(e.greenId)} ${nf(e.kg)} kg${e.supplier ? " (" + e.supplier + ")" : ""}`
            : `Beli ${pName(e.packId)} ${nf(e.qty, 0)} pcs`;
          flow(e.paidDate || e.date, "out", e.type === "green_in" ? "Bahan Baku (Green Bean)" : "Packaging", t, desc, e);
        } else pay.push(e);
        break;
      }
      case "roast": {
        const i = +e.inKg || 0, o = +e.outKg || 0;
        const v = take("green", e.greenId, i);
        put("roasted", e.greenId, o, v);
        const r = roast[e.greenId] || (roast[e.greenId] = { in: 0, out: 0 });
        r.in += i;
        r.out += o;
        m.roastIn += i;
        m.roastOut += o;
        break;
      }
      case "blend": {
        let v = 0, kg = 0;
        (e.parts || []).forEach((p) => {
          const q = +p.kg || 0;
          v += take("roasted", p.greenId, q);
          kg += q;
        });
        put("blend", e.blendId, kg, v);
        m.blendKg += kg;
        derived[e.id] = { kg };
        break;
      }
      case "usage": {
        const q = +e.kg || 0;
        let v = isStockKind(e.target) ? take(e.target, e.itemId, q) : 0;
        if (e.packId && e.packQty) v += take("pack", e.packId, +e.packQty || 0);
        const u = m.usage[e.category] || (m.usage[e.category] = { kg: 0, val: 0 });
        u.kg += q;
        u.val += v;
        derived[e.id] = { val: v };
        break;
      }
      case "sale": {
        let c = 0;
        const k = e.date.slice(0, 7);
        const sb = soldBy[k] || (soldBy[k] = {});
        (e.items || []).forEach((it) => {
          const q = +it.qty || 0, p = +it.price || 0, kg = ((+it.grams || 0) * q) / 1000;
          c += take(it.kind === "blend" ? "blend" : "roasted", it.beanId, kg);
          if (it.packId) c += take("pack", it.packId, q);
          m.sales += q * p;
          m.kgSold += kg;
          const s = sb[it.productId] || (sb[it.productId] = { qty: 0, rev: 0, name: it.name });
          s.qty += q;
          s.rev += q * p;
        });
        derived[e.id] = { cogs: c };
        m.cogs += c;
        m.disc += +e.discount || 0;
        m.ship += +e.shipping || 0;
        m.orders++;
        if (e.paid) flow(e.paidDate || e.date, "in", "Penjualan Kopi", +e.total || 0, `Penjualan ${e.customer || "pelanggan umum"}`, e);
        else recv.push(e);
        break;
      }
      case "kas":
        flow(e.date, e.dir === "in" ? "in" : "out", e.category || "Pengeluaran Lainnya", +e.amount || 0, e.desc || e.category, e);
        break;
      case "adjust": {
        if (!isStockKind(e.target)) break;
        const d = +e.delta || 0;
        if (d < 0) m.adj -= take(e.target, e.itemId, -d);
        else {
          const a = cost(e.target, e.itemId);
          put(e.target, e.itemId, d, d * a);
          m.adj += d * a;
        }
        break;
      }
    }
  }

  cash.sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at));
  let bal = 0;
  const cashWithBal: CashLine[] = cash.map((c) => {
    bal += c.dir === "in" ? c.amt : -c.amt;
    return { ...c, bal };
  });

  const inv: Record<StockKind, number> = { green: 0, roasted: 0, blend: 0, pack: 0 };
  for (const k of Object.keys(st) as StockKind[]) for (const id in st[k]) inv[k] += Math.max(0, st[k][id].val);

  return {
    st, M, roast, recv, pay, soldBy, cash: cashWithBal, bal, inv,
    invT: inv.green + inv.roasted + inv.blend + inv.pack, derived, cost,
  };
}

// ---------------------------------------------------------------------------
// Turunan dari hasil compute() (dulu helper global di app.js)
// ---------------------------------------------------------------------------

export const monthOf = (C: ComputeResult, m: string) => C.M[m] || newMonth();

export function cashUntil(C: ComputeResult, month: string) {
  let c = 0;
  for (const k in C.M) if (k <= month) c += C.M[k].cin - C.M[k].cout;
  return c;
}

export function yieldOf(C: ComputeResult, greenId: string) {
  const r = C.roast[greenId];
  return r && r.in ? r.out / r.in : 0;
}

export const labaOf = (master: Master, x: MonthSummary) =>
  master.config.basis === "op" ? x.cin - x.nonIn - (x.cout - x.nonOut) : x.cin - x.cout;

export function distrib(master: Master, laba: number) {
  const c = master.config;
  const shares = c.shares.map((s) => ({
    label: s.label,
    pct: +s.pct || 0,
    amt: laba > 0 ? (laba * (+s.pct || 0)) / 100 : 0,
  }));
  const saving = Math.max(+c.savingMin || 0, laba > 0 ? (laba * (+c.savingPct || 0)) / 100 : 0);
  return { shares, saving, sisa: laba - shares.reduce((a, s) => a + s.amt, 0) - saving };
}

export function productCost(C: ComputeResult, p: Product) {
  const kg = (+p.grams || 0) / 1000;
  let c = kg * C.cost(p.kind === "blend" ? "blend" : "roasted", p.beanId);
  if (p.packId) c += C.cost("pack", p.packId);
  return c;
}

export function minOf(t: StockKind, x: { minKg?: number; minRoastedKg?: number; minQty?: number }) {
  return t === "roasted" ? +(x.minRoastedKg ?? 0) || 0 : t === "pack" ? +(x.minQty ?? 0) || 0 : +(x.minKg ?? 0) || 0;
}

export interface Alert {
  t: StockKind;
  id: string;
  name: string;
  q: number;
  min: number;
  bad: boolean;
}

const activeList = <T extends { active: boolean; name: string }>(o: Record<string, T>) =>
  Object.values(o).filter((x) => x.active !== false).sort((a, b) => (a.name || "").localeCompare(b.name || "", "id"));

export function alertsList(master: Master, C: ComputeResult): Alert[] {
  const out: Alert[] = [];
  const sources: [StockKind, Record<string, { id: string; name: string; active: boolean }>][] = [
    ["green", master.greens], ["roasted", master.greens], ["blend", master.blends], ["pack", master.packs],
  ];
  for (const [t, src] of sources) {
    for (const x of activeList(src)) {
      const q = C.st[t][x.id]?.qty ?? 0;
      const min = minOf(t, x as never);
      if (min && q < min) out.push({ t, id: x.id, name: x.name, q, min, bad: q <= 1e-6 });
    }
  }
  return out.sort((a, b) => Number(a.bad) - Number(b.bad) || a.q / a.min - b.q / b.min);
}
