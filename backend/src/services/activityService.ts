// Membaca riwayat aktivitas (semua peran boleh melihat). Urut terbaru dulu, paginasi pakai kursor
// `before` = waktu catatan terakhir yang sudah tampil.

import type { Prisma } from "@prisma/client";
import prisma from "../prismaClient";
import { listUserNames } from "./authService";

const MAX_LIMIT = 100;

export async function listActivity(q: { userId?: string; entity?: string; before?: string; limit?: number }) {
  const where: Prisma.ActivityLogWhereInput = {};
  if (q.userId) where.userId = q.userId;
  if (q.entity) where.entity = q.entity === "master" ? { in: ["greens", "blends", "packs", "products", "suppliers"] } : q.entity;
  const before = q.before ? new Date(q.before) : null;
  if (before && !isNaN(before.getTime())) where.at = { lt: before };
  const take = Math.min(MAX_LIMIT, Math.max(1, q.limit || 50));
  const rows = await prisma.activityLog.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: take + 1 });
  return {
    items: rows.slice(0, take).map((r) => ({ ...r, at: r.at.toISOString() })),
    hasMore: rows.length > take,
  };
}

/** Pilihan filter akun: semua akun yang pernah ada (termasuk yang sudah dihapus). */
export const activityUsers = listUserNames;
