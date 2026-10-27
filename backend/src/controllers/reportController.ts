import type { Request, Response } from "express";
import { badRequest } from "../lib/httpError";
import * as report from "../services/reportService";
import type { StockKind } from "../engine/types";

const monthParam = (req: Request) => {
  const m = String(req.query.month || report.today().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(m)) throw badRequest("Parameter month harus YYYY-MM.");
  return m;
};

export async function summary(req: Request, res: Response) {
  res.json(await report.summary(monthParam(req)));
}

export async function stock(req: Request, res: Response) {
  const k = req.params.kind as StockKind;
  if (!["green", "roasted", "blend", "pack"].includes(k)) throw badRequest("Jenis stok tidak valid.");
  res.json(await report.stock(k));
}

export async function monthly(req: Request, res: Response) {
  res.json(await report.monthly(monthParam(req)));
}

export async function yearly(req: Request, res: Response) {
  const y = String(req.query.year || report.today().slice(0, 4));
  if (!/^\d{4}$/.test(y)) throw badRequest("Parameter year harus YYYY.");
  res.json(await report.yearly(y));
}

export async function hpp(req: Request, res: Response) {
  res.json(await report.hpp(monthParam(req)));
}

export async function production(req: Request, res: Response) {
  res.json(await report.production(monthParam(req)));
}

export async function bills(_req: Request, res: Response) {
  res.json(await report.bills());
}

export async function cashbook(req: Request, res: Response) {
  res.json(await report.cashbook(monthParam(req)));
}

export async function costs(_req: Request, res: Response) {
  res.json(await report.costs());
}
