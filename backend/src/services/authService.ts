// Login PIN ala parang-ops: ketik 4 angka, tanpa memilih nama. PIN dicocokkan ke semua akun
// aktif (karena itu PIN wajib unik). Bedanya dengan parang-ops: PIN di-hash, percobaan salah
// dibatasi, dan server mengeluarkan token sesi yang dicek di setiap request /api.

import { createHash, randomBytes, randomUUID } from "crypto";
import type { User, UserRole } from "@prisma/client";
import prisma from "../prismaClient";
import { HttpError, badRequest, conflict, notFound } from "../lib/httpError";
import { assertPin, hashPin, verifyPin as checkPin, PIN_PATTERN } from "../lib/pin";
import { type Actor, type Changes, logActivity } from "../lib/activity";

const SESSION_HOURS = 12; // batas mutlak sejak masuk
// Browser mengunci setelah 10 menit diam (frontend AuthContext). Server memberi kelonggaran
// 2 menit karena lastSeenAt hanya diperbarui berkala (TOUCH_MS) dan lewat ping dari browser.
export const IDLE_MINUTES = 12;
const IDLE_MS = IDLE_MINUTES * 60_000;
const TOUCH_MS = 30_000; // lastSeenAt ditulis paling sering sekali per 30 detik per sesi
const CACHE_MS = 30_000; // sesi dibaca ulang dari DB paling lambat tiap 30 detik
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
  // Akun yang sudah dihapus tidak bisa masuk, dan PIN-nya boleh dipakai akun lain.
  const users = await prisma.user.findMany({ where: { ...where, deletedAt: null } });
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
      data: { id: sessionId(token), userId: user.id, expiresAt: new Date(now.getTime() + SESSION_HOURS * 3600_000), lastSeenAt: now },
    }),
  ]);
  return { token, user: toPublicUser(user) };
}

// ---------- cache sesi ----------
// Setiap request /api memeriksa sesi. Supaya tidak selalu query ke DB, hasilnya disimpan di
// memori proses paling lama CACHE_MS. Logout / ubah akun di proses ini langsung menghapus
// cache; proses server lain (serverless) paling lambat ikut tahu setelah CACHE_MS.
type CachedSession = { user: User; expiresAt: number; lastSeenAt: number; cachedAt: number };
const sessionCache = new Map<string, CachedSession>();

async function readSession(id: string): Promise<CachedSession | null> {
  const s = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!s) {
    sessionCache.delete(id);
    return null;
  }
  const c = { user: s.user, expiresAt: s.expiresAt.getTime(), lastSeenAt: s.lastSeenAt.getTime(), cachedAt: Date.now() };
  if (sessionCache.size > 1000) sessionCache.clear();
  sessionCache.set(id, c);
  return c;
}

const isDead = (c: CachedSession, now: number) => c.expiresAt < now || now - c.lastSeenAt > IDLE_MS || !c.user.active;

/**
 * Dipakai requireAuth. Tidak login bila: sesi tidak ada, lewat 12 jam, diam lebih dari
 * IDLE_MINUTES, atau akun nonaktif. Sesi yang mati langsung dihapus dari DB.
 */
export async function userFromToken(token: string): Promise<User | null> {
  if (!token) return null;
  const id = sessionId(token);
  const now = Date.now();

  let c = sessionCache.get(id);
  const fromCache = !!c && now - c.cachedAt <= CACHE_MS;
  if (!fromCache) c = (await readSession(id)) ?? undefined;
  // Cache bisa ketinggalan lastSeenAt yang diperbarui proses lain; pastikan ke DB sebelum menolak.
  if (c && fromCache && isDead(c, now)) c = (await readSession(id)) ?? undefined;
  if (!c) return null;

  if (isDead(c, now)) {
    sessionCache.delete(id);
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  if (now - c.lastSeenAt > TOUCH_MS) {
    c.lastSeenAt = now;
    await prisma.session.updateMany({ where: { id }, data: { lastSeenAt: new Date(now) } });
  }
  return c.user;
}

function forgetUserSessions(userId: string) {
  for (const [id, c] of sessionCache) if (c.user.id === userId) sessionCache.delete(id);
}

export async function logout(token: string) {
  const id = sessionId(token);
  sessionCache.delete(id);
  await prisma.session.deleteMany({ where: { id } });
}

export async function changeOwnPin(actor: Actor, oldPin: unknown, newPin: unknown) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (typeof oldPin !== "string" || !(await checkPin(oldPin, u.pinHash))) throw badRequest("PIN lama salah.");
  const pin = assertPin(newPin);
  await assertPinUnused(pin, actor.id);
  await prisma.$transaction([
    prisma.user.update({ where: { id: actor.id }, data: { pinHash: await hashPin(pin) } }),
    logActivity(prisma, actor, { action: "pin", entity: "users", entityId: actor.id, summary: "Mengganti PIN sendiri" }),
  ]);
}

// ---------- nama & hapus akun ----------

const cleanName = (v: unknown) => {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!name) throw badRequest("Nama wajib diisi.");
  if (name.length > 40) throw badRequest("Nama maksimal 40 huruf.");
  return name;
};

/** Nama unik (tanpa beda huruf besar/kecil) di antara akun yang belum dihapus. */
async function assertNameFree(name: string, exceptId?: string) {
  const taken = await prisma.user.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (taken) throw conflict(`Nama "${name}" sudah dipakai.`);
}

/** Menolak bila perubahan ini membuat tidak ada lagi admin aktif. */
async function assertKeepsAdmin(before: User, after: { role?: UserRole; active?: boolean }) {
  const losesAdmin = before.role === "admin" && before.active && (after.role === "staff" || after.active === false);
  if (losesAdmin && !(await prisma.user.count({ where: { role: "admin", active: true, deletedAt: null, id: { not: before.id } } }))) {
    throw badRequest("Harus ada minimal satu admin aktif.");
  }
}

async function findLiveUser(id: string) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || u.deletedAt) throw notFound("Akun tidak ditemukan.");
  return u;
}

/** PATCH /api/auth/me — ganti nama sendiri. Entri ledger lama tetap memakai nama saat dicatat. */
export async function renameSelf(actor: Actor, body: { name?: unknown }) {
  const before = await findLiveUser(actor.id);
  const name = cleanName(body.name);
  const oldName = before.name;
  if (name === oldName) return toPublicUser(before);
  await assertNameFree(name, actor.id);
  const log = logActivity(prisma, { id: actor.id, name }, {
    action: "rename", entity: "users", entityId: actor.id,
    summary: `Mengganti nama sendiri dari "${oldName}" menjadi "${name}"`, changes: { Nama: [oldName, name] },
  });
  const [u] = await prisma.$transaction([prisma.user.update({ where: { id: actor.id }, data: { name } }), log]);
  forgetUserSessions(actor.id); // sesi di cache masih membawa nama lama
  return toPublicUser(u);
}

/**
 * Hapus akun = soft delete (active=false, deletedAt). Menghapus akun sendiri wajib memasukkan PIN;
 * admin menghapus akun lain cukup konfirmasi di layar. Admin aktif terakhir tidak bisa dihapus.
 */
export async function deleteUser(actor: Actor, id: string, pin?: unknown) {
  const before = await findLiveUser(id);
  const self = id === actor.id;
  if (self && (typeof pin !== "string" || !(await checkPin(pin, before.pinHash)))) throw badRequest("PIN salah.");
  await assertKeepsAdmin(before, { active: false });
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: id } }),
    logActivity(prisma, actor, {
      action: "delete", entity: "users", entityId: id,
      summary: self ? "Menghapus akun sendiri" : `Menghapus akun "${before.name}"`,
    }),
  ]);
  forgetUserSessions(id);
}

// ---------- kelola akun (admin) ----------

export async function listUsers() {
  const rows = await prisma.user.findMany({ where: { deletedAt: null }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  return rows.map(toPublicUser);
}

/** Semua akun (termasuk yang sudah dihapus) untuk pilihan filter di halaman Riwayat. */
export async function listUserNames() {
  const rows = await prisma.user.findMany({ select: { id: true, name: true, deletedAt: true }, orderBy: { name: "asc" } });
  return rows.map((u) => ({ id: u.id, name: u.name, deleted: !!u.deletedAt }));
}

const ROLE_LABEL: Record<UserRole, string> = { admin: "Admin", staff: "Staf" };

/** `actor` kosong saat dipanggil dari skrip/test (tidak dicatat di riwayat). */
export async function createUser(body: { name?: unknown; pin?: unknown; role?: unknown }, actor?: Actor) {
  const name = cleanName(body.name);
  const role = (body.role ?? "staff") as UserRole;
  if (!ROLES.includes(role)) throw badRequest("Peran harus admin atau staff.");
  const pin = assertPin(body.pin);
  await assertNameFree(name);
  await assertPinUnused(pin);
  const id = randomUUID();
  const create = prisma.user.create({ data: { id, name, role, pinHash: await hashPin(pin) } });
  if (!actor) return toPublicUser(await create);
  const [u] = await prisma.$transaction([
    create,
    logActivity(prisma, actor, { action: "create", entity: "users", entityId: id, summary: `Menambah akun "${name}" (${ROLE_LABEL[role]})` }),
  ]);
  return toPublicUser(u);
}

export async function updateUser(actor: Actor, id: string, body: { name?: unknown; active?: unknown; role?: unknown; pin?: unknown }) {
  const before = await findLiveUser(id);

  const data: { name?: string; active?: boolean; role?: UserRole; pinHash?: string } = {};
  const changes: Changes = {};
  const said: string[] = [];
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (name !== before.name) {
      await assertNameFree(name, id);
      data.name = name;
      changes.Nama = [before.name, name];
      said.push("mengganti nama");
    }
  }
  if (body.active !== undefined) {
    if (id === actor.id && body.active === false) throw badRequest("Tidak bisa menonaktifkan akun sendiri.");
    data.active = Boolean(body.active);
    if (data.active !== before.active) said.push(data.active ? "mengaktifkan" : "menonaktifkan");
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as UserRole)) throw badRequest("Peran harus admin atau staff.");
    data.role = body.role as UserRole;
    if (data.role !== before.role) {
      changes.Peran = [ROLE_LABEL[before.role], ROLE_LABEL[data.role]];
      said.push(`menjadikan ${ROLE_LABEL[data.role].toLowerCase()}`);
    }
  }
  if (body.pin !== undefined) {
    const pin = assertPin(body.pin);
    await assertPinUnused(pin, id);
    data.pinHash = await hashPin(pin);
    said.push("mereset PIN");
  }

  // Selalu sisakan minimal satu admin aktif.
  await assertKeepsAdmin(before, data);

  const update = prisma.user.update({ where: { id }, data });
  const u = said.length
    ? (await prisma.$transaction([
      update,
      logActivity(prisma, actor, {
        action: "update", entity: "users", entityId: id, changes,
        summary: `${said.join(", ").replace(/^./, (c) => c.toUpperCase())} akun "${data.name ?? before.name}"`,
      }),
    ]))[0]
    : await update;
  // Nama/peran/aktif berubah: cache sesi akun ini dibuang supaya request berikutnya membaca ulang.
  forgetUserSessions(id);
  // Nonaktif atau PIN diganti: keluarkan dari semua perangkat.
  if (data.active === false || data.pinHash) await prisma.session.deleteMany({ where: { userId: id } });
  return toPublicUser(u);
}
