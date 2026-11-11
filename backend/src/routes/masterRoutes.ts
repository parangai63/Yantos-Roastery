import { Router } from "express";
import { handle } from "../lib/httpError";
import * as c from "../controllers/masterController";

// Dipasang di /api/master. :kind = greens | blends | packs | products
const router = Router();

router.get("/", handle(c.list));
router.get("/meta", handle(c.meta));
router.post("/:kind", handle(c.create));
router.put("/:kind/:id", handle(c.update));
router.patch("/:kind/:id/active", handle(c.setActive));
router.delete("/:kind/:id", handle(c.remove));

export default router;
