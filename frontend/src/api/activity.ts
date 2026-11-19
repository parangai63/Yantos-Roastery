import { API_URL, handleResponse } from "./config";
import type { ActivityPage, ActivityUser } from "../types/activity";

const BASE_URL = `${API_URL}/api/activity`;

/** Riwayat aktivitas, terbaru dulu. `before` = waktu catatan terakhir yang sudah tampil (muat lebih banyak). */
export async function fetchActivity(q: { userId?: string; entity?: string; before?: string; limit?: number }): Promise<ActivityPage> {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => v !== undefined && v !== "" && params.set(k, String(v)));
  const res = await fetch(`${BASE_URL}?${params}`);
  return handleResponse(res);
}

export async function fetchActivityUsers(): Promise<ActivityUser[]> {
  const res = await fetch(`${BASE_URL}/users`);
  return handleResponse(res);
}
