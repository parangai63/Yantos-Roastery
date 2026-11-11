import { AuthSession } from "../types/auth";

export const SESSION_STORAGE_KEY = "yantos-unlocked-user";
/** Dikirim saat server menolak token (sesi kedaluwarsa / akun dinonaktifkan) → AuthContext mengunci layar. */
export const UNAUTHORIZED_EVENT = "yantos:unauthorized";

export function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Seperti actorInterceptor.ts di parang-ops: membungkus `fetch` global SEKALI (dari main.tsx)
 * supaya tiap file api/*.ts tidak perlu mengurus login. Bedanya, yang ditempel bukan nama staf
 * (X-Actor-Name, bisa dipalsukan) melainkan token sesi dari POST /api/auth/verify-pin:
 *   Authorization: Bearer <token>
 * Server memeriksa token itu di SETIAP request /api (GET juga), lalu mengambil nama pencatat
 * dari akun pemilik token.
 */
export function installAuthInterceptor() {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const session = url.includes("/api/") ? readSession() : null;
    const headers = new Headers(init.headers);
    const attach = !!session?.token && !headers.has("Authorization");
    if (attach) headers.set("Authorization", `Bearer ${session!.token}`);

    const res = await nativeFetch(input, attach ? { ...init, headers } : init);
    if (attach && res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    return res;
  }) as typeof window.fetch;
}
