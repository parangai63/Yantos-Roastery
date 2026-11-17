import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchMe, logout as logoutApi } from "../api/auth";
import {
  clearSession, isIdleExpired, readStoredSession, SESSION_STORAGE_KEY, UNAUTHORIZED_EVENT, writeLastActive, writeSession,
} from "../api/authInterceptor";
import { AuthSession, UnlockedUser } from "../types/auth";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;
const ACTIVITY_WRITE_MS = 5_000; // waktu aktivitas ditulis ke localStorage paling sering tiap 5 detik
const PING_MS = 60_000; // selama aktif, beri tahu server paling sering tiap 1 menit
const CHECK_MS = 15_000; // seberapa sering memeriksa batas diam

interface AuthContextValue {
  user: UnlockedUser | null;
  unlock: (session: AuthSession) => void;
  lock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Sesi tersimpan yang masih berlaku saat halaman dibuka; yang sudah lewat batas diam dibuang. */
function initialUser(): UnlockedUser | null {
  const s = readStoredSession();
  if (!s) return null;
  if (isIdleExpired()) {
    clearSession();
    logoutApi(s.token).catch(() => undefined);
    return null;
  }
  return s.user;
}

/**
 * Sesi login:
 * - Disimpan di localStorage: tutup browser lalu buka lagi tetap masuk, ASALKAN belum 10 menit
 *   sejak aktivitas terakhir. Lebih dari itu → layar PIN.
 * - 10 menit tanpa mouse/keyboard/sentuhan/scroll → terkunci otomatis. Hitungan diam dipakai
 *   bersama semua tab; mengunci di satu tab mengunci semua tab.
 * - Selama aktif, browser mengabari server tiap ±1 menit (GET /api/auth/me) supaya server tidak
 *   menganggap sesi diam saat pengguna lama mengisi form tanpa menyimpan. Server sendiri menolak
 *   token yang diam lebih dari 12 menit.
 * - Mengunci juga menghapus sesi di server, jadi token lama tidak bisa dipakai lagi.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UnlockedUser | null>(initialUser);
  const lastWrite = useRef(0);
  const lastPing = useRef(Date.now());

  const lock = useCallback(() => {
    const session = readStoredSession();
    clearSession();
    setUser(null);
    if (session?.token) logoutApi(session.token).catch(() => undefined);
  }, []);

  const unlock = useCallback((session: AuthSession) => {
    writeSession(session);
    lastPing.current = Date.now();
    setUser(session.user);
  }, []);

  // Server menolak token (kedaluwarsa, akun nonaktif, PIN direset admin).
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, lock);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, lock);
  }, [lock]);

  // Tab lain masuk atau mengunci → ikuti.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== SESSION_STORAGE_KEY && e.key !== null) return;
      const s = readStoredSession();
      setUser((cur) => (s ? (cur?.id === s.user.id ? cur : s.user) : null));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Catat aktivitas & kunci otomatis saat diam — hanya selama terbuka.
  useEffect(() => {
    if (!user) return;

    function onActivity() {
      const now = Date.now();
      if (now - lastWrite.current > ACTIVITY_WRITE_MS) {
        lastWrite.current = now;
        writeLastActive(now);
      }
      if (now - lastPing.current > PING_MS) {
        lastPing.current = now;
        fetchMe().catch(() => undefined); // 401 ditangani interceptor → lock
      }
    }

    function check() {
      if (!readStoredSession()) setUser(null); // dikunci dari tab lain
      else if (isIdleExpired()) lock();
    }

    writeLastActive();
    lastWrite.current = Date.now();
    const timer = window.setInterval(check, CHECK_MS);
    // Laptop bangun dari sleep / tab kembali dibuka: periksa saat itu juga, jangan tunggu timer.
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, [user, lock]);

  return <AuthContext.Provider value={{ user, unlock, lock }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus di dalam <AuthProvider>");
  return ctx;
}
