// Backup & reset data (khusus admin).
//
// Reset menghapus SEMUA data kecuali akun & sesi login: ledger, data master (green, blend + resep,
// kemasan, produk), pengaturan (kembali ke DEFAULT_CONFIG), dan riwayat aktivitas. Setelah itu satu
// catatan "Reset data" ditulis ke riwayat supaya tetap terlihat siapa yang melakukannya.
//
// Pengaman: kalimat konfirmasi harus diketik persis + PIN admin dicek di server. Frontend juga
// mengunduh backup (GET /api/admin/backup) lebih dulu dan membatalkan reset bila unduhan gagal.
// Trigger bump_data_rev ikut jalan pada TRUNCATE, jadi cache hitungan di stateService langsung basi.

import prisma from "../prismaClient";
import { badRequest } from "../lib/httpError";
import { verifyPin as checkPin } from "../lib/pin";
import { type Actor, logActivity } from "../lib/activity";

export const RESET_PHRASE = "HAPUS SEMUA DATA";

/** Jumlah data yang akan hilang, ditampilkan di dialog konfirmasi. */
export async function dataSummary() {
  const [ledger, greens, blends, packs, products, activity] = await Promise.all([
    prisma.ledgerEntry.count({ where: { deleted: false } }),
    prisma.greenBean.count(),
    prisma.blend.count(),
    prisma.pack.count(),
    prisma.product.count(),
    prisma.activityLog.count(),
  ]);
  return { ledger, greens, blends, packs, products, activity, phrase: RESET_PHRASE };
}

/** Isi lengkap database (tanpa akun & sesi) sebagai JSON. */
export async function backup(actor: Actor) {
  const [config, greens, blends, packs, products, suppliers, ledger, activity] = await Promise.all([
    prisma.config.findMany(),
    prisma.greenBean.findMany({ orderBy: { id: "asc" } }),
    prisma.blend.findMany({ include: { recipe: true }, orderBy: { id: "asc" } }),
    prisma.pack.findMany({ orderBy: { id: "asc" } }),
    prisma.product.findMany({ orderBy: { id: "asc" } }),
    prisma.supplier.findMany({ include: { greens: true, packs: true }, orderBy: { id: "asc" } }),
    prisma.ledgerEntry.findMany({ orderBy: [{ date: "asc" }, { at: "asc" }] }), // termasuk yang dihapus (deleted: true)
    prisma.activityLog.findMany({ orderBy: { at: "asc" } }),
  ]);
  return {
    format: "yantos-roastery-backup", version: 1, exportedAt: new Date().toISOString(), exportedBy: actor.name,
    config, greens, blends, packs, products, suppliers, ledger, activity,
  };
}

export async function resetAll(actor: Actor, body: { pin?: unknown; confirm?: unknown }) {
  if (body.confirm !== RESET_PHRASE) throw badRequest(`Ketik "${RESET_PHRASE}" persis untuk melanjutkan.`);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (typeof body.pin !== "string" || !(await checkPin(body.pin, me.pinHash))) throw badRequest("PIN salah.");

  const before = await dataSummary();
  await prisma.$transaction([
    prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ledger_entries", "blend_recipe_items", "products", "supplier_greens", "supplier_packs", "suppliers", "blends", "green_beans", "packs", "config", "activity_logs"',
    ),
    logActivity(prisma, actor, {
      action: "reset", entity: "data",
      summary: `Mereset semua data: ${before.ledger} transaksi, ${before.greens} green bean, ${before.blends} blend, `
        + `${before.packs} kemasan, ${before.products} produk, ${before.activity} catatan riwayat dihapus`,
    }),
  ]);
  return { deleted: before };
}
