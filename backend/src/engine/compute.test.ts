// Angka patokan dari CLAUDE.md: hasil engine baru harus sama persis dengan
// versi artifact lama untuk data ekspor 20 Okt 2026.

import { describe, expect, it } from "vitest";
import { compute, distrib, labaOf, monthOf } from "./compute";
import { loadLegacyExport } from "../lib/legacyExport";

const { master, entries } = loadLegacyExport();
const C = compute(master, entries);
const r = Math.round;

describe("angka patokan Oktober 2026", () => {
  it("memuat semua entri ekspor", () => {
    expect(entries.filter((e) => e.type === "kas")).toHaveLength(97);
    expect(entries.filter((e) => e.type === "opening")).toHaveLength(55);
  });

  it("saldo kas", () => {
    expect(r(C.bal)).toBe(15660539);
  });

  it("pemasukan, pengeluaran, laba Oktober", () => {
    const okt = monthOf(C, "2026-10");
    expect(r(okt.cin)).toBe(27487584);
    expect(r(okt.cout)).toBe(10440726);
    expect(r(labaOf(master, okt))).toBe(17046858);
  });

  it("nilai stok", () => {
    expect(r(C.invT)).toBe(51838554);
    expect(C.inv.green / 1e6).toBeCloseTo(35.5, 0);
    expect(C.inv.roasted / 1e6).toBeCloseTo(13.9, 0);
    expect(C.inv.blend / 1e6).toBeCloseTo(2.3, 0);
  });

  it("pembagian laba mengikuti config", () => {
    const d = distrib(master, 17046858);
    expect(d.shares.map((s) => s.label)).toEqual(["Dana Yayasan Yantos", "Transfer Pak Munir"]);
    expect(d.saving).toBe(Math.max(1000000, 1704685.8));
  });
});
