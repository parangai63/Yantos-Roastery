import { Router } from "express";
import { handle } from "../lib/httpError";
import * as c from "../controllers/masterController";

// Dipasang di /api/config.
const router = Router();

router.get("/", handle(c.getConfig));
router.put("/", handle(c.saveConfig));

export default router;
