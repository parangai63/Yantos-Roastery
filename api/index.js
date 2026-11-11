// Vercel Serverless Function: seluruh /api/* diarahkan ke sini (lihat vercel.json),
// lalu ditangani app Express di backend. backend/dist dibuat oleh buildCommand
// (`npm run build --prefix backend` = prisma generate + tsc). Lokal tetap pakai
// `npm run dev` di backend/ (src/server.ts), file ini hanya untuk Vercel.
module.exports = require("../backend/dist/app").default;
