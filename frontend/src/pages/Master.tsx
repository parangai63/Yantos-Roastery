// Port VIEWS.master: green bean, blend (+resep), kemasan, daftar harga, pengaturan.
// Data master tidak dihapus, hanya diarsipkan, supaya riwayat ledger tetap terbaca.

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { masterApi } from "../api";
import { useToast } from "../components/Toast";
import { ItemSelect, Loading, MoneyInput, Panel, Pill, Segmented } from "../components/ui";
import { useAppData } from "../context/AppData";
import type { Blend, Config, GreenBean, MasterData, Pack, Product } from "../types";
import { moneyStr, nf, num, parseMoney, pct, rp, rps, sizeLabel } from "../utils/format";
import { namer } from "../utils/ledger";

type Sub = "green" | "blend" | "pack" | "product" | "set";
type Kind = keyof MasterData;
const KIND: Record<Exclude<Sub, "set">, Kind> = { green: "greens", blend: "blends", pack: "packs", product: "products" };
const TITLE: Record<Exclude<Sub, "set">, string> = { green: "green bean", blend: "blend", pack: "kemasan", product: "harga produk" };
const LIST_TITLE: Record<Exclude<Sub, "set">, string> = { green: "green bean", blend: "blend", pack: "kemasan", product: "harga" };
type Item = GreenBean | Blend | Pack | Product;

export default function Master() {
  const { master } = useAppData();
  const [sub, setSub] = useState<Sub>("green");
  const [editId, setEditId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const changeSub = (s: Sub) => { setSub(s); setEditId(null); setQ(""); };
  const edit = (id: string) => { setEditId(id); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  if (!master) return <Loading />;
  if (sub === "set") {
    return (
      <div className="grid gap-3.5">
        <div className="subbar"><SubTabs value={sub} onChange={changeSub} /></div>
        <div className="work"><Panel title="Pengaturan"><Settings /></Panel></div>
      </div>
    );
  }
  const list = master[KIND[sub]] as Item[];
  const editing = editId ? list.find((x) => x.id === editId) : undefined;

  return (
    <div className="grid gap-3.5">
      <div className="subbar">
        <SubTabs value={sub} onChange={changeSub} />
        <input type="search" className="input max-w-[260px]" placeholder="Cari…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari" />
      </div>
      <div className="work">
        <div ref={formRef}>
          <Panel title={editing ? "Ubah: " + editing.name : "Tambah " + TITLE[sub]}>
            <MasterForm key={sub + (editId || "")} sub={sub} item={editing} onDone={() => setEditId(null)} />
          </Panel>
        </div>
        <Panel title={`Daftar ${LIST_TITLE[sub]} · ${list.length}`}>
          <MasterList sub={sub} list={list} q={q} onEdit={edit} />
        </Panel>
      </div>
    </div>
  );
}

function SubTabs({ value, onChange }: { value: Sub; onChange: (s: Sub) => void }) {
  return <Segmented value={value} onChange={onChange} items={[["green", "Green bean"], ["blend", "Blend"], ["pack", "Kemasan"], ["product", "Daftar harga"], ["set", "Pengaturan"]]} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function MasterForm({ sub, item, onDone }: { sub: Exclude<Sub, "set">; item?: Item; onDone: () => void }) {
  const { master, meta, names, productCost, changed } = useAppData();
  const toast = useToast();
  const x = (item || {}) as any;
  const [f, setF] = useState<Record<string, any>>(() => ({
    name: x.name || "", category: x.category || "Espresso", price: +x.price || 0, minKg: x.minKg || "", minRoastedKg: x.minRoastedKg || "",
    supplier: x.supplier || "", cogs: +x.cogs || 0, unit: x.unit || "pcs", minQty: x.minQty || "",
    kind: x.kind || "roasted", group: x.group || "Espresso", beanId: x.beanId || "", grams: x.grams || "", packId: x.packId || "",
  }));
  const [recipe, setRecipe] = useState<{ greenId: string; pct: string }[]>(() => (x.recipe || []).map((r: any) => ({ greenId: r.greenId, pct: String(r.pct) })));
  const [busy, setBusy] = useState(false);
  if (!master || !meta) return <Loading />;
  const n = namer(master);
  const set = (k: string) => (v: any) => setF((s) => ({ ...s, [k]: v }));
  const text = (k: string) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(k)(e.target.value) });

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    let body: Record<string, unknown>;
    if (sub === "green") body = { name: f.name, category: f.category, price: f.price, minKg: num(f.minKg), minRoastedKg: num(f.minRoastedKg), supplier: f.supplier };
    else if (sub === "blend") {
      const rs = recipe.map((r) => ({ greenId: r.greenId, pct: num(r.pct) })).filter((r) => r.greenId && r.pct > 0);
      const sum = rs.reduce((a, r) => a + r.pct, 0);
      if (rs.length && Math.abs(sum - 100) > 0.01) return toast(`Total resep ${nf(sum)}%, harus 100%.`, true);
      body = { name: f.name, cogs: f.cogs, minKg: num(f.minKg), recipe: rs };
    } else if (sub === "pack") body = { name: f.name, unit: f.unit || "pcs", price: f.price, minQty: num(f.minQty) };
    else {
      if (!f.beanId) return toast("Pilih beans.", true);
      if (!(num(f.grams) > 0)) return toast("Isi ukuran gram.", true);
      const beanName = f.kind === "blend" ? n.b(f.beanId) : n.g(f.beanId);
      body = { kind: f.kind, beanId: f.beanId, grams: num(f.grams), price: f.price, packId: f.packId, group: f.group, name: f.name.trim() || `${beanName} · ${sizeLabel(num(f.grams))}` };
    }
    if (!String(body.name || "").trim()) return toast("Isi nama dulu.", true);
    setBusy(true);
    try {
      await masterApi.save(KIND[sub], item?.id || null, body);
      toast(item ? "Perubahan tersimpan." : "Ditambahkan.");
      changed();
      onDone();
      if (!item) { setF((s) => ({ ...s, name: "", price: 0, cogs: 0, minKg: "", minRoastedKg: "", minQty: "", supplier: "", grams: "", beanId: "" })); setRecipe([]); }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  let fields: ReactNode;
  if (sub === "green") fields = (
    <>
      <Field label="Nama"><input className="input" {...text("name")} placeholder="Prau (120 Hours)" required /></Field>
      <div className="row">
        <Field label="Kategori"><select className="input" {...text("category")}><option>Espresso</option><option>Filter</option><option>Lainnya</option></select></Field>
        <Field label="Harga referensi /kg"><MoneyInput value={f.price} onChange={set("price")} /></Field>
      </div>
      <div className="row">
        <Field label="Reorder green (kg)"><input className="input" type="number" step="any" min="0" {...text("minKg")} /></Field>
        <Field label="Reorder roasted (kg)"><input className="input" type="number" step="any" min="0" {...text("minRoastedKg")} /></Field>
      </div>
      <Field label="Supplier utama">
        <input className="input" list="suppList" {...text("supplier")} />
        <datalist id="suppList">{names.suppliers.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
    </>
  );
  else if (sub === "blend") fields = (
    <>
      <Field label="Nama blend"><input className="input" {...text("name")} placeholder="Kirana Blend" required /></Field>
      <div className="row">
        <Field label="COGS referensi /kg"><MoneyInput value={f.cogs} onChange={set("cogs")} /></Field>
        <Field label="Reorder (kg)"><input className="input" type="number" step="any" min="0" {...text("minKg")} /></Field>
      </div>
      <div className="field">
        <span>Resep (% roasted, opsional)</span>
        <div className="lines-in">
          {recipe.map((r, i) => (
            <div className="line2" key={i}>
              <ItemSelect kind="green" value={r.greenId} onChange={(v) => setRecipe((rs) => rs.map((z, j) => (j === i ? { ...z, greenId: v } : z)))} placeholder="Roasted bean" ariaLabel="Bean" />
              <input className="input" type="number" min="0" max="100" step="any" placeholder="%" value={r.pct} onChange={(e) => setRecipe((rs) => rs.map((z, j) => (j === i ? { ...z, pct: e.target.value } : z)))} aria-label="Persen" />
              <button type="button" className="icon-btn" onClick={() => setRecipe((rs) => rs.filter((_, j) => j !== i))} aria-label="Hapus">×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm justify-self-start" onClick={() => setRecipe((rs) => [...rs, { greenId: "", pct: "" }])}>+ Komponen</button>
      </div>
    </>
  );
  else if (sub === "pack") fields = (
    <>
      <Field label="Nama"><input className="input" {...text("name")} placeholder="Pack Hologram 250 Gr" required /></Field>
      <div className="row">
        <Field label="Satuan"><input className="input" {...text("unit")} /></Field>
        <Field label="Harga /pcs"><MoneyInput value={f.price} onChange={set("price")} /></Field>
      </div>
      <Field label="Reorder (pcs)"><input className="input" type="number" step="1" min="0" {...text("minQty")} /></Field>
    </>
  );
  else {
    const p = { kind: f.kind, beanId: f.beanId, grams: num(f.grams), packId: f.packId };
    const hc = p.beanId && p.grams ? productCost(p) : 0;
    fields = (
      <>
        <div className="row">
          <Field label="Jenis">
            <select className="input" value={f.kind} onChange={(e) => setF((s) => ({ ...s, kind: e.target.value, beanId: "", group: e.target.value === "blend" ? "Blend" : s.group }))}>
              <option value="roasted">Single origin</option><option value="blend">Blend</option>
            </select>
          </Field>
          <Field label="Grup"><select className="input" {...text("group")}>{meta.groups.map((g) => <option key={g}>{g}</option>)}</select></Field>
        </div>
        <Field label="Beans"><ItemSelect key={f.kind} kind={f.kind === "blend" ? "blend" : "green"} value={f.beanId} onChange={set("beanId")} required /></Field>
        <div className="row">
          <Field label="Ukuran (gram)"><input className="input" type="number" step="any" min="1" {...text("grams")} required /></Field>
          <Field label="Harga jual (Rp)"><MoneyInput value={f.price} onChange={set("price")} required /></Field>
        </div>
        <Field label="Kemasan per pcs"><ItemSelect kind="pack" value={f.packId} onChange={set("packId")} placeholder="Tanpa kemasan" /></Field>
        <Field label="Nama produk (kosongkan untuk otomatis)"><input className="input" {...text("name")} placeholder="Otomatis: Beans · ukuran" /></Field>
        <div className="calc">
          {!p.beanId || !p.grams ? "HPP muncul setelah beans dan ukuran diisi." : (
            <div>HPP ≈ <b>{rp(hc)}</b>{f.price ? <> · margin <b>{rps(f.price - hc)}</b> ({pct((f.price - hc) / f.price)})</> : null}</div>
          )}
        </div>
      </>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      {fields}
      <div className="flex flex-wrap gap-2">
        <button className="btn" type="submit" disabled={busy}>Simpan</button>
        {item && <button className="btn btn-ghost" type="button" onClick={onDone}>Batal ubah</button>}
      </div>
    </form>
  );
}

function MasterList({ sub, list, q, onEdit }: { sub: Exclude<Sub, "set">; list: Item[]; q: string; onEdit: (id: string) => void }) {
  const { master, meta, productCost, changed } = useAppData();
  const toast = useToast();
  if (!master || !meta) return null;
  const n = namer(master);
  const G = meta.groups;
  const all = list
    .filter((x) => !q || (x.name || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a: any, b: any) =>
      Number(a.active === false) - Number(b.active === false) ||
      (sub === "product" ? G.indexOf(a.group) - G.indexOf(b.group) : 0) ||
      (a.name || "").localeCompare(b.name || "", "id") || (a.grams || 0) - (b.grams || 0));
  if (!all.length) return <p className="empty">{q ? "Tidak ada yang cocok." : "Belum ada data. Isi formulir di samping."}</p>;

  const detail = (x: any) =>
    sub === "green" ? [x.category, x.price ? rp(x.price) + "/kg" : "", x.minKg ? `reorder ${nf(x.minKg)} kg` : "", x.supplier].filter(Boolean).join(" · ")
    : sub === "blend" ? [x.cogs ? "COGS " + rp(x.cogs) + "/kg" : "", x.minKg ? `reorder ${nf(x.minKg)} kg` : "", (x.recipe || []).map((r: any) => `${n.g(r.greenId)} ${nf(r.pct)}%`).join(" + ")].filter(Boolean).join(" · ")
    : sub === "pack" ? [x.unit || "pcs", x.price ? rp(x.price) + "/pcs" : "harga belum diisi", x.minQty ? `reorder ${nf(x.minQty, 0)}` : ""].filter(Boolean).join(" · ")
    : `${x.group || ""} · ${rp(x.price)} · HPP ${rp(productCost(x))}${x.packId ? " · " + n.p(x.packId) : ""}`;

  const toggle = async (x: Item) => {
    try {
      await masterApi.setActive(KIND[sub], x.id, x.active === false);
      toast(x.active === false ? "Diaktifkan lagi." : "Diarsipkan. Riwayatnya tetap tersimpan.");
      changed();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  return (
    <div className="tw">
      <table className="tbl">
        <tbody>
          {all.map((x) => (
            <tr key={x.id} className={x.active === false ? "muted" : ""}>
              <td><b>{x.name}</b>{x.active === false && <> <Pill>Diarsipkan</Pill></>}<span className="sub">{detail(x)}</span></td>
              <td>
                <div className="actions">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(x.id)}>Ubah</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => toggle(x)}>{x.active === false ? "Aktifkan" : "Arsipkan"}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Settings() {
  const { config, meta } = useAppData();
  return config && meta ? <SettingsForm config={config} catsOut={meta.catsOut} /> : <Loading />;
}

function SettingsForm({ config, catsOut }: { config: Config; catsOut: string[] }) {
  const { changed } = useAppData();
  const toast = useToast();
  const [c, setC] = useState<Config>(config);
  const [shares, setShares] = useState(() => config.shares.map((s) => ({ label: s.label, pct: String(s.pct) })));
  const [routine, setRoutine] = useState(() => config.routine.map((r) => ({ label: r.label, amount: moneyStr(r.amount) })));
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await masterApi.saveConfig({
        ...c, bizName: c.bizName.trim() || "Roastery",
        shares: shares.map((s) => ({ label: s.label.trim(), pct: num(s.pct) })).filter((s) => s.label),
        routine: routine.map((r) => ({ label: r.label, amount: parseMoney(r.amount) })).filter((r) => r.amount > 0),
      });
      toast("Pengaturan tersimpan.");
      changed();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <Field label="Nama usaha"><input className="input" value={c.bizName} onChange={(e) => setC({ ...c, bizName: e.target.value })} /></Field>
      <div className="field">
        <span>Pembagian laba (% dari laba positif)</span>
        <div className="lines-in">
          {shares.map((s, i) => (
            <div className="line2" key={i}>
              <input className="input" value={s.label} placeholder="Nama penerima" aria-label="Penerima" onChange={(e) => setShares((l) => l.map((z, j) => (j === i ? { ...z, label: e.target.value } : z)))} />
              <input className="input" type="number" step="any" min="0" value={s.pct} placeholder="%" aria-label="Persen" onChange={(e) => setShares((l) => l.map((z, j) => (j === i ? { ...z, pct: e.target.value } : z)))} />
              <button type="button" className="icon-btn" onClick={() => setShares((l) => l.filter((_, j) => j !== i))} aria-label="Hapus">×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm justify-self-start" onClick={() => setShares((l) => [...l, { label: "", pct: "" }])}>+ Penerima</button>
      </div>
      <div className="row">
        <Field label="Saving minimum (Rp)"><MoneyInput value={c.savingMin} onChange={(v) => setC({ ...c, savingMin: v })} /></Field>
        <Field label="Saving % laba"><input className="input" type="number" step="any" min="0" value={c.savingPct} onChange={(e) => setC({ ...c, savingPct: num(e.target.value) })} /></Field>
      </div>
      <Field label="Cara hitung laba">
        <select className="input" value={c.basis} onChange={(e) => setC({ ...c, basis: e.target.value as Config["basis"] })}>
          <option value="kas">Pemasukan − pengeluaran (seperti Excel)</option>
          <option value="op">Tanpa modal masuk &amp; dividen keluar</option>
        </select>
      </Field>
      <div className="field">
        <span>Payment rutin</span>
        <div className="lines-in">
          {routine.map((r, i) => (
            <div className="line2" key={i}>
              <select className="input" value={r.label} aria-label="Kategori" onChange={(e) => setRoutine((l) => l.map((z, j) => (j === i ? { ...z, label: e.target.value } : z)))}>
                {catsOut.map((o) => <option key={o}>{o}</option>)}
              </select>
              <input className="input" inputMode="numeric" value={r.amount} placeholder="Rp" aria-label="Nominal" onChange={(e) => setRoutine((l) => l.map((z, j) => (j === i ? { ...z, amount: moneyStr(parseMoney(e.target.value)) } : z)))} />
              <button type="button" className="icon-btn" onClick={() => setRoutine((l) => l.filter((_, j) => j !== i))} aria-label="Hapus">×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm justify-self-start" onClick={() => setRoutine((l) => [...l, { label: catsOut[0], amount: "" }])}>+ Payment</button>
      </div>
      <div><button className="btn" type="submit" disabled={busy}>Simpan</button></div>
    </form>
  );
}
