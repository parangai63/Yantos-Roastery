import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { HttpError } from "../lib/httpError";
import { userFromToken } from "../services/authService";

// Setiap request /api (kecuali /api/auth/status dan /api/auth/verify-pin) wajib membawa header
//   Authorization: Bearer <token>
// Token didapat dari POST /api/auth/verify-pin; frontend menempelkannya otomatis lewat
// frontend/src/api/authInterceptor.ts. Nama akun mengisi req.actor, yang disimpan ke kolom
// `by` di ledger — jadi pencatat diambil dari sesi, bukan dari header yang bisa dipalsukan.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: User;
      token: string;
      actor: string;
    }
  }
}

export const bearer = (req: Request) => {
  const h = req.header("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearer(req);
    const user = await userFromToken(token);
    if (!user) throw new HttpError(401, "Sesi berakhir. Silakan masuk lagi.");
    req.user = user;
    req.token = token;
    req.actor = user.name;
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return next(new HttpError(403, "Hanya admin yang bisa mengelola akun."));
  next();
}
