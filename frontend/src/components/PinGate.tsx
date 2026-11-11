import { useEffect, useRef, useState } from "react";
import { checkAuthStatus, verifyPin } from "../api/auth";
import { AuthSession } from "../types/auth";
import { Logo } from "./Layout";

const PIN_LENGTH = 4;

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

/**
 * Gerbang PIN untuk seluruh aplikasi (lihat App.tsx) — perilaku sama dengan PinGate parang-ops:
 * ketik 4 angka tanpa memilih nama, angka keempat langsung mengirim, server mencari akun
 * pemilik PIN itu. Tampilan mengikuti gaya kaca/coklat yantos-roastery.
 */
export default function PinGate({ onUnlock }: { onUnlock: (session: AuthSession) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [noUsers, setNoUsers] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Kursor ke kotak kosong pertama — saat muncul dan setelah percobaan gagal
  // (menunggu `submitting` selesai karena kotak nonaktif selama request berjalan).
  useEffect(() => {
    if (submitting) return;
    const next = digits.indexOf("");
    if (next >= 0) inputRefs.current[next]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  useEffect(() => {
    checkAuthStatus()
      .then((s) => setNoUsers(!s.hasAnyUser))
      .catch(() => setError("Server tidak terhubung. Pastikan backend berjalan."));
  }, []);

  async function submit(pin: string) {
    setSubmitting(true);
    setError(null);
    try {
      onUnlock(await verifyPin(pin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN salah.");
      setShake(true);
      setDigits(Array(PIN_LENGTH).fill(""));
      setTimeout(() => setShake(false), 400);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDigitChange(index: number, rawValue: string) {
    const value = rawValue.replace(/\D/g, "").slice(-1);
    setError(null);
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < PIN_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) submit(next.join(""));
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(PIN_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    if (pasted.length === PIN_LENGTH) submit(pasted);
    else inputRefs.current[pasted.length]?.focus();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="panel w-full max-w-[420px] text-center">
        <div className="brand mb-6 flex items-center justify-center gap-3">
          <Logo />
          <div className="text-left">
            <h1>Yantos Roastery</h1>
            <p>Gudang, produksi &amp; keuangan</p>
          </div>
        </div>

        <h2 className="text-xl">{greeting()}!</h2>
        <p className="mt-1 text-muted">Masukkan PIN 4 angka untuk membuka aplikasi.</p>

        <div className={`mt-5 flex justify-center gap-3 ${shake ? "pin-shake" : ""}`}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              value={d}
              disabled={submitting}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              aria-label={`Angka PIN ke-${i + 1}`}
              aria-invalid={!!error}
              className={`pin-box ${error ? "pin-box-error" : ""}`}
            />
          ))}
        </div>

        {/* Tinggi tetap supaya teks status tidak menggeser kotak PIN. */}
        <div className="mt-4 min-h-[44px] text-sm">
          {error && <p role="alert" className="font-medium text-bad">{error}</p>}
          {submitting && !error && <p className="text-muted">Memeriksa…</p>}
          {!error && !submitting && noUsers && (
            <p className="text-muted">
              Belum ada akun. Buat admin pertama di terminal backend:{" "}
              <code className="font-mono">npm run user -- create "Nama" 1234 admin</code>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
