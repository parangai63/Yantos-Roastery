// Port VIEWS.keuangan: buku kas masuk/keluar, beli green bean, beli kemasan.

import { useEffect, useState, type FormEvent } from "react";
import { createLedgerEntry, deleteLedgerEntry, fetchLedgerEntries } from "../api/ledger";
import { fetchCashbook } from "../api/reports";
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
  const { month, meta, config, master, buys, changed } = useAppData();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [dir, setDir] = useState<"in" | "out">("out");
  const [category, setCategory] = useState("Pengeluaran Lainnya");
  const [desc, setDesc] = useState("");
  const [total, setTotal] = useState(0);
  // true setelah total diketik sendiri: isian otomatis dari harga terakhir tidak menimpanya lagi.
  const [totalTouched, setTotalTouched] = useState(false);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [paid, setPaid] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const unit = sub === "green" ? "kg" : "pcs";
  const q = num(qty);

  // ----- supplier & harga (beli green / kemasan) -----
  const suppliers = (master?.suppliers || []).filter((s) => s.active);
  const supplies = (s: { greenIds: string[]; packIds: string[] }) => (sub === "green" ? s.greenIds : s.packIds).includes(item);
  const linked = item ? suppliers.filter(supplies) : [];
  const others = suppliers.filter((s) => !linked.includes(s));
  const lastPrice = (sid: string) => (sid && item ? buys.prices[`${sid}|${item}`] : undefined);
  const refPrice = item ? (sub === "green" ? master?.greens.find((g) => g.id === item)?.price : master?.packs.find((p) => p.id === item)?.price) || 0 : 0;
  const chosen = suppliers.find((s) => s.id === supplierId);
  const unitPrice = lastPrice(supplierId)?.price || refPrice;

  // Ganti item: pilih supplier otomatis (supplier terakhir untuk item ini, atau satu-satunya pemasok).
  const pickItem = (id: string) => {
    setItem(id);
    setTotalTouched(false);
    const sup = (master?.suppliers || []).filter((s) => s.active && (sub === "green" ? s.greenIds : s.packIds).includes(id));
    const last = buys.lastSupplier[id];
    setSupplierId(sup.some((s) => s.id === last) ? last : sup.length === 1 ? sup[0].id : "");
  };

  // Total otomatis = harga satuan terakhir (atau harga referensi master) × jumlah, selama belum diketik sendiri.
  useEffect(() => {
    if (sub === "kas" || totalTouched) return;
    setTotal(q > 0 && unitPrice > 0 ? Math.round(q * unitPrice) : 0);
  }, [sub, totalTouched, q, unitPrice]);

  if (!meta || !config) return <Loading />;
  const priceLabel = (sid: string) => {
    const lp = lastPrice(sid);
    return lp ? ` · terakhir ${rp(lp.price)}/${unit} (${dLabel(lp.date)})` : "";
  };

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
      Object.assign(body, { date, total, supplierId, paid, note });
    }
    setBusy(true);
    try {
      await createLedgerEntry(body);
      toast("Tersimpan.");
      setQty(""); setTotal(0); setTotalTouched(false); setNote(""); setDesc("");
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
          {dateField}
          <label className="field"><span>{sub === "green" ? "Green bean" : "Kemasan"}</span>
            <ItemSelect kind={sub} show={sub} value={item} onChange={pickItem} required />
          </label>
          <label className="field"><span>Supplier</span>
            <select className="input" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setTotalTouched(false); }} disabled={!item}>
              <option value="">{item ? "Tanpa supplier" : "Pilih barang dulu"}</option>
              {linked.length > 0 && (
                <optgroup label={`Memasok ${sub === "green" ? "bean" : "kemasan"} ini`}>
                  {linked.map((s) => <option key={s.id} value={s.id}>{s.name}{priceLabel(s.id)}</option>)}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label={linked.length ? "Supplier lain" : "Semua supplier"}>
                  {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          {!suppliers.length ? <p className="hint">Belum ada supplier. Tambahkan di Data Master → Supplier.</p>
            : chosen && item && !supplies(chosen) ? <p className="hint">{chosen.name} akan otomatis dicatat sebagai pemasok {sub === "green" ? "bean" : "kemasan"} ini.</p>
            : item && !linked.length ? <p className="hint">Belum ada supplier yang tercatat memasok {sub === "green" ? "bean" : "kemasan"} ini.</p> : null}
          <div className="row">
            <label className="field"><span>{sub === "green" ? "Berat (kg)" : "Jumlah (pcs)"}</span>
              <input className="input" type="number" step={sub === "green" ? "any" : "1"} min="0" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </label>
            <label className="field"><span>Total harga (Rp)</span><MoneyInput value={total} onChange={(n) => { setTotal(n); setTotalTouched(true); }} required /></label>
          </div>
          <div className="calc">
            {q && total ? <div>Harga per {unit}: <b>{rp(total / q)}</b></div> : <div>Harga per {unit} muncul setelah jumlah dan total diisi.</div>}
            {item && (lastPrice(supplierId)
              ? <div>Harga terakhir dari {chosen?.name}: <b>{rp(lastPrice(supplierId)!.price)}</b>/{unit} ({dLabel(lastPrice(supplierId)!.date)})</div>
              : refPrice > 0 ? <div>Harga referensi master: <b>{rp(refPrice)}</b>/{unit}</div> : null)}
            {totalTouched && unitPrice > 0 && q > 0 && (
              <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setTotalTouched(false)}>Hitung ulang dari harga {rp(unitPrice)}/{unit}</button></div>
            )}
          </div>
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
  const { data: r, error } = useLoad(() => fetchCashbook(month), [month]);
  const del = async (id: string) => {
    try { await deleteLedgerEntry(id); toast("Transaksi dihapus."); changed(); } catch (e) { toast((e as Error).message, true); }
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
  const { data, error } = useLoad(() => fetchLedgerEntries({ month, types: [type] }), [month, type]);
  const total = (data || []).reduce((a, e) => a + (Number(e.total) || 0), 0);
  return (
    <Panel title={(sub === "green" ? "Pembelian green bean " : "Pembelian kemasan ") + mLabel(month)} hint={data ? "Total " + rp(total) : ""}>
      {data ? <EntryFeed entries={data} empty={`Belum ada pembelian di ${mLabel(month)}.`} /> : <Loading error={error} />}
    </Panel>
  );
}
