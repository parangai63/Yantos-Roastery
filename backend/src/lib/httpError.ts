import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg: string) => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

// Membungkus handler async supaya error dilempar ke errorHandler.
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

// Bentuk error sama dengan parang-ops: { message }.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  // Body JSON rusak dari express.json()
  if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ message: "Format JSON tidak valid." });
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan di server." });
}
