import { Router } from "express";
import { handle } from "../lib/httpError";
import { requireAdmin } from "../middleware/auth";
import { backup, dataSummary, resetAll } from "../services/adminService";

// Dipasang di /api/admin, khusus admin.
//   GET  /api/admin/summary  → jumlah data (untuk dialog reset)
//   GET  /api/admin/backup   → seluruh data (tanpa akun) sebagai JSON
//   POST /api/admin/reset    → Body: { pin, confirm }
const router = Router();

router.use(requireAdmin);
router.get("/summary", handle(async (_req, res) => { res.json(await dataSummary()); }));
router.get("/backup", handle(async (req, res) => { res.json(await backup(req.actor)); }));
router.post("/reset", handle(async (req, res) => { res.json(await resetAll(req.actor, req.body || {})); }));

export default router;
