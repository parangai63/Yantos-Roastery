import { api } from "./client";
import type {
  Bills, Cashbook, Config, Costs, HppReport, LedgerEntry, MasterData, Meta, MonthlyReport, Names, ProductionReport, StockKind, StockReport, Summary, YearlyReport,
} from "../types";

export const masterApi = {
  meta: () => api<Meta>("/meta"),
  list: () => api<MasterData>("/master"),
  save: (kind: keyof MasterData, id: string | null, body: unknown) =>
    api(id ? `/master/${kind}/${id}` : `/master/${kind}`, { method: id ? "PUT" : "POST", body }),
  setActive: (kind: keyof MasterData, id: string, active: boolean) =>
    api(`/master/${kind}/${id}/active`, { method: "PATCH", body: { active } }),
  config: () => api<Config>("/config"),
  saveConfig: (body: Config) => api<Config>("/config", { method: "PUT", body }),
};

export const ledgerApi = {
  list: (q: { month?: string; types?: string[]; limit?: number; order?: "recent" } = {}) => {
    const p = new URLSearchParams();
    if (q.month) p.set("month", q.month);
    if (q.types) p.set("types", q.types.join(","));
    if (q.limit) p.set("limit", String(q.limit));
    if (q.order) p.set("order", q.order);
    return api<LedgerEntry[]>(`/ledger?${p}`);
  },
  names: () => api<Names>("/ledger/names"),
  create: (body: Record<string, unknown>) => api<LedgerEntry>("/ledger", { method: "POST", body }),
  markPaid: (id: string, paidDate?: string) => api<LedgerEntry>(`/ledger/${id}/paid`, { method: "PATCH", body: { paidDate } }),
  remove: (id: string) => api<void>(`/ledger/${id}`, { method: "DELETE" }),
};

export const reportApi = {
  summary: (month: string) => api<Summary>(`/reports/summary?month=${month}`),
  stock: (kind: StockKind) => api<StockReport>(`/reports/stock/${kind}`),
  monthly: (month: string) => api<MonthlyReport>(`/reports/monthly?month=${month}`),
  yearly: (year: string) => api<YearlyReport>(`/reports/yearly?year=${year}`),
  hpp: (month: string) => api<HppReport>(`/reports/hpp?month=${month}`),
  production: (month: string) => api<ProductionReport>(`/reports/production?month=${month}`),
  bills: () => api<Bills>("/reports/bills"),
  cashbook: (month: string) => api<Cashbook>(`/reports/cashbook?month=${month}`),
  costs: () => api<Costs>("/reports/costs"),
};
