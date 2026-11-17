import { AuthSession } from "../types/auth";

// Sesi disimpan di localStorage supaya tetap terbuka setelah browser ditutup lalu dibuka lagi,
// SELAMA belum lewat IDLE_TIMEOUT_MS sejak aktivitas terakhir. Waktu aktivitas terakhir juga di
// localStorage, jadi semua tab berbagi satu hitungan diam (aktif di tab A = tab B ikut aman).
export const SESSION_STORAGE_KEY = "yantos-unlocked-user";
export const LAST_ACTIVE_KEY = "yantos-last-active";
/** Browser mengunci setelah 10 menit tanpa aktivitas. Server memberi kelonggaran 12 menit. */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
/** Dikirim saat server menolak token (sesi kedaluwarsa / akun dinonaktifkan) → AuthContext mengunci layar. */
export const UNAUTHORIZED_EVENT = "yantos:unauthorized";

// sessionStorage lama (versi sebelumnya) dibersihkan sekali supaya tidak tertinggal.
try {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
} catch {
  // Penyimpanan diblokir — abaikan.
}

export function readLastActive(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeLastActive(t = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(t));
  } catch {
    // Tanpa penyimpanan, kunci otomatis tetap jalan lewat timer di tab ini.
  }
}

/** Sesi tersimpan apa adanya (bisa sudah lewat batas diam). */
export function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const isIdleExpired = (now = Date.now()) => now - readLastActive() > IDLE_TIMEOUT_MS;

/** Sesi yang masih boleh dipakai: ada dan belum lewat batas diam. */
export function readSession(): AuthSession | null {
  const s = readStoredSession();
  return s && !isIdleExpired() ? s : null;
}

export function writeSession(session: AuthSession) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Tanpa localStorage token tidak ikut terkirim; server akan menolak dan layar terkunci lagi.
  }
  writeLastActive();
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    // abaikan
  }
}

/**
 * Seperti actorInterceptor.ts di parang-ops: membungkus `fetch` global SEKALI (dari main.tsx)
 * supaya tiap file api/*.ts tidak perlu mengurus login. Yang ditempel adalah token sesi dari
 * POST /api/auth/verify-pin:
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
