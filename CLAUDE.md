# CLAUDE.md — Yantos Roastery

Panduan untuk Claude Code saat bekerja di repo ini. Bahasa UI dan data: Indonesia.

## Apa ini

Aplikasi web satu halaman untuk inventory dan keuangan roastery kopi Yantos:
green bean → roasting → roasted / blend → dikemas → dijual, plus buku kas bulanan.
Awalnya dibangun sebagai artifact di claude.ai, lalu diekspor ke repo ini pada 20 Okt 2026.

Tidak ada build step, framework, atau dependency. HTML + CSS + JavaScript biasa.

## Struktur

```
src/
  index.html       kerangka halaman (markup + <script>)
  styles.css       semua gaya; token warna di :root, mode gelap via prefers-color-scheme
  app.js           seluruh logika: helper, mesin hitung stok/HPP, view per tab, penyimpanan
  claude-shim.js   pengganti lokal untuk runtime artifact Claude (window.claude.use)
  seed.json        isi database saat ekspor (dipakai shim sebagai data awal)
data/              ekspor mentah per dokumen dari database artifact (sumber seed.json)
scripts/
  build_seed.py    gabungkan data/ → src/seed.json
original/          file artifact asli satu halaman, untuk referensi saja (jangan diedit)
```

## Menjalankan

```
cd src && python3 -m http.server 8000
# buka http://localhost:8000          (?reset=1 untuk memuat ulang dari seed.json)
```

Harus lewat server, bukan file://, karena shim mengambil `seed.json` dengan fetch.

## Peta app.js

Bagian dipisah komentar `/* ===== nama ===== */`, urutannya:
helpers → vocab (kategori dari Excel) → state → engine → describe → writes →
UI basics → shell → views (satu objek per tab di `VIEWS`) → global events → data.

- `compute()` di bagian engine adalah inti: memutar ulang semua entri ledger berurutan
  tanggal dan menghasilkan stok, nilai stok (rata-rata tertimbang), ringkasan bulanan, piutang.
  Semua angka di UI berasal dari sini. Jangan simpan hasil hitungan ke database.
- Tiap tab = `VIEWS.<nama>` dengan `html()`, `bind()`, `refresh()`.
- Penyimpanan hanya lewat `addEntry`, `patchEntry`, `saveDoc`, `updDoc` di bagian writes.

## Model data (database artifact)

Koleksi master (satu dokumen per item, id berawalan):
- `greens/g_*`   green bean: name, category, price (/kg), minKg, minRoastedKg, supplier, active
- `blends/b_*`   blend: name, cogs (/kg), minKg, recipe [], active
- `packs/p_*`    kemasan: name, unit, price, minQty, active
- `products/pr_*` daftar harga jual: name, kind (`roasted`|`blend`), beanId, grams, price, group, packId
- `config/main`  bizName, basis, routine (payment rutin), shares (Dana Yayasan 2,5%, Pak Munir 40%), savingPct, savingMin

Transaksi: `ledger/<YYYY-MM>` (dipecah `_2`, `_3` bila >200 KB) berisi map `entries`:
`{ [entryId]: { type, date, by, at, ...field per type } }`. Entri tidak pernah dihapus fisik;
hapus = `deleted: true`. Jenis `type`:
`opening` (saldo stok awal), `green_in`, `pack_in`, `roast`, `blend` (racik), `usage` (stok keluar),
`adjust` (opname), `sale`, `kas` (buku kas: dir in/out, category, desc, amount).

Saat ekspor: 97 entri `kas` (Mar–Okt 2026) dan 55 entri `opening` (saldo stok per 13 Okt).

## Runtime: claude-shim.js

`app.js` memanggil `window.claude.use('db' | 'user' | 'downloads')`. Di claude.ai itu disediakan
platform; di sini shim meniru API yang dipakai:
- `db.collection(name).onSnapshot(cb)` → `{ docs: [{ id, data() }] }`
- `db.doc('koleksi/id')` → `get`, `set`, `update` (merge rekursif objek, `{__delete__:true}` menghapus field), `onSnapshot`, `acquire`
- `user.id()`, `user.can()`, `user.profiles(ids)`; `downloads.save({ filename, data })`

Shim menyimpan ke localStorage (satu browser saja). **Bukan untuk produksi.**

### Mengganti shim dengan backend

Cara paling sedikit mengubah `app.js`: tulis implementasi baru dengan API yang sama
(di atas) yang memanggil REST API / Supabase / Firebase, lalu ganti `<script src="claude-shim.js">`.
`onSnapshot` boleh diimplementasi dengan polling atau realtime subscription.
Kalau digabung ke Parang-ops (React + Express + PostgreSQL), lebih baik pindahkan
`compute()` ke backend atau modul TypeScript terpisah dan petakan koleksi di atas ke tabel.

## Versi baru: backend/ + frontend/ (migrasi berjalan)

Stack sama dengan parang-ops (Express + Prisma + PostgreSQL, React + Vite + Tailwind),
dengan beberapa perbedaan yang disengaja: logika bisnis di `services/` (bukan di controller),
navigasi pakai react-router, dan desain ledger dipertahankan.

```
backend/
  prisma/schema.prisma   GreenBean, Blend(+BlendRecipeItem), Pack, Product, Config, LedgerEntry
  prisma/seed.ts         isi DB dari data/ (pakai src/lib/legacyExport.ts)
  src/engine/            compute.ts (port compute() lama), types.ts, vocab.ts, compute.test.ts
  src/services/          stateService (muat DB → engine), ledgerService (validasi & tulis),
                         masterService, reportService (laporan siap tampil)
  src/controllers/, src/routes/   tipis; /api/master, /api/config, /api/meta, /api/ledger, /api/reports/*
frontend/src/
  api/, types/, utils/   format.ts (rp, nf, dLabel…), ledger.ts (describe() lama)
  context/AppData.tsx    master + periode; panggil changed() setelah simpan agar laporan dimuat ulang
  pages/                 satu halaman per tab lama
```

- `LedgerEntry`: kolom umum (`type`, `date` string YYYY-MM-DD, `at`, `by`, `deleted`) +
  `data` JSON berisi field per jenis. Engine membaca bentuk datar lewat `lib/mappers.ts`.
- Stok, HPP, kas tetap **tidak disimpan**; `stateService.loadState()` menghitung ulang per request.
- Penjualan: klien hanya kirim `productId`, `qty`, `price`; detail item diambil server dari daftar harga.
- Semua tab lama sudah diport ke React. Acuan tampilan & perilaku: `original/yantos-roastery-artifact.html`
  (kelas CSS di `frontend/src/index.css` disalin dari sana). Stok & biaya per item untuk hitungan
  langsung di form diambil dari `GET /api/reports/costs` lewat `useAppData().qty/cost/productCost`.
- Supabase: `DATABASE_URL` lewat pooler 6543 (`?pgbouncer=true`), `DIRECT_URL` lewat 5432 untuk migrate.
- Belum ada autentikasi (header `X-Actor` hanya mengisi `by`).
- Setelah mengubah engine: `cd backend && npm test`. Test memakai data/ langsung, tanpa DB.

## Angka patokan (harus tetap sama setelah refactor)

Dengan `seed.json` bawaan, periode Oktober 2026:
- Saldo kas: Rp 15.660.539
- Pemasukan Okt: Rp 27.487.584 · Pengeluaran Okt: Rp 10.440.726 · Laba Okt: Rp 17.046.858
- Nilai stok: Rp 51.838.554 (green 35,5 jt · roasted 13,9 jt · blend 2,3 jt)

Nilai stok roasted memakai modal (COGS), bukan harga jual seperti di Excel lama.

## Catatan terbuka dari pemilik

- Berry Nebula vs Berry Nebula V.2, Nirmala Blend vs Nirmala Lestari: belum dipastikan sama atau beda.
  Berry Nebula dan Nirmala Blend belum punya COGS.
- Kemasan belum dihubungkan ke produk (`products.packId` kosong), jadi stok kemasan belum terpotong saat jual.

## Aturan kerja

- Data asli keuangan: repo harus **private**. Jangan commit kredensial.
- Format rupiah dan tanggal Indonesia (`Intl.NumberFormat('id-ID')`), sudah ada helper `rp`, `nf`, `dLabel`.
- Setelah mengubah engine, cek ulang angka patokan di atas di browser.
