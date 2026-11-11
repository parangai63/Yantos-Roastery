import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { logout as logoutApi } from "../api/auth";
import { readSession, SESSION_STORAGE_KEY, UNAUTHORIZED_EVENT } from "../api/authInterceptor";
import { AuthSession, UnlockedUser } from "../types/auth";

// Sama dengan parang-ops: 5 menit tanpa mouse/keyboard/sentuhan → layar terkunci lagi.
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

interface AuthContextValue {
  user: UnlockedUser | null;
  unlock: (session: AuthSession) => void;
  lock: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Sesi per tab browser (sessionStorage, bukan localStorage — gerbang PIN tidak boleh
 * tetap terbuka selamanya hanya karena browser tidak pernah ditutup), plus kunci otomatis
 * saat diam. Mengunci juga menghapus sesi di server, jadi token lama tidak bisa dipakai lagi.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UnlockedUser | null>(() => readSession()?.user ?? null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    const session = readSession();
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Penyimpanan diblokir — mengunci tetap jalan lewat state di bawah.
    }
    setUser(null);
    if (session?.token) logoutApi(session.token).catch(() => undefined);
  }, []);

  const unlock = useCallback((session: AuthSession) => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Tanpa sessionStorage token tidak ikut terkirim; server akan menolak dan layar terkunci lagi.
    }
    setUser(session.user);
  }, []);

  // Server menolak token (kedaluwarsa, akun nonaktif, PIN direset admin).
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, lock);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, lock);
  }, [lock]);

  // Kunci otomatis saat diam — hanya didengarkan selama terbuka.
  useEffect(() => {
    if (!user) return;

    function resetTimer() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(lock, IDLE_TIMEOUT_MS);
    }

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [user, lock]);

  return <AuthContext.Provider value={{ user, unlock, lock }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus di dalam <AuthProvider>");
  return ctx;
}
