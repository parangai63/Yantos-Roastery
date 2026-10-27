// Mengisi database dari ekspor artifact di folder data/.
// Aman dijalankan ulang: semua tabel dikosongkan dulu.
//
//   npm run db:seed                 (pakai ../data)
//   DATA_DIR=/path/ke/data npm run db:seed

import { PrismaClient } from "@prisma/client";
import { DEFAULT_DATA_DIR, loadLegacyExport } from "../src/lib/legacyExport";
import { entryData, productData } from "../src/lib/mappers";

const prisma = new PrismaClient();

async function main() {
  const dir = process.env.DATA_DIR || DEFAULT_DATA_DIR;
  const { master, entries } = loadLegacyExport(dir);

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
      await tx.config.create({
        data: { id: "main", bizName: c.bizName, basis: c.basis, savingPct: c.savingPct, savingMin: c.savingMin, shares: c.shares as never, routine: c.routine as never },
      });

      await tx.greenBean.createMany({
        data: Object.values(master.greens).map((g) => ({
          id: g.id, name: g.name, category: g.category || "", price: +g.price || 0, minKg: +g.minKg || 0,
          minRoastedKg: +g.minRoastedKg || 0, supplier: g.supplier || "", active: g.active !== false,
        })),
      });
      await tx.pack.createMany({
        data: Object.values(master.packs).map((p) => ({
          id: p.id, name: p.name, unit: p.unit || "pcs", price: +p.price || 0, minQty: +p.minQty || 0, active: p.active !== false,
        })),
      });
      for (const b of Object.values(master.blends)) {
        await tx.blend.create({
          data: {
            id: b.id, name: b.name, cogs: +b.cogs || 0, minKg: +b.minKg || 0, active: b.active !== false,
            recipe: { create: b.recipe.map((r) => ({ greenId: r.greenId, pct: r.pct })) },
          },
        });
      }
      await tx.product.createMany({ data: Object.values(master.products).map((p) => ({ id: p.id, ...productData(p) })) });

      await tx.ledgerEntry.createMany({
        data: entries.map((e) => ({
          id: e.id, type: e.type, date: e.date, at: e.at ? new Date(e.at) : new Date(), by: e.by || "",
          data: entryData(e as unknown as Record<string, unknown>),
        })),
      });
    },
    { timeout: 60000 },
  );

  console.log(
    `Seed selesai dari ${dir}: ${Object.keys(master.greens).length} green, ${Object.keys(master.blends).length} blend, ` +
      `${Object.keys(master.packs).length} kemasan, ${Object.keys(master.products).length} produk, ${entries.length} entri ledger.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
