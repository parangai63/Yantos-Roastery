import { useState, type FormEvent } from "react";
import { ledgerApi, reportApi } from "../api";
import { useToast } from "../components/Toast";
import { ItemSelect, Loading, Panel, Segmented, StockStatus } from "../components/ui";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import type { StockKind } from "../types";
import { nf, num, pct, rp, rps, today } from "../utils/format";
import { T_LABEL, T_UNIT } from "../utils/ledger";

type Filter = "all" | "have" | "low";

export default function Stok() {
  const { master } = useAppData();
  const [kind, setKind] = useState<StockKind>("green");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const { data, error } = useLoad(() => reportApi.stock(kind), [kind]);
  const unit = T_UNIT[kind];

  // Seperti app lama: hanya item aktif yang ditampilkan.
  const rows = (data?.rows || [])
    .filter((r) => r.active)
    .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => filter === "all" || (filter === "have" && r.qty > 1e-6) || (filter === "low" && r.min > 0 && r.qty < r.min));
  // Nilai per baris = stok × biaya, sama dengan tabel stok lama.
  const valOf = (r: (typeof rows)[number]) => Math.max(0, r.qty * r.avg);
  const total = rows.reduce((a, r) => a + valOf(r), 0);

  const sub = (id: string, r: (typeof rows)[number]) => {
    if (kind === "green") {
      const g = master?.greens.find((x) => x.id === id);
      return g ? [g.category, g.supplier].filter(Boolean).join(" · ") : "";
    }
    if (kind === "roasted" && r.yield) return `susut rata² ${pct(1 - r.yield)} dari ${nf(r.roastIn || 0)} kg roasting`;
    return "";
  };

  return (
    <div className="grid gap-3.5">
      <div className="subbar">
        <Segmented value={kind} onChange={setKind} items={[["green", "Green bean"], ["roasted", "Roasted"], ["blend", "Blend"], ["pack", "Kemasan"]]} />
        <div className="chips">
          <input type="search" className="input max-w-[260px]" placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari" />
          <Segmented value={filter} onChange={setFilter} items={[["all", "Semua"], ["have", "Ada stok"], ["low", "Perlu restock"]]} />
        </div>
      </div>
      <div className="work">
        <Panel title="Stok opname" hint="Samakan dengan hitungan fisik">
          <Opname kind={kind} key={kind} />
        </Panel>
        <Panel title={T_LABEL[kind] + (rows.length ? ` · ${rows.length} item` : "")} hint={rows.length ? "Nilai: " + rp(total) : ""}>
          {!data ? <Loading error={error} /> : !rows.length ? (
            <p className="empty">{q || filter !== "all" ? "Tidak ada item yang cocok dengan filter." : "Belum ada data. Tambahkan di Data Master."}</p>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{T_LABEL[kind]}</th><th className="num">Stok ({unit})</th><th className="num">Reorder</th>
                    <th className="num">{kind === "pack" ? "Harga/pcs" : "Biaya/kg"}</th><th className="num">Nilai</th><th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = sub(r.id, r);
                    return (
                      <tr key={r.id}>
                        <td><b>{r.name}</b>{s && <span className="sub">{s}</span>}</td>
                        <td className="num">{nf(r.qty, kind === "pack" ? 0 : 2)}</td>
                        <td className="num">{r.min ? nf(r.min, 2) : "–"}</td>
                        <td className="num">{rp(r.avg)}</td>
                        <td className="num">{rp(valOf(r))}</td>
                        <td><StockStatus qty={r.qty} min={r.min} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr><td colSpan={4}>Total nilai</td><td className="num">{rp(total)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// Form stok opname: catat selisih stok fisik vs sistem sebagai entri "adjust".
function Opname({ kind }: { kind: StockKind }) {
  const { qty, cost, changed } = useAppData();
  const toast = useToast();
  const [item, setItem] = useState("");
  const [actual, setActual] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const unit = T_UNIT[kind];
  const sys = item ? qty(kind, item) : 0;
  const d = num(actual) - sys;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!item) return toast("Pilih barang dulu.", true);
    if (Math.abs(d) < 1e-9) return toast("Stok fisik sama dengan sistem.");
    setBusy(true);
    try {
      await ledgerApi.create({ type: "adjust", date, target: kind, itemId: item, delta: Math.round(d * 1000) / 1000, note });
      toast("Stok disesuaikan.");
      setActual(""); setNote("");
      changed();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field"><span>{T_LABEL[kind]}</span><ItemSelect kind={kind} show={kind} value={item} onChange={setItem} required /></label>
      <div className="row">
        <label className="field"><span>Stok fisik ({unit})</span><input className="input" type="number" step="any" min="0" value={actual} onChange={(e) => setActual(e.target.value)} required /></label>
        <label className="field"><span>Tanggal</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
      </div>
      <div className="calc">
        {!item ? "Pilih barang untuk melihat stok di sistem." : (
          <>
            <div>Stok di sistem: <b>{nf(sys)} {unit}</b></div>
            {actual !== "" && <div className={d < 0 ? "bad" : ""}>Selisih: <b>{d > 0 ? "+" : ""}{nf(d)} {unit}</b> · nilai {rps(d * cost(kind, item))}</div>}
          </>
        )}
      </div>
      <label className="field"><span>Alasan</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hitung bulanan, rusak, tumpah…" /></label>
      <div><button className="btn" type="submit" disabled={busy}>Simpan penyesuaian</button></div>
    </form>
  );
}
