// Kosakata dari Excel Yantos. Dipakai engine (NON_OP) dan dikirim ke
// frontend lewat GET /api/meta supaya dropdown tidak diduplikasi.

export const CATS_IN = ["Penjualan Kopi", "Jasa Roasting", "Merchandise", "Modal/Setoran Pemilik", "Pendapatan Lainnya"];
export const CATS_OUT = [
  "Bahan Baku (Green Bean)", "Packaging", "Listrik & Air", "Sewa Tempat", "Payment Editor", "Payment Tukang",
  "Payment Roaster", "Payment Admin", "Payment Karyawan Operasional", "Pembelian Alat",
  "Distribusi/Dividen (Realisasi)", "Pengeluaran Lainnya",
];
export const NON_OP = ["Modal/Setoran Pemilik", "Distribusi/Dividen (Realisasi)"];
export const USE_CATS = [
  "Operasional Kopi Parang", "Transfer Stock Cabang", "Sampling/Cupping", "Kalibrasi/Susut",
  "Penjualan Cust (uang dicatat di kas)", "Lain-lain",
];
export const GROUPS = ["Espresso", "Filter", "Blend", "Paket B2B", "Lainnya"];
export const CHANNELS = ["Kafe / B2B", "Toko / langsung", "Online / marketplace", "Event", "Reseller", "Lainnya"];
export const METHODS = ["Transfer bank", "Tunai", "QRIS", "Marketplace", "Lainnya"];

export const DEFAULT_CONFIG = {
  bizName: "Yantos Roastery",
  basis: "kas" as const,
  savingMin: 1000000,
  savingPct: 10,
  shares: [
    { label: "Dana Yayasan Yantos", pct: 2.5 },
    { label: "Transfer Pak Munir", pct: 40 },
  ],
  routine: [
    { label: "Payment Editor", amount: 200000 },
    { label: "Payment Tukang", amount: 100000 },
    { label: "Payment Roaster", amount: 1000000 },
    { label: "Payment Admin", amount: 200000 },
    { label: "Payment Karyawan Operasional", amount: 100000 },
  ],
};
