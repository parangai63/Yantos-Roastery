import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import masterRoutes from "./routes/masterRoutes";
import configRoutes from "./routes/configRoutes";
import ledgerRoutes from "./routes/ledgerRoutes";
import reportRoutes from "./routes/reportRoutes";
import { requireAuth } from "./middleware/auth";
import { errorHandler } from "./lib/httpError";

const app = express();

app.disable("x-powered-by");
// Di belakang reverse proxy (Vercel, Nginx, dll.) set TRUST_PROXY=1 supaya req.ip
// (dipakai batas percobaan PIN) berisi IP klien, bukan IP proxy.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
// Token dikirim lewat header Authorization (bukan cookie), jadi CORS terbuka tidak membuka sesi
// ke situs lain. Batasi lewat CORS_ORIGIN bila frontend sudah punya domain tetap.
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) } : undefined));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "yantos-roastery-backend" });
});

// /api/auth/status & /api/auth/verify-pin terbuka; sisanya di authRoutes memasang requireAuth sendiri.
app.use("/api/auth", authRoutes);

// Semua /api di bawah ini wajib login.
app.use("/api", requireAuth);
app.use("/api/users", userRoutes);
app.use("/api/master", masterRoutes);
app.use("/api/config", configRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/reports", reportRoutes);

// Fallback 404
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use(errorHandler);

export default app;
