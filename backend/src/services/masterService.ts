import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../prismaClient";
import { badRequest, conflict, notFound } from "../lib/httpError";
import { productData, toBlend, toConfig, toGreen, toPack, toProduct } from "../lib/mappers";
import { type Actor, diff, fmtNum, logActivity } from "../lib/activity";
import type { Blend, Config, GreenBean, Pack, Product } from "../engine/types";

export type MasterKind = "greens" | "blends" | "packs" | "products";
const PREFIX: Record<MasterKind, string> = { greens: "g_", blends: "b_", packs: "p_", products: "pr_" };
/** Sebutan di riwayat aktivitas. */
export const KIND_LABEL: Record<MasterKind, string> = { greens: "green bean", blends: "blend", packs: "kemasan", products: "produk" };

export const isMasterKind = (k: string): k is MasterKind => k in PREFIX;

// id baru mengikuti pola lama: prefix + slug nama (g_gayo-bener-meriah).
function newId(kind: MasterKind, name: string) {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return PREFIX[kind] + (slug || randomUUID().slice(0, 8));
}

async function uniqueId(kind: MasterKind, name: string) {
  const base = newId(kind, name);
  for (let i = 0; ; i++) {
    const id = i ? `${base}-${i + 1}` : base;
    if (!(await exists(kind, id))) return id;
  }
}

async function exists(kind: MasterKind, id: string) {
  return !!(await findOne(kind, id));
}

/** Satu item master dalam bentuk engine, atau null. */
async function findOne(kind: MasterKind, id: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  switch (kind) {
    case "greens": { const r = await db.greenBean.findUnique({ where: { id } }); return r && toGreen(r); }
    case "blends": { const r = await db.blend.findUnique({ where: { id }, include: { recipe: true } }); return r && toBlend(r); }
    case "packs": { const r = await db.pack.findUnique({ where: { id } }); return r && toPack(r); }
    case "products": { const r = await db.product.findUnique({ where: { id } }); return r && toProduct(r); }
  }
}

export async function listMaster() {
  const [greens, blends, packs, products] = await Promise.all([
    prisma.greenBean.findMany({ orderBy: { name: "asc" } }),
    prisma.blend.findMany({ include: { recipe: true }, orderBy: { name: "asc" } }),
    prisma.pack.findMany({ orderBy: { name: "asc" } }),
    prisma.product.findMany({ orderBy: [{ name: "asc" }, { grams: "asc" }] }),
  ]);
  return {
    greens: greens.map(toGreen), blends: blends.map(toBlend), packs: packs.map(toPack), products: products.map(toProduct),
  };
}

const requireName = (b: { name?: string }) => {
  const name = String(b.name || "").trim();
  if (!name) throw badRequest("Nama wajib diisi.");
  return name;
};

// ---------- riwayat aktivitas ----------

const LABELS: Record<MasterKind, Record<string, string>> = {
  greens: { name: "Nama", category: "Kategori", price: "Harga/kg", minKg: "Min. green (kg)", minRoastedKg: "Min. roasted (kg)", supplier: "Supplier" },
  blends: { name: "Nama", cogs: "COGS/kg", minKg: "Min. stok (kg)", recipe: "Resep" },
  packs: { name: "Nama", unit: "Satuan", price: "Harga", minQty: "Min. stok" },
  products: { name: "Nama", kind: "Jenis", beanId: "Bean/blend", grams: "Gram", price: "Harga jual", group: "Grup", packId: "Kemasan" },
};

/** Nama green/blend/kemasan per id, supaya riwayat menampilkan nama, bukan id. */
async function nameLookup(db: Prisma.TransactionClient | typeof prisma) {
  const [g, b, p] = await Promise.all([
    db.greenBean.findMany({ select: { id: true, name: true } }),
    db.blend.findMany({ select: { id: true, name: true } }),
    db.pack.findMany({ select: { id: true, name: true } }),
  ]);
  const m = new Map<string, string>();
  for (const r of [...g, ...b, ...p]) m.set(r.id, r.name);
  return (id: unknown) => (id ? m.get(String(id)) ?? String(id) : "");
}

/** Bentuk item yang mudah dibaca untuk dibandingkan (resep & id → teks). */
async function readable(kind: MasterKind, obj: object | null, db: Prisma.TransactionClient | typeof prisma): Promise<Record<string, unknown>> {
  if (!obj) return {};
  const item = obj as Record<string, unknown>;
  if (kind !== "blends" && kind !== "products") return item;
  const name = await nameLookup(db);
  if (kind === "blends") {
    const recipe = (item.recipe as Blend["recipe"]) || [];
    return { ...item, recipe: recipe.map((r) => `${name(r.greenId)} ${fmtNum(r.pct)}%`).join(" + ") || "-" };
  }
  return { ...item, kind: item.kind === "blend" ? "Blend" : "Roasted", beanId: name(item.beanId), packId: name(item.packId) || "-" };
}

async function logSave(
  tx: Prisma.TransactionClient, actor: Actor, kind: MasterKind,
  before: object | null, after: { id: string; name: string },
) {
  const changes = before ? diff(await readable(kind, before, tx), await readable(kind, after, tx), LABELS[kind]) : null;
  if (changes && !Object.keys(changes).length) return; // disimpan tanpa perubahan apa pun
  await logActivity(tx, actor, {
    action: before ? "update" : "create", entity: kind, entityId: after.id, changes,
    summary: `${before ? "Mengubah" : "Menambah"} ${KIND_LABEL[kind]} "${after.name}"`,
  });
}

// ---------- simpan ----------

export async function saveGreen(actor: Actor, id: string | null, b: Partial<GreenBean>) {
  const name = requireName(b);
  const data = {
    name, category: b.category || "", price: +(b.price ?? 0) || 0, minKg: +(b.minKg ?? 0) || 0,
    minRoastedKg: +(b.minRoastedKg ?? 0) || 0, supplier: b.supplier || "",
  };
  const newIdValue = id ? null : await uniqueId("greens", name);
  return prisma.$transaction(async (tx) => {
    const before = id ? await findOne("greens", id, tx) : null;
    if (id && !before) throw notFound("Data tidak ditemukan.");
    const row = toGreen(id
      ? await tx.greenBean.update({ where: { id }, data })
      : await tx.greenBean.create({ data: { id: newIdValue!, ...data } }));
    await logSave(tx, actor, "greens", before, row);
    return row;
  });
}

export async function saveBlend(actor: Actor, id: string | null, b: Partial<Blend>) {
  const name = requireName(b);
  const recipe = (b.recipe || []).filter((r) => r.greenId && +r.pct > 0);
  const sum = recipe.reduce((a, r) => a + +r.pct, 0);
  if (recipe.length && Math.abs(sum - 100) > 0.01) throw badRequest(`Total resep ${sum}%, harus 100%.`);
  const data = { name, cogs: +(b.cogs ?? 0) || 0, minKg: +(b.minKg ?? 0) || 0 };
  const blendId = id || (await uniqueId("blends", name));
  return prisma.$transaction(async (tx) => {
    const before = id ? await findOne("blends", id, tx) : null;
    if (id && !before) throw notFound("Data tidak ditemukan.");
    if (id) {
      await tx.blend.update({ where: { id }, data });
      await tx.blendRecipeItem.deleteMany({ where: { blendId: id } });
    } else await tx.blend.create({ data: { id: blendId, ...data } });
    await tx.blendRecipeItem.createMany({ data: recipe.map((r) => ({ blendId, greenId: r.greenId, pct: +r.pct })) });
    const row = toBlend(await tx.blend.findUniqueOrThrow({ where: { id: blendId }, include: { recipe: true } }));
    await logSave(tx, actor, "blends", before, row);
    return row;
  });
}

export async function savePack(actor: Actor, id: string | null, b: Partial<Pack>) {
  const name = requireName(b);
  const data = { name, unit: b.unit || "pcs", price: +(b.price ?? 0) || 0, minQty: Math.round(+(b.minQty ?? 0) || 0) };
  const newIdValue = id ? null : await uniqueId("packs", name);
  return prisma.$transaction(async (tx) => {
    const before = id ? await findOne("packs", id, tx) : null;
    if (id && !before) throw notFound("Data tidak ditemukan.");
    const row = toPack(id
      ? await tx.pack.update({ where: { id }, data })
      : await tx.pack.create({ data: { id: newIdValue!, ...data } }));
    await logSave(tx, actor, "packs", before, row);
    return row;
  });
}

export async function saveProduct(actor: Actor, id: string | null, b: Partial<Product>) {
  const name = requireName(b);
  if (b.kind !== "roasted" && b.kind !== "blend") throw badRequest("Jenis produk harus roasted atau blend.");
  if (!b.beanId) throw badRequest("Pilih bean atau blend.");
  if (!(+(b.grams ?? 0) > 0)) throw badRequest("Isi berat kemasan (gram).");
  const data = productData({ ...(b as Product), name, active: true });
  const newIdValue = id ? null : await uniqueId("products", name);
  return prisma.$transaction(async (tx) => {
    const before = id ? await findOne("products", id, tx) : null;
    if (id && !before) throw notFound("Data tidak ditemukan.");
    const row = toProduct(id
      ? await tx.product.update({ where: { id }, data: { ...data, active: undefined } })
      : await tx.product.create({ data: { id: newIdValue!, ...data } }));
    await logSave(tx, actor, "products", before, row);
    return row;
  });
}

// Arsipkan/aktifkan lagi. Data master tidak dihapus supaya riwayat ledger tetap terbaca.
export async function setActive(actor: Actor, kind: MasterKind, id: string, active: boolean) {
  const before = await findOne(kind, id);
  if (!before) throw notFound("Data tidak ditemukan.");
  return prisma.$transaction(async (tx) => {
    const where = { where: { id }, data: { active } };
    let row;
    switch (kind) {
      case "greens": row = toGreen(await tx.greenBean.update(where)); break;
      case "blends": row = toBlend(await tx.blend.update({ ...where, include: { recipe: true } })); break;
      case "packs": row = toPack(await tx.pack.update(where)); break;
      case "products": row = toProduct(await tx.product.update(where)); break;
    }
    if (before.active !== active) {
      await logActivity(tx, actor, {
        action: active ? "restore" : "archive", entity: kind, entityId: id,
        summary: `${active ? "Mengaktifkan lagi" : "Mengarsipkan"} ${KIND_LABEL[kind]} "${before.name}"`,
      });
    }
    return row;
  });
}

// Di mana saja item master dipakai. Ledger dibaca utuh (jumlahnya kecil) karena
// referensinya ada di dalam kolom JSON `data` dengan nama field berbeda per jenis.
async function usage(kind: MasterKind, id: string) {
  const rows = await prisma.ledgerEntry.findMany({ where: { deleted: false }, select: { type: true, data: true } });
  const targets: Record<MasterKind, string[]> = { greens: ["green", "roasted"], blends: ["blend"], packs: ["pack"], products: [] };
  let ledger = 0;
  for (const r of rows) {
    const d = (r.data || {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const items: Record<string, any>[] = Array.isArray(d.items) ? d.items : []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const parts: Record<string, any>[] = Array.isArray(d.parts) ? d.parts : []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const hit =
      (targets[kind].includes(d.target) && d.itemId === id) ||
      (kind === "greens" && (d.greenId === id || parts.some((p) => p.greenId === id) || items.some((i) => i.kind === "roasted" && i.beanId === id))) ||
      (kind === "blends" && (d.blendId === id || items.some((i) => i.kind === "blend" && i.beanId === id))) ||
      (kind === "packs" && (d.packId === id || items.some((i) => i.packId === id))) ||
      (kind === "products" && items.some((i) => i.productId === id));
    if (hit) ledger++;
  }
  const [recipes, products] = await Promise.all([
    kind === "greens" ? prisma.blendRecipeItem.count({ where: { greenId: id } }) : 0,
    kind === "greens" ? prisma.product.count({ where: { greenId: id } })
      : kind === "blends" ? prisma.product.count({ where: { blendId: id } })
      : kind === "packs" ? prisma.product.count({ where: { packId: id } }) : 0,
  ]);
  return { ledger, recipes, products };
}

// Hapus permanen hanya untuk item yang belum pernah dipakai (mis. salah input).
// Yang sudah punya riwayat harus diarsipkan supaya stok & laporan lama tetap benar.
export async function removeMaster(actor: Actor, kind: MasterKind, id: string) {
  const before = await findOne(kind, id);
  if (!before) throw notFound("Data tidak ditemukan.");
  const u = await usage(kind, id);
  const why = [
    u.ledger && `${u.ledger} transaksi`,
    u.recipes && `${u.recipes} resep blend`,
    u.products && `${u.products} produk di daftar harga`,
  ].filter(Boolean);
  if (why.length) throw conflict(`Tidak bisa dihapus karena masih dipakai di ${why.join(", ")}. Arsipkan saja.`);
  await prisma.$transaction(async (tx) => {
    switch (kind) {
      case "greens": await tx.greenBean.delete({ where: { id } }); break;
      case "blends": await tx.blend.delete({ where: { id } }); break; // resep ikut terhapus (onDelete: Cascade)
      case "packs": await tx.pack.delete({ where: { id } }); break;
      case "products": await tx.product.delete({ where: { id } }); break;
    }
    await logActivity(tx, actor, { action: "delete", entity: kind, entityId: id, summary: `Menghapus ${KIND_LABEL[kind]} "${before.name}"` });
  });
}

export async function getConfig() {
  return toConfig(await prisma.config.findUnique({ where: { id: "main" } }));
}

const CONFIG_LABELS = {
  bizName: "Nama usaha", basis: "Basis laporan", savingPct: "Tabungan (%)", savingMin: "Tabungan minimum",
  shares: "Pembagian laba", routine: "Pembayaran rutin",
};
const readableConfig = (c: Config) => ({
  ...c,
  basis: c.basis === "op" ? "Operasional" : "Kas",
  shares: c.shares.map((s) => `${s.label} ${fmtNum(s.pct)}%`).join(", ") || "-",
  routine: c.routine.map((r) => `${r.label} ${fmtNum(r.amount)}`).join(", ") || "-",
});

export async function saveConfig(actor: Actor, b: Partial<Config>) {
  const shares = (b.shares || []).filter((s) => s.label).map((s) => ({ label: String(s.label), pct: +s.pct || 0 }));
  const routine = (b.routine || []).filter((r) => r.label).map((r) => ({ label: String(r.label), amount: +r.amount || 0 }));
  const data = {
    bizName: String(b.bizName || "Roastery"), basis: b.basis === "op" ? "op" : "kas",
    savingPct: +(b.savingPct ?? 0) || 0, savingMin: +(b.savingMin ?? 0) || 0, shares, routine,
  };
  return prisma.$transaction(async (tx) => {
    const before = toConfig(await tx.config.findUnique({ where: { id: "main" } }));
    const after = toConfig(await tx.config.upsert({ where: { id: "main" }, create: { id: "main", ...data }, update: data }));
    const changes = diff(readableConfig(before), readableConfig(after), CONFIG_LABELS);
    if (Object.keys(changes).length) {
      await logActivity(tx, actor, { action: "update", entity: "config", entityId: "main", summary: "Mengubah pengaturan", changes });
    }
    return after;
  });
}
