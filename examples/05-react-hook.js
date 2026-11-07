// Contoh 5: React hook siap pakai untuk memuat JSON dari GitHub.
// Simpan sebagai useCdnJson.js lalu pakai di komponen React Anda.

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "cascadn";

// Satu client dipakai bersama supaya cache-nya ikut terpakai antar komponen.
export const cdnClient = createClient({
  cacheTTL: 5 * 60 * 1000,
  cacheMax: 100,
  timeout: 10_000,
});

/**
 * @param {string | object | null} source URL GitHub atau objek { owner, repo, ref, path }
 * @param {{ enabled?: boolean, ...object }} [options] opsi tambahan untuk fetchJson
 */
export function useCdnJson(source, options = {}) {
  const { enabled = true, ...fetchOptions } = options;

  const [state, setState] = useState({
    data: null,
    loading: Boolean(source) && enabled,
    error: null,
    provider: null,
    cached: false,
  });

  // Dipakai untuk mencegah update state setelah komponen unmount / source berubah.
  const requestId = useRef(0);

  const load = useCallback(
    async (override) => {
      if (!source || !enabled) return;

      const id = ++requestId.current;
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await cdnClient.fetchJson(source, { ...fetchOptions, ...override });
        if (id !== requestId.current) return;
        setState({
          data: result.data,
          loading: false,
          error: null,
          provider: result.provider,
          cached: result.cached,
        });
      } catch (error) {
        if (id !== requestId.current) return;
        setState({ data: null, loading: false, error, provider: null, cached: false });
      }
    },
    // fetchOptions dibuat stabil lewat JSON.stringify agar tidak memicu loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, enabled, JSON.stringify(fetchOptions)],
  );

  useEffect(() => {
    load();
  }, [load]);

  // refetch: paksa ambil ulang dari CDN (lewati cache)
  const refetch = useCallback(() => load({ skipCache: true }), [load]);

  return { ...state, refetch };
}

/* ------------------------------------------------------------------
Contoh pemakaian di komponen:

import { useCdnJson } from "./useCdnJson";

export default function HijaiyahList() {
  const { data, loading, error, provider, refetch } = useCdnJson(
    "https://github.com/dyazincahya/iqro-json/blob/main/hijaiyah-letters.json",
  );

  if (loading) return <p>Memuat...</p>;
  if (error) return <button onClick={refetch}>Gagal memuat, coba lagi</button>;

  return (
    <div>
      <small>Sumber: {provider}</small>
      <ul>
        {data.map((item) => (
          <li key={item.order_id}>
            {item.latin} — {item.arabic}
          </li>
        ))}
      </ul>
    </div>
  );
}
------------------------------------------------------------------ */
