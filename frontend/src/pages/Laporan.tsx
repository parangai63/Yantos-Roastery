import { useState } from "react";
import { reportApi } from "../api";
import EntryFeed from "../components/EntryFeed";
import { useToast } from "../components/Toast";
import { Line, Loading, Panel, Segmented } from "../components/ui";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import { BULAN, mLabel, nf, pct, rp, rps, short } from "../utils/format";

type Sub = "bulanan" | "tahunan" | "hpp" | "tagihan";

export default function Laporan() {
  const { month } = useAppData();
  const toast = useToast();
  const [sub, setSub] = useState<Sub>("bulanan");

  // Unduh buku kas bulan terpilih sebagai CSV (BOM supaya Excel membaca UTF-8).
  async function exportCsv() {
    try {
      const { lines } = await reportApi.cashbook(month);
      const rows: (string | number)[][] = [["Tanggal", "Keterangan", "Kategori", "Masuk (Rp)", "Keluar (Rp)", "Saldo (Rp)"]];
      lines.forEach((c) => rows.push([c.date, c.desc, c.cat, c.dir === "in" ? Math.round(c.amt) : "", c.dir === "out" ? Math.round(c.amt) : "", Math.round(c.bal)]));
      const csv = "﻿" + rows.map((r) => r.map((v) => { const s = String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `buku-kas-${month}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast("Gagal mengunduh: " + (e as Error).message, true);
    }
  }

  return (
    <div className="grid gap-3.5">
      <div className="subbar">
        <Segmented value={sub} onChange={setSub} items={[["bulanan", "Bulanan & bagi hasil"], ["tahunan", "Rekap tahunan"], ["hpp", "HPP & margin"], ["tagihan", "Piutang & hutang"]]} />
        {sub === "bulanan" && <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>Unduh buku kas (CSV)</button>}
      </div>
      {sub === "bulanan" && <Bulanan />}
      {sub === "tahunan" && <Tahunan />}
      {sub === "hpp" && <Hpp />}
      {sub === "tagihan" && <Tagihan />}
    </div>
  );
}

function Bulanan() {
  const { month } = useAppData();
  const { data: r, error } = useLoad(() => reportApi.monthly(month), [month]);
  if (!r) return <Loading error={error} />;
  const c = r.config;
  return (
    <div className="grid2b">
      <Panel title={`Arus kas ${mLabel(month)}`}>
        <Line label="Kas awal bulan" value={rps(r.start)} tone="tot" />
        <Line label="Pemasukan" value="" tone="sec" />
        {r.ins.length ? r.ins.map((x) => <Line key={x.cat} label={x.cat} value={rp(x.amt)} tone="in" />) : <Line label="Tidak ada" value={rp(0)} tone="in" />}
        <Line label="Total pemasukan" value={rp(r.cin)} tone="tot" />
        <Line label="Pengeluaran" value="" tone="sec" />
        {r.outs.length ? r.outs.map((x) => <Line key={x.cat} label={x.cat} value={rp(x.amt)} tone="in" />) : <Line label="Tidak ada" value={rp(0)} tone="in" />}
        <Line label="Total pengeluaran" value={rp(r.cout)} tone="tot" />
        <Line label="Kas akhir bulan" value={rps(r.end)} tone="big" />
      </Panel>
      <Panel title="Laba & pembagian" hint={r.basis === "op" ? "Laba tanpa modal & dividen" : "Laba = pemasukan − pengeluaran (seperti Excel)"}>
        <Line label="Laba (profit)" value={<span className={r.laba >= 0 ? "pos" : "neg"}>{rps(r.laba)}</span>} tone="big" />
        {r.distrib.shares.map((s) => <Line key={s.label} label={`${s.label} ${nf(s.pct, 2)}%`} value={rp(s.amt || 0)} tone="in" />)}
        <Line label={`Saving (min ${short(c.savingMin)} atau ${nf(c.savingPct)}% laba)`} value={rp(r.distrib.saving)} tone="in" />
        <Line label="Sisa setelah distribusi" value={<span className={r.distrib.sisa >= 0 ? "pos" : "neg"}>{rps(r.distrib.sisa)}</span>} tone="big" />
        <Line label="Distribusi/dividen sudah ditransfer bulan ini" value={rp(r.realized)} tone="in" />
        {r.laba <= 0 && <p className="hint mt-2">Laba bulan ini tidak positif, jadi pembagian 0. Saving minimum tetap dihitung, sama seperti rumus Excel.</p>}
      </Panel>
    </div>
  );
}

function Tahunan() {
  const { month } = useAppData();
  const year = month.slice(0, 4);
  const { data: r, error } = useLoad(() => reportApi.yearly(year), [year]);
  if (!r) return <Loading error={error} />;
  const rows = r.rows;
  const sum = (f: (x: (typeof rows)[number]) => number) => rows.reduce((a, x) => a + f(x), 0);
  return (
    <Panel title={`Laporan bulanan ${year}`} hint="Sama dengan sheet Laporan Bulanan di Excel">
      <div className="tw">
        <table className="tbl">
          <thead>
            <tr>
              <th>Periode</th><th className="num">Pemasukan</th><th className="num">Pengeluaran</th><th className="num">Laba</th>
              {r.shareLabels.map((l) => <th key={l} className="num">{l}</th>)}
              <th className="num">Saving</th><th className="num">Sisa</th><th className="num">Kas awal</th><th className="num">Kas akhir</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x, i) => (
              <tr key={x.month} className={x.month === month ? "cur" : ""}>
                <td>{BULAN[i].slice(0, 3)} {year}</td>
                <td className="num">{rp(x.cin)}</td><td className="num">{rp(x.cout)}</td>
                <td className={`num ${x.laba < 0 ? "neg" : ""}`}>{rps(x.laba)}</td>
                {x.shares.map((s) => <td key={s.label} className="num">{rp(s.amt || 0)}</td>)}
                <td className="num">{rp(x.saving)}</td>
                <td className={`num ${x.sisa < 0 ? "neg" : ""}`}>{rps(x.sisa)}</td>
                <td className="num">{rps(x.awal)}</td><td className="num">{rps(x.akhir)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total {year}</td><td className="num">{rp(sum((x) => x.cin))}</td><td className="num">{rp(sum((x) => x.cout))}</td>
              <td className="num">{rps(sum((x) => x.laba))}</td>
              {r.shareLabels.map((l, j) => <td key={l} className="num">{rp(sum((x) => x.shares[j]?.amt || 0))}</td>)}
              <td className="num">{rp(sum((x) => x.saving))}</td><td /><td />
              <td className="num">{rps(r.rows[11].akhir)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}

function Hpp() {
  const { month, master, meta } = useAppData();
  const { data: r, error } = useLoad(() => reportApi.hpp(month), [month]);
  if (!r || !master || !meta) return <Loading error={error} />;
  const net = r.sales - r.disc;
  const packName = (id: string) => master.packs.find((p) => p.id === id)?.name || "";
  return (
    <div className="grid gap-4">
      <div className="grid2b">
        <Panel title={`Laba kotor nota ${mLabel(month)}`}>
          <Line label="Penjualan (nota)" value={rp(r.sales)} />
          <Line label="Diskon" value={"−" + rp(r.disc)} tone="in" />
          <Line label="HPP (biaya stok terjual)" value={"−" + rp(r.cogs)} />
          <Line label={`Laba kotor${net ? " · " + pct(r.gross / net) : ""}`} value={<span className={r.gross >= 0 ? "pos" : "neg"}>{rps(r.gross)}</span>} tone="big" />
          <p className="hint mt-2">Hanya dari penjualan yang dicatat lewat menu Penjualan. Pemasukan lama dari Excel tidak punya rincian produk.</p>
        </Panel>
        <Panel title={`Nilai stok keluar ${mLabel(month)}`}>
          {r.usage.length ? (
            <>
              {r.usage.map((u) => <Line key={u.cat} label={`${u.cat} · ${nf(u.kg)} kg`} value={rp(u.val)} />)}
              <Line label="Total" value={rp(r.usage.reduce((a, u) => a + u.val, 0))} tone="tot" />
            </>
          ) : <p className="empty">Belum ada stok keluar bulan ini.</p>}
        </Panel>
      </div>
      <Panel title="HPP & margin per produk" hint="HPP = biaya rata-rata stok saat ini, atau harga referensi kalau belum ada stok">
        <div className="tw">
          <table className="tbl">
            <thead><tr><th>Produk</th><th className="num">HPP</th><th className="num">Harga jual</th><th className="num">Margin</th><th className="num">%</th><th className="num">Terjual</th><th className="num">Omzet</th></tr></thead>
            <tbody>
              {meta.groups.flatMap((g) => {
                const ps = r.products.filter((p) => p.group === g).sort((a, b) => a.name.localeCompare(b.name, "id") || a.grams - b.grams);
                if (!ps.length) return [];
                return [
                  <tr key={g} className="grp"><td colSpan={7}>{g}</td></tr>,
                  ...ps.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b><div className="hint">{p.packId ? packName(p.packId) : "tanpa kemasan"}</div></td>
                      <td className="num">{rp(p.cost)}</td><td className="num">{rp(p.price)}</td>
                      <td className={`num ${p.margin < 0 ? "neg" : "pos"}`}>{rps(p.margin)}</td>
                      <td className="num">{p.price ? pct(p.margin / p.price) : "–"}</td>
                      <td className="num">{nf(p.soldQty, 0)}</td><td className="num">{rp(p.rev)}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Tagihan() {
  const { data: r, error } = useLoad(() => reportApi.bills(), []);
  if (!r) return <Loading error={error} />;
  const tot = (l: typeof r.recv) => rp(l.reduce((a, e) => a + (Number(e.total) || 0), 0));
  return (
    <div className="grid2b">
      <Panel title="Piutang pelanggan" hint={r.recv.length ? tot(r.recv) : ""}><EntryFeed entries={r.recv} empty="Tidak ada piutang." /></Panel>
      <Panel title="Hutang ke supplier" hint={r.pay.length ? tot(r.pay) : ""}><EntryFeed entries={r.pay} empty="Tidak ada hutang." /></Panel>
    </div>
  );
}
