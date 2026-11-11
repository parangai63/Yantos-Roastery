import { Router } from "express";
import { handle } from "../lib/httpError";
import { requireAdmin } from "../middleware/auth";
import * as c from "../controllers/authController";

// Dipasang di /api/users, di belakang requireAuth (lihat app.ts).
const router = Router();

router.use(requireAdmin);
router.get("/", handle(c.getUsers));
router.post("/", handle(c.createUser));
router.patch("/:id", handle(c.updateUser));

export default router;
