import { randomUUID } from "crypto";
import prisma from "../prismaClient";
import { badRequest, notFound } from "../lib/httpError";
import { productData, toBlend, toConfig, toGreen, toPack, toProduct } from "../lib/mappers";
import type { Blend, Config, GreenBean, Pack, Product } from "../engine/types";

export type MasterKind = "greens" | "blends" | "packs" | "products";
const PREFIX: Record<MasterKind, string> = { greens: "g_", blends: "b_", packs: "p_", products: "pr_" };

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
  switch (kind) {
    case "greens": return !!(await prisma.greenBean.findUnique({ where: { id } }));
    case "blends": return !!(await prisma.blend.findUnique({ where: { id } }));
    case "packs": return !!(await prisma.pack.findUnique({ where: { id } }));
    case "products": return !!(await prisma.product.findUnique({ where: { id } }));
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

export async function saveGreen(id: string | null, b: Partial<GreenBean>) {
  const name = requireName(b);
  const data = {
    name, category: b.category || "", price: +(b.price ?? 0) || 0, minKg: +(b.minKg ?? 0) || 0,
    minRoastedKg: +(b.minRoastedKg ?? 0) || 0, supplier: b.supplier || "",
  };
  const row = id
    ? await prisma.greenBean.update({ where: { id }, data })
    : await prisma.greenBean.create({ data: { id: await uniqueId("greens", name), ...data } });
  return toGreen(row);
}

export async function saveBlend(id: string | null, b: Partial<Blend>) {
  const name = requireName(b);
  const recipe = (b.recipe || []).filter((r) => r.greenId && +r.pct > 0);
  const sum = recipe.reduce((a, r) => a + +r.pct, 0);
  if (recipe.length && Math.abs(sum - 100) > 0.01) throw badRequest(`Total resep ${sum}%, harus 100%.`);
  const data = { name, cogs: +(b.cogs ?? 0) || 0, minKg: +(b.minKg ?? 0) || 0 };
  const blendId = id || (await uniqueId("blends", name));
  const row = await prisma.$transaction(async (tx) => {
    if (id) {
      await tx.blend.update({ where: { id }, data });
      await tx.blendRecipeItem.deleteMany({ where: { blendId: id } });
    } else await tx.blend.create({ data: { id: blendId, ...data } });
    await tx.blendRecipeItem.createMany({ data: recipe.map((r) => ({ blendId, greenId: r.greenId, pct: +r.pct })) });
    return tx.blend.findUniqueOrThrow({ where: { id: blendId }, include: { recipe: true } });
  });
  return toBlend(row);
}

export async function savePack(id: string | null, b: Partial<Pack>) {
  const name = requireName(b);
  const data = { name, unit: b.unit || "pcs", price: +(b.price ?? 0) || 0, minQty: Math.round(+(b.minQty ?? 0) || 0) };
  const row = id
    ? await prisma.pack.update({ where: { id }, data })
    : await prisma.pack.create({ data: { id: await uniqueId("packs", name), ...data } });
  return toPack(row);
}

export async function saveProduct(id: string | null, b: Partial<Product>) {
  const name = requireName(b);
  if (b.kind !== "roasted" && b.kind !== "blend") throw badRequest("Jenis produk harus roasted atau blend.");
  if (!b.beanId) throw badRequest("Pilih bean atau blend.");
  if (!(+(b.grams ?? 0) > 0)) throw badRequest("Isi berat kemasan (gram).");
  const data = productData({ ...(b as Product), name, active: true });
  const row = id
    ? await prisma.product.update({ where: { id }, data: { ...data, active: undefined } })
    : await prisma.product.create({ data: { id: await uniqueId("products", name), ...data } });
  return toProduct(row);
}

// Arsipkan/aktifkan lagi. Data master tidak dihapus supaya riwayat ledger tetap terbaca.
export async function setActive(kind: MasterKind, id: string, active: boolean) {
  if (!(await exists(kind, id))) throw notFound("Data tidak ditemukan.");
  const where = { where: { id }, data: { active } };
  switch (kind) {
    case "greens": return toGreen(await prisma.greenBean.update(where));
    case "blends": return toBlend(await prisma.blend.update({ ...where, include: { recipe: true } }));
    case "packs": return toPack(await prisma.pack.update(where));
    case "products": return toProduct(await prisma.product.update(where));
  }
}

export async function getConfig() {
  return toConfig(await prisma.config.findUnique({ where: { id: "main" } }));
}

export async function saveConfig(b: Partial<Config>) {
  const shares = (b.shares || []).filter((s) => s.label).map((s) => ({ label: String(s.label), pct: +s.pct || 0 }));
  const routine = (b.routine || []).filter((r) => r.label).map((r) => ({ label: String(r.label), amount: +r.amount || 0 }));
  const data = {
    bizName: String(b.bizName || "Roastery"), basis: b.basis === "op" ? "op" : "kas",
    savingPct: +(b.savingPct ?? 0) || 0, savingMin: +(b.savingMin ?? 0) || 0, shares, routine,
  };
  return toConfig(await prisma.config.upsert({ where: { id: "main" }, create: { id: "main", ...data }, update: data }));
}
