// Login PIN ala parang-ops: ketik 4 angka, tanpa memilih nama. PIN dicocokkan ke semua akun
// aktif (karena itu PIN wajib unik). Bedanya dengan parang-ops: PIN di-hash, percobaan salah
// dibatasi, dan server mengeluarkan token sesi yang dicek di setiap request /api.

import { createHash, randomBytes, randomUUID } from "crypto";
import type { User, UserRole } from "@prisma/client";
import prisma from "../prismaClient";
import { HttpError, badRequest, conflict, notFound } from "../lib/httpError";
import { assertPin, hashPin, verifyPin as checkPin, PIN_PATTERN } from "../lib/pin";

const SESSION_HOURS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const ROLES: UserRole[] = ["admin", "staff"];

export type PublicUser = Pick<User, "id" | "name" | "role" | "active" | "createdAt">;
export const toPublicUser = (u: User): PublicUser => ({ id: u.id, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt });

// Token asli hanya dipegang browser; database menyimpan sha256-nya.
const sessionId = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------- batas percobaan ----------
// Akun belum diketahui saat PIN salah, jadi dihitung per alamat klien (memori server).
const attempts = new Map<string, { count: number; lockedUntil: number }>();

function assertClientNotLocked(client: string) {
  const a = attempts.get(client);
  if (a && a.lockedUntil > Date.now()) {
    const mins = Math.ceil((a.lockedUntil - Date.now()) / 60000);
    throw new HttpError(429, `Terlalu banyak PIN salah. Coba lagi dalam ${mins} menit.`);
  }
}

function registerFailure(client: string) {
  const a = attempts.get(client);
  const count = (a && a.lockedUntil <= Date.now() ? a.count : 0) + 1;
  attempts.set(client, count >= MAX_FAILED ? { count: 0, lockedUntil: Date.now() + LOCK_MINUTES * 60000 } : { count, lockedUntil: 0 });
}

/** Akun aktif pemilik PIN ini, atau null. */
async function findByPin(pin: string, where: { active?: boolean; id?: { not: string } } = {}) {
  const users = await prisma.user.findMany({ where });
  for (const u of users) if (await checkPin(pin, u.pinHash)) return u;
  return null;
}

async function assertPinUnused(pin: string, exceptId?: string) {
  if (await findByPin(pin, exceptId ? { id: { not: exceptId } } : {})) {
    throw conflict("PIN sudah dipakai akun lain. Pilih PIN lain.");
  }
}

// ---------- login / sesi ----------

/** GET /api/auth/status: PinGate memakai ini untuk memberi petunjuk saat belum ada akun. */
export async function getStatus() {
  return { hasAnyUser: (await prisma.user.count({ where: { active: true } })) > 0 };
}

/** POST /api/auth/verify-pin */
export async function verifyPin(pin: unknown, client: string) {
  assertClientNotLocked(client);
  const user = typeof pin === "string" && PIN_PATTERN.test(pin) ? await findByPin(pin, { active: true }) : null;
  if (!user) {
    registerFailure(client);
    throw new HttpError(401, "PIN salah.");
  }
  attempts.delete(client);

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.session.create({
      data: { id: sessionId(token), userId: user.id, expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600_000) },
    }),
  ]);
  return { token, user: toPublicUser(user) };
}

/** Dipakai requireAuth. Akun nonaktif atau sesi kedaluwarsa = tidak login. */
export async function userFromToken(token: string): Promise<User | null> {
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: sessionId(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  return s.user;
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { id: sessionId(token) } });
}

export async function changeOwnPin(userId: string, oldPin: unknown, newPin: unknown) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (typeof oldPin !== "string" || !(await checkPin(oldPin, u.pinHash))) throw badRequest("PIN lama salah.");
  const pin = assertPin(newPin);
  await assertPinUnused(pin, userId);
  await prisma.user.update({ where: { id: userId }, data: { pinHash: await hashPin(pin) } });
}

// ---------- kelola akun (admin) ----------

export async function listUsers() {
  const rows = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
  return rows.map(toPublicUser);
}

export async function createUser(body: { name?: unknown; pin?: unknown; role?: unknown }) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw badRequest("Nama wajib diisi.");
  const role = (body.role ?? "staff") as UserRole;
  if (!ROLES.includes(role)) throw badRequest("Peran harus admin atau staff.");
  const pin = assertPin(body.pin);
  if (await prisma.user.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) throw conflict(`Nama "${name}" sudah dipakai.`);
  await assertPinUnused(pin);
  const u = await prisma.user.create({ data: { id: randomUUID(), name, role, pinHash: await hashPin(pin) } });
  return toPublicUser(u);
}

export async function updateUser(actorId: string, id: string, body: { active?: unknown; role?: unknown; pin?: unknown }) {
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound("Akun tidak ditemukan.");

  const data: { active?: boolean; role?: UserRole; pinHash?: string } = {};
  if (body.active !== undefined) {
    if (id === actorId && body.active === false) throw badRequest("Tidak bisa menonaktifkan akun sendiri.");
    data.active = Boolean(body.active);
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as UserRole)) throw badRequest("Peran harus admin atau staff.");
    data.role = body.role as UserRole;
  }
  if (body.pin !== undefined) {
    const pin = assertPin(body.pin);
    await assertPinUnused(pin, id);
    data.pinHash = await hashPin(pin);
  }

  // Selalu sisakan minimal satu admin aktif.
  const losesAdmin = before.role === "admin" && before.active && (data.role === "staff" || data.active === false);
  if (losesAdmin && !(await prisma.user.count({ where: { role: "admin", active: true, id: { not: id } } }))) {
    throw badRequest("Harus ada minimal satu admin aktif.");
  }

  const u = await prisma.user.update({ where: { id }, data });
  // Nonaktif atau PIN diganti: keluarkan dari semua perangkat.
  if (data.active === false || data.pinHash) await prisma.session.deleteMany({ where: { userId: id } });
  return toPublicUser(u);
}
