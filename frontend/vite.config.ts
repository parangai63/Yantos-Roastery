import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Baca .env, .env.[mode], dst. dari folder frontend (lihat .env.example).
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const target = env.VITE_API_PROXY_TARGET || "http://localhost:4000";

  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        // changeOrigin: perlu bila target adalah domain lain (mis. backend di Vercel).
        "/api": { target, changeOrigin: true, secure: true },
      },
    },
  };
});
