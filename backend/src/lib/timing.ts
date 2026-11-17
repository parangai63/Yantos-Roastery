// Header `Server-Timing` di setiap respons /api, supaya kelihatan di DevTools (tab Network →
// Timing) ke mana waktu habis: cek sesi, query DB, compute(), total. Contoh:
//   Server-Timing: auth;dur=3.1, rev;dur=4.2, cache;desc="hit", total;dur=9.8
// Pemakaian di kode: `await timed("db", () => prisma...)` atau `mark("cache", "hit")`.

import { AsyncLocalStorage } from "async_hooks";
import { performance } from "perf_hooks";
import type { NextFunction, Request, Response } from "express";

const store = new AsyncLocalStorage<string[]>();

export function mark(name: string, desc?: string, ms?: number) {
  const parts = [name];
  if (desc) parts.push(`desc="${desc}"`);
  if (ms !== undefined) parts.push(`dur=${ms.toFixed(1)}`);
  store.getStore()?.push(parts.join(";"));
}

export async function timed<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const t = performance.now();
  try {
    return await fn();
  } finally {
    mark(name, undefined, performance.now() - t);
  }
}

export function serverTiming(_req: Request, res: Response, next: NextFunction) {
  const marks: string[] = [];
  const start = performance.now();
  const writeHead = res.writeHead;
  // Header harus dipasang tepat sebelum dikirim, setelah semua tahap tercatat.
  res.writeHead = function (this: Response, ...args: unknown[]) {
    if (!res.headersSent) {
      res.setHeader("Server-Timing", [...marks, `total;dur=${(performance.now() - start).toFixed(1)}`].join(", "));
    }
    return (writeHead as (...a: unknown[]) => Response).apply(this, args);
  } as Response["writeHead"];
  store.run(marks, next);
}
