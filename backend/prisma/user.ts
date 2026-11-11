// Kelola akun dari terminal. Dipakai untuk membuat admin pertama (sebelum ada yang bisa
// masuk lewat PinGate) dan untuk mereset PIN.
//
//   npm run user -- list
//   npm run user -- create "Nama" 1234 admin     (peran: admin | staff, default staff)
//   npm run user -- reset-pin "Nama" 5678        (sekaligus mengaktifkan & mengeluarkan dari semua perangkat)
//
// Login tidak memakai nama, hanya PIN — jadi PIN harus unik antar akun.
// Memakai DATABASE_URL dari backend/.env.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { assertPin, hashPin, verifyPin } from "../src/lib/pin";

const prisma = new PrismaClient();
const [cmd, name, pin, role] = process.argv.slice(2);

const findByName = (n: string) => prisma.user.findFirst({ where: { name: { equals: n.trim(), mode: "insensitive" } } });

async function assertPinUnused(p: string, exceptId?: string) {
  const others = await prisma.user.findMany({ where: exceptId ? { id: { not: exceptId } } : {} });
  for (const o of others) if (await verifyPin(p, o.pinHash)) throw new Error(`PIN sudah dipakai akun "${o.name}". Pilih PIN lain.`);
}

async function main() {
  switch (cmd) {
    case "list": {
      const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
      if (!users.length) console.log("Belum ada akun.");
      for (const u of users) console.log(`${u.name.padEnd(24)} ${u.role.padEnd(6)} ${u.active ? "aktif" : "nonaktif"}`);
      return;
    }
    case "create": {
      if (!name?.trim()) throw new Error("Nama wajib diisi.");
      if (await findByName(name)) throw new Error(`Nama "${name}" sudah dipakai.`);
      const p = assertPin(pin);
      await assertPinUnused(p);
      const r = role === "admin" ? "admin" : "staff";
      await prisma.user.create({ data: { id: randomUUID(), name: name.trim(), role: r, pinHash: await hashPin(p) } });
      console.log(`Akun "${name.trim()}" (${r}) dibuat.`);
      return;
    }
    case "reset-pin": {
      const u = name ? await findByName(name) : null;
      if (!u) throw new Error(`Akun "${name}" tidak ditemukan.`);
      const p = assertPin(pin);
      await assertPinUnused(p, u.id);
      await prisma.$transaction([
        prisma.user.update({ where: { id: u.id }, data: { pinHash: await hashPin(p), active: true } }),
        prisma.session.deleteMany({ where: { userId: u.id } }),
      ]);
      console.log(`PIN "${u.name}" direset dan akun diaktifkan.`);
      return;
    }
    default:
      console.log('Pemakaian:\n  npm run user -- list\n  npm run user -- create "Nama" 1234 admin\n  npm run user -- reset-pin "Nama" 5678');
  }
}

main()
  .catch((e) => { console.error(e.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
