import { Router } from "express";
import { handle } from "../lib/httpError";
import * as c from "../controllers/masterController";

const router = Router();

router.get("/meta", handle(c.meta));
router.get("/config", handle(c.getConfig));
router.put("/config", handle(c.saveConfig));
router.get("/master", handle(c.list));
router.post("/master/:kind", handle(c.create));
router.put("/master/:kind/:id", handle(c.update));
router.patch("/master/:kind/:id/active", handle(c.setActive));
router.delete("/master/:kind/:id", handle(c.remove));

export default router;
