// Komponen kecil yang dipakai bersama banyak halaman.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppData } from "../context/AppData";
import type { StockKind } from "../types";
import { moneyStr, nf, parseMoney } from "../utils/format";
import { activeList, T_SRC } from "../utils/ledger";

export function Panel({ title, hint, children, className = "" }: { title?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || hint) && (
        <header className="panel-title">
          {title && <h2>{title}</h2>}
          {hint && (typeof hint === "string" ? <span className="hint">{hint}</span> : hint)}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = "ok" | "warn" | "bad" | "bean" | "roast";
export function Pill({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill ${tone ? "pill-" + tone : ""}`}>{children}</span>;
}

export function StockStatus({ qty, min }: { qty: number; min: number }) {
  if (qty <= 1e-6) return <Pill tone="bad">Habis</Pill>;
  if (min && qty < min) return <Pill tone="warn">Menipis</Pill>;
  return <Pill tone="ok">Aman</Pill>;
}

export function Loading({ error }: { error?: string | null }) {
  return error ? <p className="empty text-bad">{error}</p> : <p className="hint py-3.5">Memuat data…</p>;
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div role="group" className="seg">
      {items.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={k === value} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export function Line({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: "tot" | "sec" | "in" | "big" }) {
  return (
    <div className={`ln ${tone || ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function Kpi({ label, value, sub, cls = "" }: { label: string; value: string; sub: string; cls?: string }) {
  return (
    <div className="kpi">
      <span className="k">{label}</span>
      <span className={`v ${cls}`}>{value}</span>
      <span className="s">{sub}</span>
    </div>
  );
}

// Dropdown item master aktif. Dengan `show`, label ikut menampilkan stok saat ini
// ("Gayo · stok 12,5 kg"), seperti refreshSelects() di app lama.
export function ItemSelect({ kind, show, value, onChange, placeholder = "Pilih…", required, name, ariaLabel }: {
  kind: StockKind; show?: StockKind; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; name?: string; ariaLabel?: string;
}) {
  const { master, qty } = useAppData();
  const items: { id: string; name: string; active: boolean; unit?: string }[] = master ? activeList<{ id: string; name: string; active: boolean }>(master[T_SRC[kind]]) : [];
  const unitOf = (x: { unit?: string }) => (show === "pack" ? x.unit || "pcs" : "kg");

  return (
    <select className="input" name={name} value={value} onChange={(e) => onChange(e.target.value)} required={required} aria-label={ariaLabel}>
      <option value="">{placeholder}</option>
      {items.map((x) => (
        <option key={x.id} value={x.id}>
          {show ? `${x.name} · stok ${nf(qty(show, x.id), show === "pack" ? 0 : 2)} ${unitOf(x)}` : x.name}
        </option>
      ))}
    </select>
  );
}

// Input rupiah dengan pemisah ribuan saat diketik.
export function MoneyInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input className="input" inputMode="numeric" value={moneyStr(value)} onChange={(e) => onChange(parseMoney(e.target.value))} {...rest} />;
}

// Tombol hapus dua langkah: klik pertama berubah jadi "Yakin hapus?" selama 3,5 detik.
export function DeleteButton({ onConfirm }: { onConfirm: () => Promise<unknown> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = useRef<number>();
  useEffect(() => () => window.clearTimeout(t.current), []);
  return (
    <button
      type="button"
      disabled={busy}
      className={`btn btn-sm ${armed ? "btn-confirm" : "btn-ghost btn-danger"}`}
      onClick={async () => {
        if (!armed) {
          setArmed(true);
          t.current = window.setTimeout(() => setArmed(false), 3500);
          return;
        }
        setBusy(true);
        try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
      }}
    >
      {armed ? "Yakin hapus?" : "Hapus"}
    </button>
  );
}
