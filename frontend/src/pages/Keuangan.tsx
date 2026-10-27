// Port VIEWS.keuangan: buku kas masuk/keluar, beli green bean, beli kemasan.

import { useState, type FormEvent } from "react";
import { ledgerApi, reportApi } from "../api";
import EntryFeed from "../components/EntryFeed";
import { useToast } from "../components/Toast";
import { DeleteButton, ItemSelect, Loading, MoneyInput, Panel, Segmented } from "../components/ui";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import { dLabel, mLabel, num, rp, rps, short, today } from "../utils/format";

type Sub = "kas" | "green" | "pack";
const TITLE: Record<Sub, string> = { kas: "Catat kas masuk / keluar", green: "Beli green bean", pack: "Beli kemasan" };

export default function Keuangan() {
  const [sub, setSub] = useState<Sub>("kas");
  return (
    <div className="grid gap-3.5">
      <div className="subbar"><Segmented value={sub} onChange={setSub} items={[["kas", "Kas masuk/keluar"], ["green", "Beli green bean"], ["pack", "Beli kemasan"]]} /></div>
      <div className="work">
        <Panel title={TITLE[sub]}><EntryForm sub={sub} key={sub} /></Panel>
        {sub === "kas" ? <Cashbook /> : <Purchases sub={sub} />}
      </div>
    </div>
  );
}

function EntryForm({ sub }: { sub: Sub }) {
  const { month, meta, config, names, changed } = useAppData();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [dir, setDir] = useState<"in" | "out">("out");
  const [category, setCategory] = useState("Pengeluaran Lainnya");
  const [desc, setDesc] = useState("");
  const [total, setTotal] = useState(0);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [supplier, setSupplier] = useState("");
  const [paid, setPaid] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!meta || !config) return <Loading />;
  const unit = sub === "green" ? "kg" : "pcs";
  const q = num(qty);

  // Memilih kategori ikut menyetel arah (kategori pemasukan → Masuk).
  const pickCategory = (c: string) => { setCategory(c); setDir(meta.catsIn.includes(c) ? "in" : "out"); };
  const applyRoutine = (r: { label: string; amount: number }) => {
    setDir("out");
    setCategory(meta.catsOut.includes(r.label) ? r.label : "Pengeluaran Lainnya");
    setDesc(r.label + " " + mLabel(month));
    setTotal(r.amount);
  };

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!(total > 0)) return toast("Isi nominal rupiah.", true);
    let body: Record<string, unknown>;
    if (sub === "kas") {
      if (!desc.trim()) return toast("Isi keterangan.", true);
      body = { type: "kas", date, dir, category, desc, amount: total, note };
    } else {
      if (!item) return toast("Pilih barang dulu.", true);
      if (!(q > 0)) return toast("Isi jumlah.", true);
      body = sub === "green" ? { type: "green_in", greenId: item, kg: q } : { type: "pack_in", packId: item, qty: Math.round(q) };
      Object.assign(body, { date, total, supplier, paid, note });
    }
    setBusy(true);
    try {
      await ledgerApi.create(body);
      toast("Tersimpan.");
      setQty(""); setTotal(0); setNote(""); setDesc("");
      changed();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  const dateField = <label className="field"><span>Tanggal</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>;

  return (
    <form className="form" onSubmit={submit}>
      {sub === "kas" ? (
        <>
          <div className="row">
            {dateField}
            <label className="field"><span>Arah</span>
              <select className="input" value={dir} onChange={(e) => setDir(e.target.value as "in" | "out")}><option value="out">Keluar</option><option value="in">Masuk</option></select>
            </label>
          </div>
          <label className="field"><span>Kategori</span>
            <select className="input" value={category} onChange={(e) => pickCategory(e.target.value)}>
              <optgroup label="Pemasukan">{meta.catsIn.map((c) => <option key={c}>{c}</option>)}</optgroup>
              <optgroup label="Pengeluaran">{meta.catsOut.map((c) => <option key={c}>{c}</option>)}</optgroup>
            </select>
          </label>
          <label className="field"><span>Keterangan</span><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Bayar listrik Oktober" required /></label>
          <label className="field"><span>Nominal (Rp)</span><MoneyInput value={total} onChange={setTotal} required /></label>
          {config.routine.length > 0 && (
            <div className="field"><span>Payment rutin</span>
              <div className="chips">
                {config.routine.map((r, i) => (
                  <button key={i} type="button" className="btn btn-ghost btn-sm" onClick={() => applyRoutine(r)}>{r.label.replace("Payment ", "")} · {short(r.amount)}</button>
                ))}
              </div>
            </div>
          )}
          <p className="hint">Beli green bean &amp; kemasan sebaiknya lewat tab di atas supaya stok ikut bertambah.</p>
        </>
      ) : (
        <>
          <div className="row">
            {dateField}
            <label className="field"><span>Supplier</span>
              <input className="input" list="suppList" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={sub === "green" ? "Mas Heri, Prau…" : "Opsional"} />
              <datalist id="suppList">{names.suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
          </div>
          <label className="field"><span>{sub === "green" ? "Green bean" : "Kemasan"}</span>
            <ItemSelect kind={sub} show={sub} value={item} onChange={setItem} required />
          </label>
          <div className="row">
            <label className="field"><span>{sub === "green" ? "Berat (kg)" : "Jumlah (pcs)"}</span>
              <input className="input" type="number" step={sub === "green" ? "any" : "1"} min="0" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </label>
            <label className="field"><span>Total harga (Rp)</span><MoneyInput value={total} onChange={setTotal} required /></label>
          </div>
          <div className="calc">{q && total ? <div>Harga per {unit}: <b>{rp(total / q)}</b></div> : `Harga per ${unit} muncul setelah jumlah dan total diisi.`}</div>
          <label className="check"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Sudah dibayar (masuk buku kas)</label>
        </>
      )}
      <label className="field"><span>Catatan</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" /></label>
      <div><button className="btn" type="submit" disabled={busy}>Simpan</button></div>
    </form>
  );
}

function Cashbook() {
  const { month, changed } = useAppData();
  const toast = useToast();
  const { data: r, error } = useLoad(() => reportApi.cashbook(month), [month]);
  const del = async (id: string) => {
    try { await ledgerApi.remove(id); toast("Transaksi dihapus."); changed(); } catch (e) { toast((e as Error).message, true); }
  };
  return (
    <Panel title={"Buku kas " + mLabel(month)} hint={r ? `Saldo awal ${rps(r.start)} · akhir ${rps(r.end)}` : ""}>
      {!r ? <Loading error={error} /> : !r.lines.length ? <p className="empty">Belum ada transaksi kas di {mLabel(month)}.</p> : (
        <div className="tw">
          <table className="tbl">
            <thead><tr><th>Tgl</th><th>Keterangan</th><th className="num">Masuk</th><th className="num">Keluar</th><th className="num">Saldo</th><th /></tr></thead>
            <tbody>
              {r.lines.slice().reverse().map((c, i) => (
                <tr key={c.entryId + i}>
                  <td className="mono whitespace-nowrap">{dLabel(c.date)}</td>
                  <td>{c.desc}<span className="sub">{c.cat}</span></td>
                  <td className="num pos">{c.dir === "in" ? rp(c.amt) : ""}</td>
                  <td className="num">{c.dir === "out" ? rp(c.amt) : ""}</td>
                  <td className="num">{rps(c.bal)}</td>
                  <td><div className="actions"><DeleteButton onConfirm={() => del(c.entryId)} /></div></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2}>Total {mLabel(month)}</td><td className="num pos">{rp(r.cin)}</td><td className="num">{rp(r.cout)}</td><td className="num">{rps(r.end)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Purchases({ sub }: { sub: "green" | "pack" }) {
  const { month } = useAppData();
  const type = sub === "green" ? "green_in" : "pack_in";
  const { data, error } = useLoad(() => ledgerApi.list({ month, types: [type] }), [month, type]);
  const total = (data || []).reduce((a, e) => a + (Number(e.total) || 0), 0);
  return (
    <Panel title={(sub === "green" ? "Pembelian green bean " : "Pembelian kemasan ") + mLabel(month)} hint={data ? "Total " + rp(total) : ""}>
      {data ? <EntryFeed entries={data} empty={`Belum ada pembelian di ${mLabel(month)}.`} /> : <Loading error={error} />}
    </Panel>
  );
}
