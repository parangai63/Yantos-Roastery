// Bentuk data yang dipakai engine. Sengaja sama dengan dokumen di versi
// artifact (src/app.js lama) supaya compute() bisa diport baris per baris.

export type StockKind = "green" | "roasted" | "blend" | "pack";

export interface GreenBean {
  id: string;
  name: string;
  category: string;
  price: number;
  minKg: number;
  minRoastedKg: number;
  supplier: string;
  active: boolean;
}

export interface RecipeItem {
  greenId: string;
  pct: number;
}

export interface Blend {
  id: string;
  name: string;
  cogs: number;
  minKg: number;
  recipe: RecipeItem[];
  active: boolean;
}

export interface Pack {
  id: string;
  name: string;
  unit: string;
  price: number;
  minQty: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  kind: "roasted" | "blend";
  beanId: string;
  grams: number;
  price: number;
  group: string;
  packId: string;
  active: boolean;
}

export interface Share {
  label: string;
  pct: number;
}

export interface Routine {
  label: string;
  amount: number;
}

export interface Config {
  bizName: string;
  basis: "kas" | "op";
  savingPct: number;
  savingMin: number;
  shares: Share[];
  routine: Routine[];
}

export interface Master {
  greens: Record<string, GreenBean>;
  blends: Record<string, Blend>;
  packs: Record<string, Pack>;
  products: Record<string, Product>;
  config: Config;
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

interface Base {
  id: string;
  date: string; // YYYY-MM-DD
  at: string; // ISO timestamp
  by: string;
  note?: string;
}

interface Payable {
  total: number;
  supplier?: string;
  paid: boolean;
  paidDate?: string;
}

export interface OpeningEntry extends Base {
  type: "opening";
  target: StockKind;
  itemId: string;
  qty: number;
  value: number;
}
export interface GreenInEntry extends Base, Payable {
  type: "green_in";
  greenId: string;
  kg: number;
}
export interface PackInEntry extends Base, Payable {
  type: "pack_in";
  packId: string;
  qty: number;
}
export interface RoastEntry extends Base {
  type: "roast";
  greenId: string;
  inKg: number;
  outKg: number;
  batch?: string;
}
export interface BlendPart {
  greenId: string;
  kg: number;
}
export interface BlendEntry extends Base {
  type: "blend";
  blendId: string;
  parts: BlendPart[];
}
export interface UsageEntry extends Base {
  type: "usage";
  target: StockKind;
  itemId: string;
  kg: number;
  category: string;
  packId?: string;
  packQty?: number;
}
export interface AdjustEntry extends Base {
  type: "adjust";
  target: StockKind;
  itemId: string;
  delta: number;
}
export interface SaleItem {
  productId: string;
  name: string;
  kind: "roasted" | "blend";
  beanId: string;
  grams: number;
  packId: string;
  qty: number;
  price: number;
}
export interface SaleEntry extends Base {
  type: "sale";
  customer?: string;
  channel?: string;
  method?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paid: boolean;
  paidDate?: string;
  due?: string;
}
export interface KasEntry extends Base {
  type: "kas";
  dir: "in" | "out";
  category: string;
  desc: string;
  amount: number;
}

export type LedgerEntry =
  | OpeningEntry
  | GreenInEntry
  | PackInEntry
  | RoastEntry
  | BlendEntry
  | UsageEntry
  | AdjustEntry
  | SaleEntry
  | KasEntry;

export type LedgerType = LedgerEntry["type"];
export const LEDGER_TYPES: LedgerType[] = [
  "opening", "green_in", "pack_in", "roast", "blend", "usage", "adjust", "sale", "kas",
];
