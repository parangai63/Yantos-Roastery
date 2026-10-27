import { Router } from "express";
import { handle } from "../lib/httpError";
import * as c from "../controllers/reportController";

const router = Router();

router.get("/summary", handle(c.summary));
router.get("/stock/:kind", handle(c.stock));
router.get("/monthly", handle(c.monthly));
router.get("/yearly", handle(c.yearly));
router.get("/hpp", handle(c.hpp));
router.get("/production", handle(c.production));
router.get("/bills", handle(c.bills));
router.get("/cashbook", handle(c.cashbook));
router.get("/costs", handle(c.costs));

export default router;
