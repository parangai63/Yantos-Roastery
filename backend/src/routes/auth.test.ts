// Alur login PIN lewat HTTP sungguhan ke app Express, dengan Prisma tiruan di memori
// (tanpa database). Menguji: status, verify-pin, token wajib di /api, logout, batas percobaan,
// PIN unik, dan hak admin.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";

type Row = Record<string, any>;
const db = { users: [] as Row[], sessions: [] as Row[] };

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
  const user = {
    findMany: async ({ where }: Row = {}) => db.users.filter((u) => matches(u, where)),
    count: async ({ where }: Row = {}) => db.users.filter((u) => matches(u, where)).length,
    findFirst: async ({ where }: Row) => db.users.find((u) => matches(u, where)) ?? null,
    findUnique: async ({ where }: Row) => db.users.find((u) => u.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: Row) => db.users.find((u) => u.id === where.id)!,
    create: async ({ data }: Row) => { const u = { active: true, role: "staff", createdAt: new Date(), ...data }; db.users.push(u); return u; },
    update: async ({ where, data }: Row) => Object.assign(db.users.find((u) => u.id === where.id)!, data),
  };
  const session = {
    create: async ({ data }: Row) => { db.sessions.push({ createdAt: new Date(), ...data }); return data; },
    deleteMany: async ({ where }: Row) => { const before = db.sessions.length; db.sessions = db.sessions.filter((s) => !matches(s, where)); return { count: before - db.sessions.length }; },
    findUnique: async ({ where }: Row) => {
      const s = db.sessions.find((x) => x.id === where.id);
      return s ? { ...s, user: db.users.find((u) => u.id === s.userId) } : null;
    },
  };
  return { default: { user, session, $transaction: (ops: Promise<unknown>[]) => Promise.all(ops) } };
});

const { default: app } = await import("../app");
const { createUser } = await import("../services/authService");

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
  beforeEach(() => { db.users = []; db.sessions = []; });

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

  // Paling akhir: penguncian per IP disimpan di memori server dan semua test memakai 127.0.0.1.
  it("5 kali salah → dikunci (429), PIN benar pun ditolak", async () => {
    await createUser({ name: "Yanto", pin: "1234", role: "admin" });
    for (let i = 0; i < 5; i++) expect((await call("POST", "/api/auth/verify-pin", { body: { pin: "9999" } })).status).toBe(401);
    const locked = await call("POST", "/api/auth/verify-pin", { body: { pin: "1234" } });
    expect(locked.status).toBe(429);
    expect(locked.body.message).toMatch(/Coba lagi dalam/);
  });
});
