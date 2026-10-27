// Grafik batang pemasukan vs pengeluaran 6 bulan (port dari VIEWS.ringkasan lama).

import { mLabel, mShort, rp, short } from "../utils/format";

export default function CashChart({ data, current }: { data: { month: string; cin: number; cout: number }[]; current: string }) {
  const max = Math.max(0, ...data.flatMap((d) => [d.cin, d.cout]));
  if (max <= 0) return <p className="empty">Grafik muncul setelah ada transaksi kas.</p>;

  const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p, top = step * Math.ceil(max / step);
  const W = 640, H = 240, L = 58, R = 8, T = 10, B = 26, gw = (W - L - R) / data.length, bw = Math.min(26, gw * 0.3);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-bean" />Pemasukan</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-roast" />Pengeluaran</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="font-mono" role="img" aria-label="Grafik pemasukan dan pengeluaran 6 bulan">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{short(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + gw * i + gw / 2;
          return (
            <g key={d.month}>
              <rect x={cx - bw - 2} y={y(d.cin)} width={bw} height={Math.max(0, y(0) - y(d.cin))} rx={3} fill="var(--bean)">
                <title>{`${mLabel(d.month)} pemasukan ${rp(d.cin)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(d.cout)} width={bw} height={Math.max(0, y(0) - y(d.cout))} rx={3} fill="var(--roast)">
                <title>{`${mLabel(d.month)} pengeluaran ${rp(d.cout)}`}</title>
              </rect>
              <text x={cx} y={H - 7} textAnchor="middle" fontSize="11" fill={d.month === current ? "var(--ink)" : "var(--muted)"} fontWeight={d.month === current ? 600 : 400}>
                {mShort(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
