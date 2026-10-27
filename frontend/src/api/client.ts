const API_URL = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Sementara nama pencatat disimpan di browser dan dikirim sebagai X-Actor.
// Bukan autentikasi; lihat backend/src/middleware/actor.ts.
export const getActor = () => {
  try { return localStorage.getItem("yr.actor") || ""; } catch { return ""; }
};
export const setActor = (name: string) => {
  try { localStorage.setItem("yr.actor", name); } catch { /* abaikan */ }
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(API_URL + "/api" + path, {
    method: init.method || "GET",
    headers: { "Content-Type": "application/json", "X-Actor": encodeURIComponent(getActor()) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Gagal (${res.status}). Coba lagi.`);
  return data as T;
}
