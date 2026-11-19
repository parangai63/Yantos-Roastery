// Alur login PIN lewat HTTP sungguhan ke app Express, dengan Prisma tiruan di memori
// (tanpa database). Menguji: status, verify-pin, token wajib di /api, logout, batas percobaan,
// PIN unik, hak admin, ganti nama, hapus akun (soft delete), riwayat aktivitas, dan reset data.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";

type Row = Record<string, any>;
const db = { users: [] as Row[], sessions: [] as Row[], activity: [] as Row[], ledger: [] as Row[], greens: [] as Row[] };

const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("not" in v) return row[k] !== v.not;
      if ("lt" in v) return row[k] < v.lt;
      if ("equals" in v) return String(row[k]).toLowerCase() === String(v.equals).toLowerCase();
    }
    return row[k] === v;
  });

vi.mock("../prismaClient", () => {
  const table = (name: "ledger" | "greens") => ({
    count: async ({ where }: Row = {}) => db[name].filter((r) => matches(r, where)).length,
  });
  const activityLog = {
    create: async ({ data }: Row) => { const r = { id: String(db.activity.length + 1), at: new Date(), ...data }; db.activity.push(r); return r; },
    count: async () => db.activity.length,
    findMany: async ({ where, take }: Row = {}) => db.activity.filter((r) => matches(r, where)).reverse().slice(0, take ?? Infinity),
  };
  const user = {
    findMany: async ({ where }: Row = {}) => db.users.filter((u) => matches(u, where)),
    count: async ({ where }: Row = {}) => db.users.filter((u) => matches(u, where)).length,
    findFirst: async ({ where }: Row) => db.users.find((u) => matches(u, where)) ?? null,
    findUnique: async ({ where }: Row) => db.users.find((u) => u.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: Row) => db.users.find((u) => u.id === where.id)!,
    create: async ({ data }: Row) => { const u = { active: true, role: "staff", createdAt: new Date(), deletedAt: null, ...data }; db.users.push(u); return u; },
    update: async ({ where, data }: Row) => Object.assign(db.users.find((u) => u.id === where.id)!, data),
  };
  const session = {
    create: async ({ data }: Row) => { db.sessions.push({ createdAt: new Date(), ...data }); return data; },
    updateMany: async ({ where, data }: Row) => {
      const rows = db.sessions.filter((s) => matches(s, where));
      rows.forEach((s) => Object.assign(s, data));
      return { count: rows.length };
    },
    deleteMany: async ({ where }: Row) => { const before = db.sessions.length; db.sessions = db.sessions.filter((s) => !matches(s, where)); return { count: before - db.sessions.length }; },
    findUnique: async ({ where }: Row) => {
      const s = db.sessions.find((x) => x.id === where.id);
      return s ? { ...s, user: db.users.find((u) => u.id === s.userId) } : null;
    },
  };
  const empty = { count: async () => 0 };
  return {
    default: {
      user, session, activityLog, ledgerEntry: table("ledger"), greenBean: table("greens"), blend: empty, pack: empty, product: empty,
      // Satu-satunya SQL mentah yang dipakai: TRUNCATE di adminService.resetAll.
      $executeRawUnsafe: async (sql: string) => {
        if (/^TRUNCATE/.test(sql)) { db.ledger = []; db.greens = []; db.activity = []; }
        return 0;
      },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  };
});

const { default: app } = await import("../app");
const { createUser, IDLE_MINUTES } = await import("../services/authService");

let server: Server;
let base = "";
beforeAll(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const call = async (method: string, path: string, opts: { body?: unknown; token?: string; ip?: string } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

describe("login PIN (verify-pin)", () => {
  beforeEach(() => { db.users = []; db.sessions = []; db.activity = []; db.ledger = []; db.greens = []; });

  it("status melaporkan belum/sudah ada akun", async () => {
    expect((await call("GET", "/api/auth/status")).body).toEqual({ hasAnyUser: false });
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    expect((await call("GET", "/api/auth/status")).body).toEqual({ hasAnyUser: true });
  });

  it("PIN benar → token; token wajib untuk /api; logout mencabut token", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    await createUser({ name: "Sari", pin: "5678" });

    const ok = await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ name: "Sari", role: "staff" });
    expect(ok.body.user.pinHash).toBeUndefined();
    const token = ok.body.token as string;
    expect(db.sessions[0].id).not.toBe(token); // DB menyimpan hash, bukan token

    expect((await call("GET", "/api/master")).status).toBe(401);
    expect((await call("GET", "/api/auth/me")).status).toBe(401);
    expect((await call("GET", "/api/auth/me", { token })).body).toMatchObject({ name: "Sari" });

    // staff tidak boleh kelola akun
    expect((await call("GET", "/api/users", { token })).status).toBe(403);

    expect((await call("POST", "/api/auth/logout", { token })).status).toBe(204);
    expect((await call("GET", "/api/auth/me", { token })).status).toBe(401);
  });

  it("sesi diam lebih dari batas → 401 dan sesi dihapus; request memperbarui lastSeenAt", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    const ago = (min: number) => new Date(Date.now() - min * 60_000);

    // Masih dalam batas: diterima, lastSeenAt maju ke sekarang.
    const t1 = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    db.sessions[0].lastSeenAt = ago(5);
    expect((await call("GET", "/api/auth/me", { token: t1 })).status).toBe(200);
    expect(Date.now() - db.sessions[0].lastSeenAt.getTime()).toBeLessThan(5_000);

    // Lewat batas diam: ditolak dan baris sesinya hilang.
    const t2 = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    const s2 = db.sessions.find((s) => s !== db.sessions[0])!;
    s2.lastSeenAt = ago(IDLE_MINUTES + 1);
    expect((await call("GET", "/api/auth/me", { token: t2 })).status).toBe(401);
    expect(db.sessions).not.toContain(s2);
  });

  it("PIN salah → 401 dengan { message }; format PIN salah juga 401", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    const bad = await call("POST", "/api/auth/verify-pin", { body: { pin: "0000" } });
    expect(bad).toEqual({ status: 401, body: { message: "PIN salah." } });
    expect((await call("POST", "/api/auth/verify-pin", { body: { pin: "12" } })).status).toBe(401);
  });

  it("akun nonaktif tidak bisa masuk dan sesinya langsung tidak berlaku", async () => {
    const admin = await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    const staff = await createUser({ name: "Sari", pin: "5678" });
    const tAdmin = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    const tStaff = (await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } })).body.token;

    const r = await call("PATCH", `/api/users/${staff.id}`, { token: tAdmin, body: { active: false } });
    expect(r.status).toBe(200);
    expect((await call("GET", "/api/auth/me", { token: tStaff })).status).toBe(401);
    expect((await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } })).status).toBe(401);

    // admin terakhir tidak bisa menonaktifkan diri sendiri
    expect((await call("PATCH", `/api/users/${admin.id}`, { token: tAdmin, body: { active: false } })).status).toBe(400);
  });

  it("PIN harus unik antar akun", async () => {
    const admin = await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    const t = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    const dup = await call("POST", "/api/users", { token: t, body: { name: "Budi", pin: "1234" } });
    expect(dup.status).toBe(409);
    expect((await call("POST", "/api/users", { token: t, body: { name: "Budi", pin: "4321" } })).status).toBe(201);
    expect(admin.name).toBe("Yanto");
  });

  it("route tak dikenal → 404 { message } (setelah login)", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    const t = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    expect(await call("GET", "/api/tidak-ada", { token: t })).toEqual({ status: 404, body: { message: "Route not found" } });
  });

  it("ganti nama sendiri: nama baru dipakai sesi, nama ganda ditolak, tercatat di riwayat", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    await createUser({ name: "Sari", pin: "5678" });
    const t = (await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } })).body.token;

    expect((await call("PATCH", "/api/auth/me", { token: t, body: { name: "yanto" } })).status).toBe(409);
    expect((await call("PATCH", "/api/auth/me", { token: t, body: { name: "  " } })).status).toBe(400);
    const r = await call("PATCH", "/api/auth/me", { token: t, body: { name: "Sari Dewi" } });
    expect(r).toMatchObject({ status: 200, body: { name: "Sari Dewi" } });
    expect((await call("GET", "/api/auth/me", { token: t })).body.name).toBe("Sari Dewi");

    // Semua peran boleh membaca riwayat.
    const log = await call("GET", "/api/activity", { token: t });
    expect(log.status).toBe(200);
    expect(log.body.items[0]).toMatchObject({ action: "rename", userName: "Sari Dewi", changes: { Nama: ["Sari", "Sari Dewi"] } });
  });

  it("hapus akun sendiri: wajib PIN, sesi dicabut, nama & PIN bisa dipakai lagi", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    await createUser({ name: "Sari", pin: "5678" });
    const tAdmin = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    const tStaff = (await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } })).body.token;

    expect((await call("DELETE", "/api/auth/me", { token: tStaff, body: { pin: "0000" } })).status).toBe(400);
    expect((await call("DELETE", "/api/auth/me", { token: tStaff, body: { pin: "5678" } })).status).toBe(204);
    expect((await call("GET", "/api/auth/me", { token: tStaff })).status).toBe(401);
    expect((await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } })).status).toBe(401);
    expect(db.users.find((u) => u.name === "Sari")).toMatchObject({ active: false, deletedAt: expect.any(Date) });

    const list = await call("GET", "/api/users", { token: tAdmin });
    expect(list.body.map((u: Row) => u.name)).toEqual(["Yanto"]);
    expect((await call("POST", "/api/users", { token: tAdmin, body: { name: "Sari", pin: "5678" } })).status).toBe(201);

    // Admin aktif terakhir tidak bisa menghapus diri sendiri.
    expect((await call("DELETE", "/api/auth/me", { token: tAdmin, body: { pin: "1234" } })).status).toBe(400);
  });

  it("admin menghapus akun lain; staf tidak boleh", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    const sari = await createUser({ name: "Sari", pin: "5678" });
    const budi = await createUser({ name: "Budi", pin: "4321" });
    const tAdmin = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    const tStaff = (await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } })).body.token;

    expect((await call("DELETE", `/api/users/${budi.id}`, { token: tStaff })).status).toBe(403);
    expect((await call("DELETE", `/api/users/${sari.id}`, { token: tAdmin })).status).toBe(204);
    expect((await call("GET", "/api/auth/me", { token: tStaff })).status).toBe(401);
    expect(db.activity.at(-1)).toMatchObject({ action: "delete", userName: "Yanto", summary: 'Menghapus akun "Sari"' });
    expect((await call("DELETE", `/api/users/${sari.id}`, { token: tAdmin })).status).toBe(404);
  });

  it("reset data: khusus admin, wajib kalimat konfirmasi + PIN; akun tetap, riwayat diganti satu catatan reset", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    await createUser({ name: "Sari", pin: "5678" });
    const tAdmin = (await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } })).body.token;
    const tStaff = (await call("POST", "/api/auth/verify-pin", { body: { pin: "5678" } })).body.token;
    db.ledger = [{ deleted: false }, { deleted: false }, { deleted: true }];
    db.greens = [{}];
    db.activity = [{ id: "x", action: "create" }];

    const body = (pin: string, confirm: string) => ({ token: tAdmin, body: { pin, confirm } });
    expect((await call("POST", "/api/admin/reset", { token: tStaff, body: { pin: "5678", confirm: "HAPUS SEMUA DATA" } })).status).toBe(403);
    expect((await call("GET", "/api/admin/summary", { token: tAdmin })).body).toMatchObject({ ledger: 2, greens: 1, activity: 1 });
    expect((await call("POST", "/api/admin/reset", body("1234", "hapus"))).status).toBe(400);
    expect((await call("POST", "/api/admin/reset", body("0000", "HAPUS SEMUA DATA"))).status).toBe(400);
    expect(db.ledger).toHaveLength(3);

    expect((await call("POST", "/api/admin/reset", body("1234", "HAPUS SEMUA DATA"))).status).toBe(200);
    expect(db.ledger).toHaveLength(0);
    expect(db.users).toHaveLength(2);
    expect(db.activity).toHaveLength(1);
    expect(db.activity[0]).toMatchObject({ action: "reset", entity: "data", userName: "Yanto" });
    expect((await call("GET", "/api/auth/me", { token: tStaff })).status).toBe(200);
  });

  // Paling akhir: penguncian per IP disimpan di memori server dan semua test memakai 127.0.0.1.
  it("5 kali salah → dikunci (429), PIN benar pun ditolak", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    for (let i = 0; i < 5; i++) expect((await call("POST", "/api/auth/verify-pin", { body: { pin: "9999" } })).status).toBe(401);
    const locked = await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } });
    expect(locked.status).toBe(429);
    expect(locked.body.message).toMatch(/Coba lagi dalam/);
  });
});
