import { Router } from "express";
import { handle } from "../lib/httpError";
import { requireAuth } from "../middleware/auth";
import * as c from "../controllers/authController";

const router = Router();

// Terbuka (belum login)
router.get("/status", handle(c.getAuthStatus));
router.post("/verify-pin", handle(c.verifyPin));

// Wajib login
router.get("/me", requireAuth, handle(c.me));
router.post("/logout", requireAuth, handle(c.logout));
router.put("/pin", requireAuth, handle(c.changePin));

export default router;
