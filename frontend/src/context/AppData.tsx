// Data yang dipakai hampir semua halaman: master, kosakata, config, stok &
// biaya saat ini, nama pelanggan, harga beli terakhir per supplier, periode terpilih.
// `version` dinaikkan setelah setiap simpan supaya halaman memuat ulang laporan.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchBootstrap } from "../api/master";
import type { Buys, Config, Costs, MasterData, Meta, Names, Product, StockKind } from "../types";
import { thisMonth } from "../utils/format";

interface AppData {
  master: MasterData | null;
  meta: Meta | null;
  config: Config | null;
  costs: Costs | null;
  names: Names;
  buys: Buys;
  error: string | null;
  month: string;
  setMonth: (m: string) => void;
  version: number;
  changed: () => void;
  /** Hasil useLoad terakhir per kunci, supaya pindah tab langsung menampilkan data lama sambil memuat ulang. */
  responseCache: Map<string, unknown>;
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
  const [names, setNames] = useState<Names>({ customers: [] });
  const [buys, setBuys] = useState<Buys>({ prices: {}, lastSupplier: {} });
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [version, setVersion] = useState(0);
  // Dibuang bersama provider saat terkunci / ganti akun (App.tsx memberi key = user.id).
  const responseCache = useRef(new Map<string, unknown>()).current;

  useEffect(() => {
    let alive = true;
    // Satu request (GET /api/bootstrap) menggantikan lima request terpisah.
    fetchBootstrap()
      .then((b) => {
        if (!alive) return;
        setMaster(b.master); setMeta(b.meta); setConfig(b.config); setCosts(b.costs); setNames(b.names); setBuys(b.buys); setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
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
    <Ctx.Provider value={{ master, meta, config, costs, names, buys, error, month, setMonth, version, changed, responseCache, ...helpers }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData harus di dalam AppDataProvider");
  return v;
}
