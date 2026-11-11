// PIN 4 angka disimpan sebagai hash scrypt: "scrypt$<salt hex>$<hash hex>".
// PIN asli tidak pernah disimpan atau dikirim balik ke klien.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { badRequest } from "./httpError";

const scrypt = promisify(scryptCb) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 32;

export const PIN_PATTERN = /^\d{4}$/;

/** Hash yang pasti tidak cocok dengan PIN apa pun (dipakai agar waktu respons tetap sama). */
export const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(KEY_LEN * 2)}`;

export function assertPin(pin: unknown): string {
  if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) throw badRequest("PIN harus tepat 4 angka.");
  return pin;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex || hashHex.length !== KEY_LEN * 2) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(pin, Buffer.from(saltHex, "hex"), KEY_LEN);
  return timingSafeEqual(actual, expected) && stored !== DUMMY_HASH;
}
