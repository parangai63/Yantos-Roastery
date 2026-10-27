// Helper format dari app.js lama (rp, nf, dLabel, ...). Format Indonesia.

const RP = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export const rp = (n: number) => RP.format(Math.round(n || 0)).replace(/ /g, " ");
export const rps = (n: number) => (n < 0 ? "−" : "") + rp(Math.abs(n));
export const nf = (n: number, d = 2) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d }).format(n || 0);
export const pct = (n: number) => (isFinite(n) ? nf(n * 100, 1) + "%" : "–");

const pad = (n: number) => String(n).padStart(2, "0");
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const thisMonth = () => today().slice(0, 7);

export const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const mLabel = (m: string) => BULAN[+m.slice(5, 7) - 1] + " " + m.slice(0, 4);
export const mShort = (m: string) => BULAN[+m.slice(5, 7) - 1].slice(0, 3) + " " + m.slice(2, 4);
export const dLabel = (d: string) => (d ? +d.slice(8, 10) + " " + BULAN[+d.slice(5, 7) - 1].slice(0, 3) + " " + d.slice(2, 4) : "");

export const short = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e9) return s + nf(a / 1e9, 1) + " M";
  if (a >= 1e6) return s + nf(a / 1e6, 1) + " jt";
  if (a >= 1e3) return s + nf(a / 1e3, 0) + " rb";
  return s + nf(a, 0);
};

export const sizeLabel = (g: number) => (g >= 1000 ? nf(g / 1000, 2) + " kg" : nf(g, 0) + " g");
// Angka dari input teks, koma atau titik ("1,5" -> 1.5)
export const num = (s: string) => parseFloat(String(s).replace(",", ".")) || 0;

// "1.250.000" -> 1250000
export const parseMoney = (s: string) => +(s.replace(/\D/g, "") || 0);
export const moneyStr = (n: number) => (n ? Math.round(n).toLocaleString("id-ID") : "");
