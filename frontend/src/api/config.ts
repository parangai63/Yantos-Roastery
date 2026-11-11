// Kosong (disarankan): /api di domain yang sama — dev diproxy Vite (VITE_API_PROXY_TARGET),
// prod di-rewrite vercel.json. Diisi: browser memanggil backend langsung (butuh CORS_ORIGIN
// di backend). "/" di akhir dan "/api" yang tak sengaja ikut ditulis dibuang. Lihat .env.example.
export const API_URL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "").replace(/\/api$/, "");

/** Dipakai semua file api/*.ts: lempar Error berisi pesan server ({ message }), seperti parang-ops. */
export async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Gagal (${res.status}). Coba lagi.`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** RequestInit untuk kirim JSON. */
export function jsonInit(method: string, body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
