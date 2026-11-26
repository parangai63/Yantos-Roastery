import type { Request, Response } from "express";
import { badRequest } from "../lib/httpError";
import * as master from "../services/masterService";
import { META } from "../services/bootstrapService";

const kindParam = (req: Request) => {
  const k = req.params.kind;
  if (!master.isMasterKind(k)) throw badRequest("Jenis data master tidak dikenal.");
  return k;
};

const SAVE = {
  greens: master.saveGreen,
  blends: master.saveBlend,
  packs: master.savePack,
  products: master.saveProduct,
  suppliers: master.saveSupplier,
} as const;

export async function list(_req: Request, res: Response) {
  res.json(await master.listMaster());
}

export async function create(req: Request, res: Response) {
  res.status(201).json(await SAVE[kindParam(req)](req.actor, null, req.body));
}

export async function update(req: Request, res: Response) {
  res.json(await SAVE[kindParam(req)](req.actor, req.params.id, req.body));
}

export async function setActive(req: Request, res: Response) {
  res.json(await master.setActive(req.actor, kindParam(req), req.params.id, req.body.active !== false));
}

export async function remove(req: Request, res: Response) {
  await master.removeMaster(req.actor, kindParam(req), req.params.id);
  res.status(204).end();
}

export async function getConfig(_req: Request, res: Response) {
  res.json(await master.getConfig());
}

export async function saveConfig(req: Request, res: Response) {
  res.json(await master.saveConfig(req.actor, req.body));
}

export async function meta(_req: Request, res: Response) {
  res.json(META);
}
