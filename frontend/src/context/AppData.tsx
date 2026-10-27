// Data yang dipakai hampir semua halaman: master, kosakata, config, stok &
// biaya saat ini, nama pelanggan/supplier, periode terpilih.
// `version` dinaikkan setelah setiap simpan supaya halaman memuat ulang laporan.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ledgerApi, masterApi, reportApi } from "../api";
import type { Config, Costs, MasterData, Meta, Names, Product, StockKind } from "../types";
import { thisMonth } from "../utils/format";

interface AppData {
  master: MasterData | null;
  meta: Meta | null;
  config: Config | null;
  costs: Costs | null;
  names: Names;
  error: string | null;
  month: string;
  setMonth: (m: string) => void;
  version: number;
  changed: () => void;
  // Stok & biaya rata-rata per item, sama seperti stk()/costOf() di app lama.
  qty: (t: StockKind, id: string) => number;
  cost: (t: StockKind, id: string) => number;
  productCost: (p: Pick<Product, "kind" | "beanId" | "grams" | "packId">) => number;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [master, setMaster] = useState<MasterData | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [costs, setCosts] = useState<Costs | null>(null);
  const [names, setNames] = useState<Names>({ customers: [], suppliers: [] });
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    Promise.all([masterApi.list(), masterApi.meta(), masterApi.config(), reportApi.costs(), ledgerApi.names()])
      .then(([m, v, c, k, n]) => { setMaster(m); setMeta(v); setConfig(c); setCosts(k); setNames(n); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [version]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);

  const helpers = useMemo(() => {
    const qty = (t: StockKind, id: string) => costs?.[t]?.[id]?.qty ?? 0;
    const cost = (t: StockKind, id: string) => costs?.[t]?.[id]?.cost ?? 0;
    const productCost = (p: Pick<Product, "kind" | "beanId" | "grams" | "packId">) =>
      ((+p.grams || 0) / 1000) * cost(p.kind === "blend" ? "blend" : "roasted", p.beanId) + (p.packId ? cost("pack", p.packId) : 0);
    return { qty, cost, productCost };
  }, [costs]);

  return (
    <Ctx.Provider value={{ master, meta, config, costs, names, error, month, setMonth, version, changed, ...helpers }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData harus di dalam AppDataProvider");
  return v;
}
