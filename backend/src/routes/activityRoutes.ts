import { Router } from "express";
import { handle } from "../lib/httpError";
import { activityUsers, listActivity } from "../services/activityService";

// Dipasang di /api/activity. Semua peran boleh membaca riwayat.
//   GET /api/activity?userId=&entity=(master|greens|…|ledger|config|users|data)&before=<ISO>&limit=
//   GET /api/activity/users   → pilihan filter akun
const router = Router();

router.get("/", handle(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  res.json(await listActivity({ userId: q.userId || undefined, entity: q.entity || undefined, before: q.before, limit: Number(q.limit) || undefined }));
}));
router.get("/users", handle(async (_req, res) => { res.json(await activityUsers()); }));

export default router;
