import dotenv from "dotenv";
dotenv.config();

import app from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
  console.log(`Yantos Roastery backend running on http://localhost:${PORT}`);
});
