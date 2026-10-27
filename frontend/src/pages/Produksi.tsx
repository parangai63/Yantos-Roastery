// Port VIEWS.produksi: roasting (green → roasted), racik blend (roasted → blend),
// dan stok keluar selain penjualan bernota.

import { useState, type FormEvent, type ReactNode } from "react";
import { ledgerApi, reportApi } from "../api";
import EntryFeed from "../components/EntryFeed";
import { useToast } from "../components/Toast";
import { ItemSelect, Loading, Panel, Segmented } from "../components/ui";
import { useAppData } from "../context/AppData";
import { useLoad } from "../hooks/useLoad";
import type { StockKind } from "../types";
import { mLabel, nf, num, pct, rp, short, today } from "../utils/format";
import { namer } from "../utils/ledger";

type Sub = "roast" | "blend" | "usage";

export default function Produksi() {
  const [sub, setSub] = useState<Sub>("roast");
  return (
    <div className="grid gap-3.5">
      <div className="subbar"><Segmented value={sub} onChange={setSub} items={[["roast", "Roasting"], ["blend", "Racik blend"], ["usage", "Stok keluar"]]} /></div>
      <div className="work">
        {sub === "roast" && <RoastForm />}
        {sub === "blend" && <BlendForm />}
        {sub === "usage" && <UsageForm />}
        <div className="grid gap-4">
          <Stats />
          <Log />
        </div>
      </div>
    </div>
  );
}

// Simpan entri lalu muat ulang data; mengembalikan true kalau berhasil.
function useSave() {
  const { changed } = useAppData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await ledgerApi.create(body);
      toast(ok);
      changed();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, save, toast };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function RoastForm() {
  const { qty, cost } = useAppData();
  const { busy, save, toast } = useSave();
  const [date, setDate] = useState(today());
  const [batch, setBatch] = useState("");
  const [greenId, setGreenId] = useState("");
  const [inKg, setInKg] = useState("");
  const [outKg, setOutKg] = useState("");
  const [note, setNote] = useState("");
  const i = num(inKg), o = num(outKg);

  let calc: ReactNode = "Isi berat masuk dan keluar untuk melihat susut.";
  if (i && o) {
    if (o > i) calc = <div className="bad">Berat keluar tidak boleh lebih besar dari berat masuk.</div>;
    else {
      const s = 1 - o / i, have = qty("green", greenId), c = cost("green", greenId);
      calc = (
        <>
          <div>Susut: <b>{pct(s)}</b>{(s < 0.08 || s > 0.22) && <span className="warn"> · di luar kisaran umum 10–20%, cek timbangan</span>}</div>
          {greenId && c > 0 && <div>Biaya roasted ≈ <b>{rp(c / (o / i))}</b>/kg</div>}
          {greenId && i > have + 1e-9 && <div className="bad">Stok green hanya {nf(have)} kg</div>}
        </>
      );
    }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!greenId) return toast("Pilih green bean dulu.", true);
    if (!(i > 0 && o > 0) || o > i) return toast("Periksa berat: keluar harus lebih kecil dari masuk.", true);
    if (await save({ type: "roast", date, greenId, inKg: i, outKg: o, batch, note }, "Roasting tersimpan.")) {
      setInKg(""); setOutKg(""); setBatch(""); setNote("");
    }
  }

  return (
    <Panel title="Catat roasting">
      <form className="form" onSubmit={submit}>
        <div className="row">
          <Field label="Tanggal"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Batch / profil"><input className="input" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Espresso · B-12" /></Field>
        </div>
        <Field label="Green bean"><ItemSelect kind="green" show="green" value={greenId} onChange={setGreenId} required /></Field>
        <div className="row">
          <Field label="Berat masuk / green (kg)"><input className="input" type="number" step="any" min="0" value={inKg} onChange={(e) => setInKg(e.target.value)} required /></Field>
          <Field label="Berat keluar / roasted (kg)"><input className="input" type="number" step="any" min="0" value={outKg} onChange={(e) => setOutKg(e.target.value)} required /></Field>
        </div>
        <div className="calc">{calc}</div>
        <Field label="Catatan"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" /></Field>
        <div><button className="btn" type="submit" disabled={busy}>Simpan roasting</button></div>
      </form>
    </Panel>
  );
}

interface Part { greenId: string; kg: string }
const blankParts = (): Part[] => [{ greenId: "", kg: "" }, { greenId: "", kg: "" }];

function BlendForm() {
  const { master, qty, cost } = useAppData();
  const { busy, save, toast } = useSave();
  const [date, setDate] = useState(today());
  const [total, setTotal] = useState("");
  const [blendId, setBlendId] = useState("");
  const [parts, setParts] = useState<Part[]>(blankParts());
  const [note, setNote] = useState("");
  if (!master) return <Loading />;
  const n = namer(master);

  // Kalau blend punya resep dan total kg diisi, komponen terisi otomatis.
  const fromRecipe = (bId: string, tot: string) => {
    const b = master.blends.find((x) => x.id === bId), t = num(tot);
    if (!b || !b.recipe.length || !t) return;
    setParts(b.recipe.map((r) => ({ greenId: r.greenId, kg: String(Math.round(((t * r.pct) / 100) * 1000) / 1000) })));
  };
  const valid = parts.map((p) => ({ greenId: p.greenId, kg: num(p.kg) })).filter((p) => p.greenId && p.kg > 0);
  const kg = valid.reduce((a, p) => a + p.kg, 0), v = valid.reduce((a, p) => a + p.kg * cost("roasted", p.greenId), 0);
  const setPart = (i: number, patch: Partial<Part>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!blendId) return toast("Pilih blend dulu.", true);
    if (!valid.length) return toast("Isi minimal satu komponen roasted.", true);
    const ps = valid.map((p) => ({ greenId: p.greenId, kg: Math.round(p.kg * 1000) / 1000 }));
    if (await save({ type: "blend", date, blendId, parts: ps, note }, "Racikan blend tersimpan.")) {
      setParts(blankParts()); setTotal(""); setNote("");
    }
  }

  return (
    <Panel title="Racik blend" hint="Roasted → stok blend">
      <form className="form" onSubmit={submit}>
        <div className="row">
          <Field label="Tanggal"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Total blend (kg)">
            <input className="input" type="number" step="any" min="0" value={total} placeholder="Isi untuk pakai resep"
              onChange={(e) => { setTotal(e.target.value); fromRecipe(blendId, e.target.value); }} />
          </Field>
        </div>
        <Field label="Blend"><ItemSelect kind="blend" show="blend" value={blendId} onChange={(id) => { setBlendId(id); fromRecipe(id, total); }} required /></Field>
        <div className="field">
          <span>Komponen roasted (kg)</span>
          <div className="lines-in">
            {parts.map((p, i) => (
              <div className="line2" key={i}>
                <ItemSelect kind="roasted" show="roasted" value={p.greenId} onChange={(id) => setPart(i, { greenId: id })} placeholder="Roasted bean" ariaLabel="Roasted bean" />
                <input className="input" type="number" min="0" step="any" placeholder="kg" value={p.kg} onChange={(e) => setPart(i, { kg: e.target.value })} aria-label="Kg" />
                <button type="button" className="icon-btn" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} aria-label="Hapus">×</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-sm justify-self-start" onClick={() => setParts((ps) => [...ps, { greenId: "", kg: "" }])}>+ Komponen</button>
        </div>
        <div className="calc">
          {!valid.length ? "Pilih blend. Kalau blend punya resep, komponen terisi otomatis dari total kg." : (
            <>
              <div>Hasil blend: <b>{nf(kg)} kg</b> · biaya ≈ <b>{rp(kg ? v / kg : 0)}</b>/kg</div>
              {valid.map((p) => {
                const have = qty("roasted", p.greenId);
                return p.kg > have + 1e-9 ? <div key={p.greenId} className="bad">{n.g(p.greenId)}: stok roasted hanya {nf(have)} kg</div> : null;
              })}
            </>
          )}
        </div>
        <Field label="Catatan"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" /></Field>
        <div><button className="btn" type="submit" disabled={busy}>Simpan racikan</button></div>
      </form>
    </Panel>
  );
}

function UsageForm() {
  const { meta, qty, cost } = useAppData();
  const { busy, save, toast } = useSave();
  const [date, setDate] = useState(today());
  const [target, setTarget] = useState<StockKind>("roasted");
  const [itemId, setItemId] = useState("");
  const [kg, setKg] = useState("");
  const [category, setCategory] = useState("");
  const [packId, setPackId] = useState("");
  const [packQty, setPackQty] = useState("");
  const [note, setNote] = useState("");
  if (!meta) return <Loading />;
  const q = num(kg), cat = category || meta.useCats[0];

  let calc: ReactNode = "Isi item dan jumlah untuk melihat nilainya.";
  if (itemId && q) {
    const have = qty(target, itemId);
    let v = q * cost(target, itemId);
    if (packId) v += num(packQty) * cost("pack", packId);
    calc = (
      <>
        <div>Nilai stok keluar ≈ <b>{rp(v)}</b></div>
        {q > have + 1e-9 && <div className="bad">Stok hanya {nf(have)} kg</div>}
      </>
    );
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!itemId) return toast("Pilih item dulu.", true);
    if (!(q > 0)) return toast("Isi jumlah kg.", true);
    const body: Record<string, unknown> = { type: "usage", date, target, itemId, kg: q, category: cat, note };
    if (packId && num(packQty) > 0) Object.assign(body, { packId, packQty: Math.round(num(packQty)) });
    if (await save(body, "Stok keluar tersimpan.")) {
      setKg(""); setPackQty(""); setNote("");
    }
  }

  return (
    <Panel title="Stok keluar" hint="Pemakaian selain penjualan bernota">
      <form className="form" onSubmit={submit}>
        <div className="row">
          <Field label="Tanggal"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Jenis stok">
            <select className="input" value={target} onChange={(e) => { setTarget(e.target.value as StockKind); setItemId(""); }}>
              <option value="roasted">Roasted bean</option><option value="blend">Blend</option><option value="green">Green bean</option>
            </select>
          </Field>
        </div>
        <Field label="Item"><ItemSelect key={target} kind={target} show={target} value={itemId} onChange={setItemId} required /></Field>
        <div className="row">
          <Field label="Jumlah (kg)"><input className="input" type="number" step="any" min="0" value={kg} onChange={(e) => setKg(e.target.value)} required /></Field>
          <Field label="Kategori">
            <select className="input" value={cat} onChange={(e) => setCategory(e.target.value)}>{meta.useCats.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
        </div>
        <div className="row">
          <Field label="Kemasan dipakai (opsional)"><ItemSelect kind="pack" show="pack" value={packId} onChange={setPackId} placeholder="Tidak pakai kemasan" /></Field>
          <Field label="Jumlah kemasan"><input className="input" type="number" step="1" min="0" value={packQty} onChange={(e) => setPackQty(e.target.value)} /></Field>
        </div>
        <div className="calc">{calc}</div>
        <Field label="Keterangan"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: kirim ke Kopi Parang" /></Field>
        <div><button className="btn" type="submit" disabled={busy}>Simpan stok keluar</button></div>
      </form>
    </Panel>
  );
}

function Stats() {
  const { month } = useAppData();
  const { data: x, error } = useLoad(() => reportApi.production(month), [month]);
  return (
    <Panel title={`Ringkasan ${mLabel(month)}`}>
      {!x ? <Loading error={error} /> : (
        <>
          <div className="ln"><span>Green di-roast</span><span>{nf(x.roastIn)} kg</span></div>
          <div className="ln"><span>Hasil roasted</span><span>{nf(x.roastOut)} kg{x.roastIn ? ` · susut ${pct(1 - x.roastOut / x.roastIn)}` : ""}</span></div>
          <div className="ln"><span>Blend diracik</span><span>{nf(x.blendKg)} kg</span></div>
          <div className="ln"><span>Terjual lewat nota</span><span>{nf(x.kgSold)} kg</span></div>
          {x.usage.length > 0 && (
            <>
              <h3 className="mt-3.5">Stok keluar per kategori</h3>
              {x.usage.map((u) => (
                <div key={u.cat} className="bar-row">
                  <span>{u.cat}</span><span>{nf(u.kg)} kg · {short(u.val)}</span>
                  <div className="track"><i style={{ width: `${((u.kg / Math.max(1e-9, ...x.usage.map((z) => z.kg))) * 100).toFixed(1)}%` }} /></div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function Log() {
  const { month } = useAppData();
  const { data, error } = useLoad(() => ledgerApi.list({ month, types: ["roast", "blend", "usage", "adjust"] }), [month]);
  return (
    <Panel title="Log produksi & stok keluar">
      {data ? <EntryFeed entries={data} empty={`Belum ada catatan di ${mLabel(month)}.`} /> : <Loading error={error} />}
    </Panel>
  );
}
