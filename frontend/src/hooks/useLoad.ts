import { useEffect, useState } from "react";
import { useAppData } from "../context/AppData";

// Memuat data dari API, otomatis ulang saat deps berubah atau setelah ada simpan.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const { version } = useAppData();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { data, error, loading };
}
