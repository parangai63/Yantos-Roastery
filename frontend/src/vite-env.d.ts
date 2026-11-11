/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Alamat backend tanpa "/" di akhir; kosong = pakai /api di domain yang sama (proxy/rewrite). */
  readonly VITE_API_URL?: string;
  /** Tujuan proxy /api saat `npm run dev` (dibaca vite.config.ts). */
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
