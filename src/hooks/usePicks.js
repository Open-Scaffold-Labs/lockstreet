import { useEffect, useState, useCallback } from 'react';

/**
 * Loads picks from /api/picks (backed by Vercel KV).
 * Returns { picksByGameId: { [espnEventId]: { side, units, scheduledFor } } }
 */
export function usePicks() {
  const [picks, setPicks] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/picks', { cache: 'no-store' });
      if (!res.ok) throw new Error(`picks ${res.status}`);
      const list = await res.json();
      const byId = {};
      (list.picks || []).forEach((p) => { byId[p.gameId] = p; });
      setPicks(byId);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { picks, loading, error, reload: load };
}
