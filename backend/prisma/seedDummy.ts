// Mengisi database dengan data DUMMY (Agu–Okt 2026) dari 02_seed_dummy.sql.
// File SQL itu ditulis untuk skema relasional lain (items, sales,
// stock_movements, cash_transactions, ...); skrip ini memetakannya ke model
// aplikasi (master + LedgerEntry) dan membiarkan engine menghitung ulang stok/HPP.
//
//   npx ts-node --transpile-only prisma/seedDummy.ts <file.sql>           cek saja
//   npx ts-node --transpile-only prisma/seedDummy.ts <file.sql> --write   kosongkan DB lalu isi
//
// Kembali ke data asli: npm run db:seed.
//
// Catatan pemetaan:
// - Kas yang terkait sale_id / purchase_id tidak dibuat sebagai entri kas,
//   karena engine sudah mencatat kas dari penjualan & pembelian yang lunas.
// - settings.opening_cash dicatat sebagai kas masuk "Modal/Setoran Pemilik"
//   sehari sebelum opening_date (engine tidak punya saldo kas awal).
// - Urutan dalam satu tanggal mengikuti id stock_movements (lewat kolom at),
//   supaya rata-rata tertimbang dihitung dengan urutan yang sama.
// - Produk paket B2B memakai packaging_qty > 1, sedangkan engine memotong
//   1 kemasan per unit produk; selisihnya dilaporkan di bagian cek.

import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { compute } from "../src/engine/compute";
import { entryData, productData } from "../src/lib/mappers";
import type { Blend, Config, GreenBean, LedgerEntry, Master, Pack, Product, StockKind } from "../src/engine/types";

type Val = string | number | boolean | null;
type Row = Record<string, Val>;

// ---------- parser INSERT sederhana ----------
function parseInserts(sql: string): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  const re = /insert into (\w+) \(([^)]*)\) values/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1];
    const cols = m[2].split(",").map((c) => c.trim());
    let i = re.lastIndex;
    const rows = (out[table] ||= []);
    for (;;) {
      while (/\s|,/.test(sql[i])) i++;
      if (sql[i] === ";") break;
      if (sql[i] !== "(") throw new Error(`Format tak dikenal di ${table} posisi ${i}`);
      i++;
      const vals: Val[] = [];
      for (;;) {
        while (sql[i] === " ") i++;
        if (sql[i] === "'") {
          let s = "";
          i++;
          for (;;) {
            if (sql[i] === "'" && sql[i + 1] === "'") { s += "'"; i += 2; }
            else if (sql[i] === "'") { i++; break; }
            else s += sql[i++];
          }
          vals.push(s);
        } else {
          const tok = /^[^,)]+/.exec(sql.slice(i))![0].trim();
          i += /^[^,)]+/.exec(sql.slice(i))![0].length;
          vals.push(tok === "null" ? null : tok === "true" ? true : tok === "false" ? false : Number(tok));
        }
        while (sql[i] === " ") i++;
        if (sql[i] === ",") { i++; continue; }
        if (sql[i] === ")") { i++; break; }
        throw new Error(`Tuple rusak di ${table} posisi ${i}`);
      }
      rows.push(Object.fromEntries(cols.map((c, k) => [c, vals[k]])));
    }
    re.lastIndex = i;
  }
  return out;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const n = (v: Val) => Number(v) || 0;
const s = (v: Val) => (v == null ? "" : String(v));

function build(T: Record<string, Row[]>) {
  const by = (t: string) => Object.fromEntries((T[t] || []).map((r) => [r.id as number, r]));
  const suppliers = by("suppliers"), customers = by("customers"), cats = by("cash_categories");
  const useCats = by("usage_categories"), items = by("items"), products = by("products");

  // ----- master -----
  const itemId: Record<number, string> = {};
  const kindOf: Record<number, "green_bean" | "blend" | "packaging"> = {};
  for (const it of T.items) {
    const id = it.id as number;
    kindOf[id] = it.kind as never;
    itemId[id] = (it.kind === "green_bean" ? "g_" : it.kind === "blend" ? "b_" : "p_") + slug(s(it.name));
  }
  const greens: Record<string, GreenBean> = {}, blends: Record<string, Blend> = {}, packs: Record<string, Pack> = {};
  for (const it of T.items) {
    const id = itemId[it.id as number];
    if (it.kind === "green_bean")
      greens[id] = {
        id, name: s(it.name), category: s(it.category), price: n(it.ref_price), minKg: n(it.reorder_qty),
        minRoastedKg: n(it.reorder_roasted_kg), supplier: s(suppliers[it.default_supplier_id as number]?.name), active: true,
      };
    else if (it.kind === "blend")
      blends[id] = { id, name: s(it.name), cogs: n(it.ref_price), minKg: n(it.reorder_qty), recipe: [], active: true };
    else packs[id] = { id, name: s(it.name), unit: s(it.unit) || "pcs", price: n(it.ref_price), minQty: n(it.reorder_qty), active: true };
  }
  for (const r of T.blend_recipes) blends[itemId[r.blend_id as number]].recipe.push({ greenId: itemId[r.green_bean_id as number], pct: n(r.pct) });

  const prodId: Record<number, string> = {};
  const prods: Record<string, Product> = {};
  for (const p of T.products) {
    const bean = p.bean_item_id as number;
    const id = `pr_${slug(s(items[bean].name))}-${n(p.grams)}`;
    prodId[p.id as number] = id;
    prods[id] = {
      id, name: s(p.name), kind: kindOf[bean] === "blend" ? "blend" : "roasted", beanId: itemId[bean], grams: n(p.grams),
      price: n(p.price), group: s(p.product_group), packId: p.packaging_item_id ? itemId[p.packaging_item_id as number] : "", active: true,
    };
  }

  const st = T.settings[0];
  const config: Config = {
    bizName: s(st.business_name), basis: st.profit_basis === "operasional" ? "op" : "kas",
    savingPct: n(st.saving_pct), savingMin: n(st.saving_min),
    shares: T.profit_shares.map((x) => ({ label: s(x.label), pct: n(x.pct) })),
    routine: T.routine_payments.map((x) => ({ label: s(x.label), amount: n(x.amount) })),
  };
  const master: Master = { greens, blends, packs, products: prods, config };

  // ----- urutan: id stock_movements terkecil per kejadian -----
  const rank: Record<string, number> = {};
  const refs = ["purchase_id", "roast_batch_id", "blend_batch_id", "sale_id", "usage_id", "adjustment_id"];
  for (const mv of T.stock_movements) {
    const key = mv.movement === "opening" ? `opening:${mv.id}` : refs.map((r) => (mv[r] != null ? `${r}:${mv[r]}` : "")).join("");
    if (rank[key] == null) rank[key] = mv.id as number;
  }
  const at = (date: string, r: number) => new Date(Date.parse(date + "T00:00:00Z") + r * 1000).toISOString();
  const base = (id: string, date: Val, r: number) => ({ id, date: s(date), at: at(s(date), r), by: "dummy" });
  const target = (t: Val): StockKind => (t === "packaging" ? "pack" : (t as StockKind));
  const E: LedgerEntry[] = [];

  for (const mv of T.stock_movements.filter((x) => x.movement === "opening"))
    E.push({ ...base(`dm-open-${mv.id}`, mv.date, mv.id as number), type: "opening", target: target(mv.stock_type), itemId: itemId[mv.item_id as number], qty: n(mv.qty), value: n(mv.value), note: s(mv.note) });

  for (const p of T.purchases) {
    const it = p.item_id as number;
    const common = {
      ...base(`dm-buy-${p.id}`, p.date, rank[`purchase_id:${p.id}`]), total: n(p.total), supplier: s(suppliers[p.supplier_id as number]?.name),
      paid: !!p.is_paid, ...(p.paid_date ? { paidDate: s(p.paid_date) } : {}), note: s(p.note),
    };
    E.push(kindOf[it] === "packaging"
      ? { ...common, type: "pack_in", packId: itemId[it], qty: n(p.qty) }
      : { ...common, type: "green_in", greenId: itemId[it], kg: n(p.qty) });
  }

  for (const r of T.roast_batches)
    E.push({ ...base(`dm-roast-${r.id}`, r.date, rank[`roast_batch_id:${r.id}`]), type: "roast", greenId: itemId[r.green_bean_id as number], inKg: n(r.input_kg), outKg: n(r.output_kg), batch: s(r.batch_code), note: s(r.profile) });

  for (const b of T.blend_batches)
    E.push({
      ...base(`dm-blend-${b.id}`, b.date, rank[`blend_batch_id:${b.id}`]), type: "blend", blendId: itemId[b.blend_id as number], note: s(b.note),
      parts: T.blend_batch_items.filter((x) => x.blend_batch_id === b.id).map((x) => ({ greenId: itemId[x.green_bean_id as number], kg: n(x.kg) })),
    });

  for (const sl of T.sales) {
    const items = T.sale_items.filter((x) => x.sale_id === sl.id).map((x) => {
      const p = prods[prodId[x.product_id as number]];
      return { productId: p.id, name: p.name, kind: p.kind, beanId: p.beanId, grams: p.grams, packId: p.packId, qty: n(x.qty), price: n(x.unit_price) };
    });
    E.push({
      ...base(`dm-sale-${sl.id}`, sl.date, rank[`sale_id:${sl.id}`]), type: "sale",
      customer: s(customers[sl.customer_id as number]?.name) || undefined, channel: s(sl.channel), method: s(sl.payment_method),
      items, subtotal: n(sl.subtotal), discount: n(sl.discount), shipping: n(sl.shipping),
      total: n(sl.subtotal) - n(sl.discount) + n(sl.shipping), paid: !!sl.is_paid,
      ...(sl.paid_date ? { paidDate: s(sl.paid_date) } : {}), ...(sl.due_date ? { due: s(sl.due_date) } : {}), note: s(sl.note),
    });
  }

  for (const u of T.stock_usages)
    E.push({
      ...base(`dm-use-${u.id}`, u.date, rank[`usage_id:${u.id}`]), type: "usage", target: target(u.stock_type), itemId: itemId[u.item_id as number],
      kg: n(u.qty), category: s(useCats[u.usage_category_id as number]?.name), note: s(u.note),
      ...(u.packaging_item_id ? { packId: itemId[u.packaging_item_id as number], packQty: n(u.packaging_qty) } : {}),
    });

  for (const a of T.stock_adjustments)
    E.push({ ...base(`dm-adj-${a.id}`, a.date, rank[`adjustment_id:${a.id}`]), type: "adjust", target: target(a.stock_type), itemId: itemId[a.item_id as number], delta: n(a.actual_qty) - n(a.system_qty), note: s(a.note) });

  for (const c of T.cash_transactions.filter((x) => x.sale_id == null && x.purchase_id == null))
    E.push({ ...base(`dm-kas-${c.id}`, c.date, 1000 + (c.id as number)), type: "kas", dir: c.direction === "in" ? "in" : "out", category: s(cats[c.category_id as number]?.name), desc: s(c.description), amount: n(c.amount) });

  if (n(st.opening_cash)) {
    const d = new Date(Date.parse(s(st.opening_date) + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
    E.push({ ...base("dm-kas-saldo-awal", d, 0), type: "kas", dir: "in", category: "Modal/Setoran Pemilik", desc: "Saldo awal kas (dummy)", amount: n(st.opening_cash) });
  }

  return { master, entries: E, itemId };
}

// ---------- cek: bandingkan hasil engine dengan buku stok & kas di SQL ----------
function check(T: Record<string, Row[]>, master: Master, entries: LedgerEntry[], itemId: Record<number, string>) {
  const C = compute(master, entries);
  const exp: Record<string, { qty: number; val: number }> = {};
  for (const mv of T.stock_movements) {
    const k = `${mv.stock_type === "packaging" ? "pack" : mv.stock_type}:${itemId[mv.item_id as number]}`;
    const e = (exp[k] ||= { qty: 0, val: 0 });
    e.qty += n(mv.qty);
    e.val += n(mv.value);
  }
  let worst = 0;
  const diffs: string[] = [];
  const invExp: Record<string, number> = { green: 0, roasted: 0, blend: 0, pack: 0 };
  for (const [k, e] of Object.entries(exp)) {
    const [t, id] = k.split(":") as [StockKind, string];
    invExp[t] += Math.max(0, e.val);
    const got = C.st[t][id] || { qty: 0, val: 0 };
    const dq = got.qty - e.qty;
    if (Math.abs(dq) > 1e-6) diffs.push(`  ${k}: qty app ${got.qty.toFixed(3)} vs SQL ${e.qty.toFixed(3)}`);
    worst = Math.max(worst, Math.abs(got.val - e.val));
  }
  const kas = T.cash_transactions.reduce((a, c) => a + (c.direction === "in" ? 1 : -1) * n(c.amount), n(T.settings[0].opening_cash));
  const rp = (x: number) => "Rp " + Math.round(x).toLocaleString("id-ID");
  console.log(`Entri ledger: ${entries.length}`);
  console.log(`Saldo kas   : app ${rp(C.bal)} · SQL ${rp(kas)}`);
  for (const t of ["green", "roasted", "blend", "pack"] as StockKind[]) console.log(`Nilai ${t.padEnd(7)}: app ${rp(C.inv[t])} · SQL ${rp(invExp[t])}`);
  console.log(`Selisih nilai stok terbesar per item: ${rp(worst)}`);
  console.log(diffs.length ? `Qty berbeda:\n${diffs.join("\n")}` : "Qty stok semua item sama.");
  console.log(`Piutang: ${C.recv.length} nota · Hutang: ${C.pay.length} pembelian`);
  for (const m of Object.keys(C.M).sort()) {
    const x = C.M[m];
    console.log(`  ${m}: masuk ${rp(x.cin)} · keluar ${rp(x.cout)} · laba ${rp(x.cin - x.cout)}`);
  }
}

async function write(master: Master, entries: LedgerEntry[]) {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.ledgerEntry.deleteMany();
        await tx.product.deleteMany();
        await tx.blendRecipeItem.deleteMany();
        await tx.blend.deleteMany();
        await tx.pack.deleteMany();
        await tx.greenBean.deleteMany();
        await tx.config.deleteMany();

        const c = master.config;
        await tx.config.create({ data: { id: "main", bizName: c.bizName, basis: c.basis, savingPct: c.savingPct, savingMin: c.savingMin, shares: c.shares as never, routine: c.routine as never } });
        await tx.greenBean.createMany({ data: Object.values(master.greens) });
        await tx.pack.createMany({ data: Object.values(master.packs) });
        for (const b of Object.values(master.blends))
          await tx.blend.create({ data: { id: b.id, name: b.name, cogs: b.cogs, minKg: b.minKg, active: b.active, recipe: { create: b.recipe } } });
        await tx.product.createMany({ data: Object.values(master.products).map((p) => ({ id: p.id, ...productData(p) })) });
        await tx.ledgerEntry.createMany({
          data: entries.map((e) => ({ id: e.id, type: e.type, date: e.date, at: new Date(e.at), by: e.by, data: entryData(e as unknown as Record<string, unknown>) })),
        });
      },
      { timeout: 120000 },
    );
    console.log("Database terisi data dummy.");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Pakai: seedDummy.ts <02_seed_dummy.sql> [--write]");
  const T = parseInserts(fs.readFileSync(file, "utf8"));
  const { master, entries, itemId } = build(T);
  check(T, master, entries, itemId);
  if (process.argv.includes("--write")) await write(master, entries);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
