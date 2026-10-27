import type { Request, Response } from "express";
import * as ledger from "../services/ledgerService";
import { today } from "../services/reportService";

export async function list(req: Request, res: Response) {
  const types = typeof req.query.types === "string" && req.query.types ? req.query.types.split(",") : undefined;
  const limit = req.query.limit ? Math.min(500, Number(req.query.limit) || 0) || undefined : undefined;
  res.json(await ledger.listEntries({ month: req.query.month as string | undefined, types, limit, order: req.query.order as string | undefined }));
}

export async function names(_req: Request, res: Response) {
  res.json(await ledger.names());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await ledger.createEntry(req.body, req.actor));
}

export async function markPaid(req: Request, res: Response) {
  res.json(await ledger.markPaid(req.params.id, req.body.paidDate || today()));
}

export async function remove(req: Request, res: Response) {
  await ledger.softDelete(req.params.id);
  res.status(204).end();
}
