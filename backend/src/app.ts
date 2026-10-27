import express from "express";
import cors from "cors";
import masterRoutes from "./routes/masterRoutes";
import ledgerRoutes from "./routes/ledgerRoutes";
import reportRoutes from "./routes/reportRoutes";
import { actorMiddleware } from "./middleware/actor";
import { errorHandler } from "./lib/httpError";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(actorMiddleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "yantos-roastery-backend" });
});

app.use("/api", masterRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/reports", reportRoutes);

app.use(errorHandler);

export default app;
