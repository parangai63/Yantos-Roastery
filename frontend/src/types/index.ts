// Disamakan dengan backend/src/engine/types.ts dan bentuk response reportService.

export type StockKind = "green" | "roasted" | "blend" | "pack";

export interface GreenBean { id: string; name: string; category: string; price: number; minKg: number; minRoastedKg: number; supplier: string; active: boolean }
export interface Blend { id: string; name: string; cogs: number; minKg: number; recipe: { greenId: string; pct: number }[]; active: boolean }
export interface Pack { id: string; name: string; unit: string; price: number; minQty: number; active: boolean }
export interface Product { id: string; name: string; kind: "roasted" | "blend"; beanId: string; grams: number; price: number; group: string; packId: string; active: boolean }

export interface MasterData { greens: GreenBean[]; blends: Blend[]; packs: Pack[]; products: Product[] }
export interface Meta { catsIn: string[]; catsOut: string[]; useCats: string[]; groups: string[]; channels: string[]; methods: string[] }

export interface Share { label: string; pct: number; amt?: number }
export interface Config { bizName: string; basis: "kas" | "op"; savingPct: number; savingMin: number; shares: Share[]; routine: { label: string; amount: number }[] }

// Entri ledger: kolom umum + field per jenis (lihat backend engine/types.ts).
export interface LedgerEntry {
  id: string;
  type: "opening" | "green_in" | "pack_in" | "roast" | "blend" | "usage" | "adjust" | "sale" | "kas";
  date: string;
  at: string;
  by: string;
  note?: string;
  [field: string]: unknown;
}

export interface Alert { t: StockKind; id: string; name: string; q: number; min: number; bad: boolean }

export interface Summary {
  month: string;
  kpi: { cin: number; cout: number; laba: number; basis: string; bal: number; recvTotal: number; recvCount: number; invT: number; inv: Record<StockKind, number> };
  chart: { month: string; cin: number; cout: number }[];
  alerts: Alert[];
  overdue: { count: number; total: number };
}

export interface StockRow { id: string; name: string; active: boolean; qty: number; val: number; avg: number; min: number; status: "habis" | "menipis" | "aman"; yield?: number; roastIn?: number }
export interface StockReport { kind: StockKind; rows: StockRow[]; total: number }

export interface MonthlyReport {
  month: string; basis: string; config: Config; start: number; end: number; cin: number; cout: number;
  ins: { cat: string; amt: number }[]; outs: { cat: string; amt: number }[];
  laba: number; distrib: { shares: Share[]; saving: number; sisa: number }; realized: number;
}

export interface YearlyReport {
  year: string; shareLabels: string[];
  rows: { month: string; cin: number; cout: number; laba: number; shares: Share[]; saving: number; sisa: number; awal: number; akhir: number }[];
}

export interface HppReport {
  month: string; sales: number; disc: number; cogs: number; gross: number;
  usage: { cat: string; kg: number; val: number }[];
  products: { id: string; name: string; group: string; grams: number; packId: string; cost: number; price: number; margin: number; soldQty: number; rev: number }[];
}

export interface ProductionReport {
  month: string; roastIn: number; roastOut: number; blendKg: number; kgSold: number;
  usage: { cat: string; kg: number; val: number }[];
}

export interface Bills { recv: LedgerEntry[]; pay: LedgerEntry[] }
export interface CashLine { date: string; dir: "in" | "out"; cat: string; amt: number; desc: string; entryId: string; at: string; bal: number }
export interface Cashbook { month: string; start: number; cin: number; cout: number; end: number; lines: CashLine[] }
// Stok & biaya rata-rata saat ini per item (GET /reports/costs), untuk hitungan langsung di form.
export type Costs = Record<StockKind, Record<string, { qty: number; cost: number }>>;
export interface Names { customers: string[]; suppliers: string[] }
