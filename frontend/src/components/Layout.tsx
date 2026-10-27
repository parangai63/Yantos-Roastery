import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAppData } from "../context/AppData";

export const TABS: [string, string, boolean][] = [
  // [path, label, pakai pemilih periode] — sama dengan TABS & VIEWS.*.period di app lama
  ["/", "Ringkasan", true],
  ["/stok", "Stok", false],
  ["/produksi", "Produksi", true],
  ["/penjualan", "Penjualan", true],
  ["/keuangan", "Kas & Pembelian", true],
  ["/laporan", "Laporan", true],
  ["/master", "Data Master", false],
];

function Logo() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true" className="flex-none">
      <rect width="38" height="38" rx="10" fill="var(--roast-soft)" />
      <ellipse cx="19" cy="19" rx="9.5" ry="12.5" transform="rotate(28 19 19)" fill="var(--roast)" />
      <path d="M14.2 9.6c5.5 4.2 4.1 14.4 9.6 18.8" stroke="var(--roast-soft)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout() {
  const { month, setMonth, error, master, config } = useAppData();
  const { pathname } = useLocation();
  const tab = TABS.find(([p]) => p === pathname) || TABS[0];
  const status = error ? ["off", "Server tidak terhubung"] : master ? ["on", "Tersambung ke server"] : ["", "Menghubungkan…"];

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-[72px] pt-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="brand flex min-w-0 items-center gap-3">
          <Logo />
          <div>
            <h1>{config?.bizName || "Yantos Roastery"}</h1>
            <p>Gudang, produksi &amp; keuangan</p>
          </div>
        </div>
        <div className={`status ${status[0]}`}><span className="dot" /><span>{status[1]}</span></div>
      </header>
      <nav className="tabs" aria-label="Menu">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={path} end className={({ isActive }) => (isActive ? "active" : "")}>{label}</NavLink>
        ))}
      </nav>
      <div className="toolbar">
        <h2>{tab[1]}</h2>
        {tab[2] && (
          <div className="flex items-center gap-2">
            <label htmlFor="month">Periode</label>
            <input id="month" type="month" className="input w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </div>
        )}
      </div>
      {error && <p className="notice mb-3.5">Tidak bisa terhubung ke server: {error}</p>}
      <Outlet />
    </div>
  );
}
