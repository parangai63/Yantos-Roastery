import { API_URL, handleResponse, jsonInit } from "./config";
import type { DataSummary } from "../types/activity";

const BASE_URL = `${API_URL}/api/admin`;

// Khusus admin.
export async function fetchDataSummary(): Promise<DataSummary> {
  const res = await fetch(`${BASE_URL}/summary`);
  return handleResponse(res);
}

export async function fetchBackup(): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/backup`);
  return handleResponse(res);
}

export async function resetAllData(pin: string, confirm: string): Promise<{ deleted: DataSummary }> {
  const res = await fetch(`${BASE_URL}/reset`, jsonInit("POST", { pin, confirm }));
  return handleResponse(res);
}
