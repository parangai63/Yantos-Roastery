import type { NextFunction, Request, Response } from "express";

// Sementara: nama pencatat dikirim frontend lewat header X-Actor dan disimpan
// di kolom `by`. Ini BUKAN autentikasi. Ganti dengan login sungguhan
// (session/JWT) sebelum dipakai tim, karena data ini data keuangan asli.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor: string;
    }
  }
}

export function actorMiddleware(req: Request, _res: Response, next: NextFunction) {
  const raw = String(req.header("x-actor") || "");
  let name = raw;
  try { name = decodeURIComponent(raw); } catch { /* biarkan apa adanya */ }
  req.actor = name.slice(0, 80);
  next();
}
