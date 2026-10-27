// Port VIEWS.penjualan: nota multi-item dari Daftar Harga, stok roasted/blend &
// kemasan terpotong otomatis oleh engine di server.

import { useState, type FormEvent } from "react";
import { ledgerApi, reportApi } from "../api";
import EntryFeed from "../components/EntryFeed";
import { useToast } from "../components/Toast";
import { Loading, MoneyInput, Panel, Segmented } from "../components/ui";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import type { LedgerEntry, Product, StockKind } from "../types";
import { mLabel, nf, pct, rp, today } from "../utils/format";
import { activeList, namer } from "../utils/ledger";

interface SaleLine { productId: string; qty: string; price: number }
const blankLine = (): SaleLine => ({ productId: "", qty: "1", price: 0 });

export default function Penjualan() {
  const { month } = useAppData();
  const [filter, setFilter] = useState<"month" | "unpaid">("month");
  return (
    <div className="work">
      <Panel title="Catat penjualan" hint="Stok roasted/blend & kemasan terpotong otomatis">
        <SaleForm />
      </Panel>
      <Panel
        title={filter === "unpaid" ? "Piutang" : "Penjualan " + mLabel(month)}
        hint={<Segmented value={filter} onChange={setFilter} items={[["month", "Periode ini"], ["unpaid", "Belum lunas (semua)"]]} />}
      >
        {filter === "month" ? <MonthList /> : <UnpaidList />}
      </Panel>
    </div>
  );
}

function SaleForm() {
  const { master, meta, names, qty: stockQty, productCost, changed } = useAppData();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [channel, setChannel] = useState("");
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<SaleLine[]>([blankLine()]);
  const [discount, setDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [method, setMethod] = useState("");
  const [paid, setPaid] = useState(true);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!master || !meta) return <Loading />;
  const n = namer(master);
  const byId = (id: string) => master.products.find((p) => p.id === id);

  // Hitung subtotal, HPP, dan kebutuhan stok per bean (calc() lama).
  let sub = 0, cogs = 0;
  const need: Record<string, number> = {};
  for (const l of lines) {
    const p = byId(l.productId), q = +l.qty || 0;
    sub += q * l.price;
    if (p) {
      cogs += productCost(p) * q;
      const key = (p.kind === "blend" ? "blend" : "roasted") + "|" + p.beanId;
      need[key] = (need[key] || 0) + (p.grams * q) / 1000;
    }
  }
  const net = sub - discount, total = net + shipping;
  const warns = Object.entries(need).flatMap(([key, kg]) => {
    const [t, id] = key.split("|") as [StockKind, string];
    const have = stockQty(t, id);
    return kg > have + 1e-9 ? [`${n.item(t, id)}: butuh ${nf(kg)} kg, stok ${nf(have)} kg`] : [];
  });

  const setLine = (i: number, patch: Partial<SaleLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickProduct = (i: number, id: string) => setLine(i, { productId: id, price: byId(id)?.price ?? 0 });
  const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [blankLine()]));

  // Daftar produk dikelompokkan per grup, label menyertakan harga & stok.
  const products = activeList(master.products);
  const groups = meta.groups.map((g) => [g, products.filter((p) => (p.group || "Lainnya") === g).sort((a, b) => a.name.localeCompare(b.name, "id") || a.grams - b.grams)] as const).filter(([, ps]) => ps.length);
  const optLabel = (p: Product) => `${p.name} · ${rp(p.price)} (stok ${nf(stockQty(p.kind === "blend" ? "blend" : "roasted", p.beanId))} kg)`;

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const items = lines.filter((l) => l.productId && (+l.qty || 0) > 0).map((l) => ({ productId: l.productId, qty: Math.round(+l.qty), price: l.price }));
    if (!items.length) return toast("Tambahkan minimal satu produk.", true);
    setBusy(true);
    try {
      await ledgerApi.create({
        type: "sale", date, customer, channel: channel || meta!.channels[0], method: method || meta!.methods[0],
        items, discount, shipping, paid, due: paid ? undefined : due || undefined, note,
      });
      toast("Penjualan tersimpan.");
      setLines([blankLine()]); setCustomer(""); setDiscount(0); setShipping(0); setNote(""); setDue(""); setPaid(true);
      changed();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="row">
        <label className="field"><span>Tanggal</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label className="field"><span>Kanal</span>
          <select className="input" value={channel || meta.channels[0]} onChange={(e) => setChannel(e.target.value)}>{meta.channels.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
      </div>
      <label className="field"><span>Pelanggan</span>
        <input className="input" list="custList" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Kopi Parang, Dungo Kauman…" />
        <datalist id="custList">{names.customers.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <div className="field">
        <span>Item (dari Daftar Harga)</span>
        <div className="lines-in">
          {lines.map((l, i) => (
            <div className="line" key={i}>
              <select className="input" value={l.productId} onChange={(e) => pickProduct(i, e.target.value)} aria-label="Produk">
                <option value="">Pilih produk</option>
                {groups.map(([g, ps]) => (
                  <optgroup key={g} label={g}>{ps.map((p) => <option key={p.id} value={p.id}>{optLabel(p)}</option>)}</optgroup>
                ))}
              </select>
              <input className="input" type="number" min="1" step="1" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Jumlah" />
              <MoneyInput value={l.price} onChange={(v) => setLine(i, { price: v })} placeholder="Harga" aria-label="Harga satuan" />
              <button type="button" className="icon-btn" onClick={() => removeLine(i)} aria-label="Hapus baris">×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm justify-self-start" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Tambah item</button>
      </div>
      <div className="row">
        <label className="field"><span>Diskon (Rp)</span><MoneyInput value={discount} onChange={setDiscount} placeholder="0" /></label>
        <label className="field"><span>Ongkir ditagih (Rp)</span><MoneyInput value={shipping} onChange={setShipping} placeholder="0" /></label>
      </div>
      <div className="row">
        <label className="field"><span>Metode bayar</span>
          <select className="input" value={method || meta.methods[0]} onChange={(e) => setMethod(e.target.value)}>{meta.methods.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        {!paid && <label className="field"><span>Jatuh tempo</span><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>}
      </div>
      <label className="check"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Sudah dibayar (masuk buku kas sebagai Penjualan Kopi)</label>
      <label className="field"><span>Catatan</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" /></label>
      <div className="calc">
        {sub ? (
          <>
            <div>Subtotal <b>{rp(sub)}</b> · HPP ≈ <b>{rp(cogs)}</b> · laba kotor <b>{rp(net - cogs)}</b>{net ? ` (${pct((net - cogs) / net)})` : ""}</div>
            {warns.map((w) => <div key={w} className="warn">{w}</div>)}
          </>
        ) : "Pilih produk untuk menghitung total."}
      </div>
      <div className="total-bar"><span>Total</span><b>{rp(total)}</b></div>
      <div><button className="btn" type="submit" disabled={busy}>Simpan penjualan</button></div>
    </form>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function MonthList() {
  const { month } = useAppData();
  const { data: sales, error } = useLoad(() => ledgerApi.list({ month, types: ["sale"] }), [month]);
  const { data: rep } = useLoad(() => reportApi.monthly(month), [month]);
  if (!sales) return <Loading error={error} />;
  // Ringkasan nota bulan ini (x.orders, x.kgSold, x.sales − x.disc + x.ship di app lama).
  const kg = sales.reduce((a, e: any) => a + (e.items || []).reduce((b: number, i: any) => b + ((+i.grams || 0) * (+i.qty || 0)) / 1000, 0), 0);
  const tot = sales.reduce((a, e: any) => a + (+e.total || 0), 0);
  const kasSales = rep?.ins.find((x) => x.cat === "Penjualan Kopi")?.amt || 0;
  return (
    <>
      <p className="hint -mt-1 mb-2.5">Nota: {sales.length} order · {nf(kg)} kg · {rp(tot)} · Kas kategori Penjualan Kopi bulan ini: {rp(kasSales)}</p>
      <EntryFeed entries={sales} empty={`Belum ada nota penjualan di ${mLabel(month)}. Pemasukan lama dari Excel ada di Kas & Pembelian.`} />
    </>
  );
}

function UnpaidList() {
  const { data, error } = useLoad(() => reportApi.bills(), []);
  if (!data) return <Loading error={error} />;
  const list: LedgerEntry[] = data.recv.slice().sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      {list.length > 0 && <p className="hint -mt-1 mb-2.5">{list.length} order · total {rp(list.reduce((a, e) => a + (Number(e.total) || 0), 0))}</p>}
      <EntryFeed entries={list} empty="Semua penjualan sudah lunas." />
    </>
  );
}
