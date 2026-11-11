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

### Login (PIN 4 angka, seperti parang-ops)

Aplikasi dibuka dengan PIN 4 angka tanpa memilih nama (`POST /api/auth/verify-pin`). Server
membalas token sesi (12 jam) yang dikirim otomatis di setiap request `/api`
(`frontend/src/api/authInterceptor.ts`). Layar terkunci lagi setelah 5 menit diam atau lewat tombol
**Kunci**. Setelah 5 PIN salah, alamat itu dikunci 15 menit. PIN disimpan sebagai hash dan harus
unik antar akun.

Akun pertama dibuat dari terminal (setelah `npx prisma migrate deploy`):

```
cd backend
npm run user -- create "Nama Admin" 1234 admin
npm run user -- list
npm run user -- reset-pin "Nama" 5678
```

Admin juga bisa mengelola akun lewat API `/api/users` (belum ada halaman UI-nya).

## Deploy ke Vercel

Dua project Vercel dari repo yang sama:

| Project | Root Directory | Domain |
| --- | --- | --- |
| `backend-yantos-roastery` | `backend` | backend-yantos-roastery.vercel.app (Express, dideteksi otomatis) |
| `yantos-roastery` | `frontend` | yantos-roastery.vercel.app (Vite) |

`frontend/vercel.json` meneruskan `/api/*` ke domain backend, jadi browser tetap memanggil
domain frontend sendiri (tanpa CORS) dan `VITE_API_URL` dibiarkan kosong. Jangan taruh
`vercel.json` di root repo: perintah `cd backend` di dalamnya gagal karena build sudah berjalan
di dalam `backend/` atau `frontend/`.

1. Backend → Settings → Environment Variables: `DATABASE_URL` (pooler 6543,
   `?pgbouncer=true&connection_limit=1`), `DIRECT_URL` (5432), `TRUST_PROXY=1`.
   `DATABASE_URL` dan `DIRECT_URL` wajib; tanpa itu semua endpoint membalas 500.
2. Migrasi & akun dijalankan dari komputer sendiri: `cd backend && npm run db:deploy`,
   lalu `npm run user -- create "Nama" 1234 admin`.

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
