// Riwayat aktivitas: siapa mengubah apa. Dipanggil dari services di transaksi yang SAMA dengan
// perubahannya, supaya data & catatannya selalu berhasil (atau gagal) bersama.
// Login/logout sengaja tidak dicatat. Nilai PIN tidak pernah masuk ke catatan.

import type { Prisma, PrismaClient } from "@prisma/client";

/** Pelaku perubahan; diisi requireAuth dari akun pemilik sesi (req.actor). */
export type Actor = { id: string; name: string };

type Db = PrismaClient | Prisma.TransactionClient;

export type ActivityInput = {
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  changes?: Changes | null;
};

export type Changes = Record<string, [unknown, unknown]>;

export function logActivity(db: Db, actor: Actor, a: ActivityInput) {
  return db.activityLog.create({
    data: {
      userId: actor.id || null,
      userName: actor.name,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId ?? null,
      summary: a.summary,
      changes: a.changes && Object.keys(a.changes).length ? (a.changes as Prisma.InputJsonValue) : undefined,
    },
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Field yang berubah antara `before` dan `after`, dengan label yang dibaca manusia.
 * `labels` sekaligus menentukan field mana yang dibandingkan.
 */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): Changes {
  const out: Changes = {};
  for (const [k, label] of Object.entries(labels)) {
    if (!same(before[k], after[k])) out[label] = [before[k] ?? null, after[k] ?? null];
  }
  return out;
}

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
export const fmtNum = (n: unknown) => nf.format(Number(n) || 0);
export const fmtRp = (n: unknown) => "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);
