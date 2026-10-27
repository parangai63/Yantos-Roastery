import { Router } from "express";
import { handle } from "../lib/httpError";
import * as c from "../controllers/ledgerController";

const router = Router();

router.get("/", handle(c.list));
router.get("/names", handle(c.names));
router.post("/", handle(c.create));
router.patch("/:id/paid", handle(c.markPaid));
router.delete("/:id", handle(c.remove));

export default router;
