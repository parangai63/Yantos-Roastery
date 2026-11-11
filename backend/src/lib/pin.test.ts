import { describe, expect, it } from "vitest";
import { assertPin, DUMMY_HASH, hashPin, verifyPin } from "./pin";

describe("pin", () => {
  it("hash berbeda tiap kali tetapi tetap terverifikasi", async () => {
    const a = await hashPin("1234"), b = await hashPin("1234");
    expect(a).not.toBe(b);
    expect(await verifyPin("1234", a)).toBe(true);
    expect(await verifyPin("4321", a)).toBe(false);
  });

  it("hash rusak / dummy tidak pernah cocok", async () => {
    expect(await verifyPin("0000", DUMMY_HASH)).toBe(false);
    expect(await verifyPin("1234", "bukan-hash")).toBe(false);
  });

  it("hanya menerima tepat 4 angka", () => {
    expect(assertPin("0042")).toBe("0042");
    for (const bad of ["123", "12345", "12a4", "", null, 1234.5]) expect(() => assertPin(bad)).toThrow();
  });
});
