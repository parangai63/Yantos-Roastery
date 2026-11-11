import { API_URL, handleResponse } from "./config";
import type {
  Bills, Cashbook, Costs, HppReport, MonthlyReport, ProductionReport, StockKind, StockReport, Summary, YearlyReport,
} from "../types";

const BASE_URL = `${API_URL}/api/reports`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  return handleResponse(res);
}

export const fetchSummary = (month: string) => get<Summary>(`/summary?month=${month}`);
export const fetchStockReport = (kind: StockKind) => get<StockReport>(`/stock/${kind}`);
export const fetchMonthlyReport = (month: string) => get<MonthlyReport>(`/monthly?month=${month}`);
export const fetchYearlyReport = (year: string) => get<YearlyReport>(`/yearly?year=${year}`);
export const fetchHppReport = (month: string) => get<HppReport>(`/hpp?month=${month}`);
export const fetchProductionReport = (month: string) => get<ProductionReport>(`/production?month=${month}`);
export const fetchBills = () => get<Bills>("/bills");
export const fetchCashbook = (month: string) => get<Cashbook>(`/cashbook?month=${month}`);
/** Stok & biaya rata-rata saat ini per item, untuk hitungan langsung di form. */
export const fetchCosts = () => get<Costs>("/costs");
