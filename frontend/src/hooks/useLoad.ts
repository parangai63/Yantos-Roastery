import { useEffect, useState } from "react";
import { useAppData } from "../context/AppData";

// Memuat data dari API, otomatis ulang saat deps berubah atau setelah ada simpan.
// Stale-while-revalidate: bila kombinasi (fungsi, deps) ini pernah dimuat, hasil lama langsung
// ditampilkan sementara versi baru diambil, jadi pindah tab/periode tidak menampilkan layar kosong.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const { version, responseCache } = useAppData();
  const key = fn.toString() + JSON.stringify(deps);
  const [data, setData] = useState<T | null>(() => (responseCache.get(key) as T) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const hit = responseCache.get(key) as T | undefined;
    if (hit !== undefined) setData(hit);
    setLoading(true);
    fn()
      .then((d) => {
        responseCache.set(key, d);
        if (alive) { setData(d); setError(null); }
      })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  return { data, error, loading };
}
