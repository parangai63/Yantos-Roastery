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

## Isi folder

| Folder | Isi |
| --- | --- |
| `src/` | Aplikasi (HTML, CSS, JS) + `seed.json` |
| `data/` | Ekspor database per dokumen (JSON) |
| `scripts/build_seed.py` | Menyusun ulang `src/seed.json` dari `data/` |
| `original/` | File artifact asli, untuk referensi |

## Kerja dengan Claude Code

Buka folder ini di terminal lalu jalankan `claude`. Claude Code otomatis membaca `CLAUDE.md`,
yang berisi struktur kode, model data, dan angka patokan untuk memastikan hitungan tidak berubah.
