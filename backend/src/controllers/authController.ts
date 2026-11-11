import type { Request, Response } from "express";
import * as auth from "../services/authService";

/**
 * GET /api/auth/status
 * Memberi tahu PinGate apakah sudah ada akun aktif. Kalau belum, PinGate menampilkan
 * petunjuk membuat admin pertama lewat `npm run user -- create`.
 */
export async function getAuthStatus(_req: Request, res: Response) {
  res.json(await auth.getStatus());
}

/**
 * POST /api/auth/verify-pin
 * Body: { pin }
 * Seperti parang-ops: tidak ada langkah memilih nama. PIN dicocokkan ke semua akun aktif;
 * yang cocok menjadi identitas sesi. Balasan: { token, user }. Token dikirim lagi sebagai
 * header `Authorization: Bearer <token>` di setiap request /api berikutnya.
 */
export async function verifyPin(req: Request, res: Response) {
  res.json(await auth.verifyPin(req.body?.pin, req.ip ?? ""));
}

/** GET /api/auth/me */
export async function me(req: Request, res: Response) {
  res.json(auth.toPublicUser(req.user));
}

/** POST /api/auth/logout — menghapus sesi di server (dipanggil saat layar dikunci). */
export async function logout(req: Request, res: Response) {
  await auth.logout(req.token);
  res.status(204).end();
}

/** PUT /api/auth/pin — Body: { oldPin, newPin } */
export async function changePin(req: Request, res: Response) {
  await auth.changeOwnPin(req.user.id, req.body?.oldPin, req.body?.newPin);
  res.status(204).end();
}

/** GET /api/users (admin) */
export async function getUsers(_req: Request, res: Response) {
  res.json(await auth.listUsers());
}

/** POST /api/users (admin) — Body: { name, pin, role } */
export async function createUser(req: Request, res: Response) {
  res.status(201).json(await auth.createUser(req.body || {}));
}

/** PATCH /api/users/:id (admin) — Body: { active?, role?, pin? } */
export async function updateUser(req: Request, res: Response) {
  res.json(await auth.updateUser(req.user.id, req.params.id, req.body || {}));
}
