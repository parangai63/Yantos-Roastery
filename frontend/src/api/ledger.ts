import { API_URL, handleResponse, jsonInit } from "./config";
import type { LedgerEntry, Names } from "../types";

const BASE_URL = `${API_URL}/api/ledger`;

export interface LedgerQuery {
  month?: string;
  types?: string[];
  limit?: number;
  order?: "recent";
}

export async function fetchLedgerEntries(q: LedgerQuery = {}): Promise<LedgerEntry[]> {
  const p = new URLSearchParams();
  if (q.month) p.set("month", q.month);
  if (q.types) p.set("types", q.types.join(","));
  if (q.limit) p.set("limit", String(q.limit));
  if (q.order) p.set("order", q.order);
  const res = await fetch(`${BASE_URL}?${p}`);
  return handleResponse(res);
}

/** Nama pelanggan & supplier yang pernah dipakai (untuk saran isian). */
export async function fetchLedgerNames(): Promise<Names> {
  const res = await fetch(`${BASE_URL}/names`);
  return handleResponse(res);
}

/** Pencatat (`by`) diisi server dari akun yang login. */
export async function createLedgerEntry(body: Record<string, unknown>): Promise<LedgerEntry> {
  const res = await fetch(BASE_URL, jsonInit("POST", body));
  return handleResponse(res);
}

export async function markLedgerEntryPaid(id: string, paidDate?: string): Promise<LedgerEntry> {
  const res = await fetch(`${BASE_URL}/${id}/paid`, jsonInit("PATCH", { paidDate }));
  return handleResponse(res);
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, { method: "DELETE" });
  return handleResponse(res);
}
