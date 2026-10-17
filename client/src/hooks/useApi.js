import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, get, post, patch, del } from '../api/client';

/* Consistent loading/error handling for every data fetch:
 * const { data, loading, error, reload } = useApi(() => get('/api/videos?category=production')); */
export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.resolve()
      .then(fetcher)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'Something went wrong.');
        setLoading(false);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}

/* Mutation helper with per-action busy + error state (forms, toggles). */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (fn) => {
    setBusy(true);
    setError('');
    try {
      const out = await fn();
      setBusy(false);
      return out;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
      setBusy(false);
      throw e;
    }
  }, []);
  return { busy, error, run, setError };
}

export { get, post, patch, del, ApiError };
