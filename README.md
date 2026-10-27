# Yantos Roastery — Gudang, Produksi & Keuangan

Aplikasi web untuk mencatat stok dan kas roastery Yantos: green bean, roasting, blend,
kemasan, penjualan, buku kas, dan laporan bulanan (Dana Yayasan, Transfer Pak Munir, saving).

Diekspor dari artifact Claude pada 20 Oktober 2026, lengkap dengan seluruh datanya.

## Jalankan di laptop

Butuh Python 3 (atau server statis apa pun).

```bash
cd src
python3 -m http.server 8000
```

Buka http://localhost:8000. Tambahkan `?reset=1` di URL untuk mengembalikan data ke isi awal.

## Penting soal data

- Di versi lokal ini, data disimpan di **browser** (localStorage), bukan server.
  Cocok untuk mengembangkan dan mencoba, **belum** untuk dipakai tim sehari-hari.
  Untuk itu `src/claude-shim.js` perlu diganti dengan backend sungguhan (lihat `CLAUDE.md`).
- Sampai backend siap, versi yang dipakai harian tetap artifact di claude.ai.
  Data yang diinput di sana setelah 20 Okt 2026 tidak ikut di repo ini.
- Repo ini berisi data keuangan asli. Buat repository GitHub sebagai **Private**.

## Versi baru: backend + frontend (sedang dimigrasi)

Stack-nya sama dengan parang-ops: **Express + TypeScript + Prisma + PostgreSQL** di `backend/`,
dan **React 18 + Vite + TypeScript + Tailwind** di `frontend/`. Butuh Node.js 20+ dan Docker.

```bash
docker compose up -d                 # PostgreSQL di localhost:5433

cd backend
cp .env.example .env
npm install
npx prisma migrate dev               # buat tabel
npm run db:seed                      # isi dari folder data/
npm test                             # cek angka patokan (lihat CLAUDE.md)
npm run dev                          # API di http://localhost:4000

cd ../frontend
npm install
npm run dev                          # UI di http://localhost:5174
```

Halaman yang sudah dipindah ke React: Ringkasan, Stok (tabel), Kas & Pembelian, dan Laporan.
Produksi, Penjualan, Data Master, dan form stok opname masih memakai versi lama di `src/`.
API-nya sudah tersedia, tinggal form-nya.

**Belum ada login.** Nama pencatat hanya dikirim lewat header. Jangan buka API ke internet
sebelum autentikasi dipasang.

## Isi folder

| Folder | Isi |
| --- | --- |
| `backend/` | API baru (Express + Prisma). Engine hitung ada di `backend/src/engine/` |
| `frontend/` | UI baru (React + Vite + Tailwind) |
| `docker-compose.yml` | PostgreSQL untuk development |
| `src/` | Aplikasi lama (HTML, CSS, JS) + `seed.json`, masih dipakai sampai migrasi selesai |
| `data/` | Ekspor database per dokumen (JSON) |
| `scripts/build_seed.py` | Menyusun ulang `src/seed.json` dari `data/` |
| `original/` | File artifact asli, untuk referensi |

## Kerja dengan Claude Code

Buka folder ini di terminal lalu jalankan `claude`. Claude Code otomatis membaca `CLAUDE.md`,
yang berisi struktur kode, model data, dan angka patokan untuk memastikan hitungan tidak berubah.
