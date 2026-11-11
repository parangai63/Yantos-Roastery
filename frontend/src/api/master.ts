import { API_URL, handleResponse, jsonInit } from "./config";
import type { Config, MasterData, Meta } from "../types";

const BASE_URL = `${API_URL}/api/master`;
const CONFIG_URL = `${API_URL}/api/config`;

export type MasterKind = keyof MasterData;

export async function fetchMaster(): Promise<MasterData> {
  const res = await fetch(BASE_URL);
  return handleResponse(res);
}

/** Kosakata kategori (kas masuk/keluar, grup, channel, metode bayar). */
export async function fetchMeta(): Promise<Meta> {
  const res = await fetch(`${BASE_URL}/meta`);
  return handleResponse(res);
}

/** id null = buat baru. */
export async function saveMasterItem(kind: MasterKind, id: string | null, body: unknown): Promise<unknown> {
  const res = await fetch(id ? `${BASE_URL}/${kind}/${id}` : `${BASE_URL}/${kind}`, jsonInit(id ? "PUT" : "POST", body));
  return handleResponse(res);
}

export async function setMasterItemActive(kind: MasterKind, id: string, active: boolean): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/${kind}/${id}/active`, jsonInit("PATCH", { active }));
  return handleResponse(res);
}

export async function deleteMasterItem(kind: MasterKind, id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${kind}/${id}`, { method: "DELETE" });
  return handleResponse(res);
}

export async function fetchConfig(): Promise<Config> {
  const res = await fetch(CONFIG_URL);
  return handleResponse(res);
}

export async function saveConfig(body: Config): Promise<Config> {
  const res = await fetch(CONFIG_URL, jsonInit("PUT", body));
  return handleResponse(res);
}
