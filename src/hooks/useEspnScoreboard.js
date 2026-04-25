import { useEffect, useRef, useState } from 'react';
import { fetchAll } from '../lib/espn.js';

const ORDER = { live: 0, upcoming: 1, final: 2 };

export function useEspnScoreboard({ refreshMs = 30_000 } = {}) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const all = await fetchAll();
        if (stop || !mounted.current) return;
        const sorted = all.slice().sort((a, b) => {
          const s = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
          if (s !== 0) return s;
          return new Date(a.kickoff) - new Date(b.kickoff);
        });
        setGames(sorted);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (!mounted.current) return;
        setError(e);
      } finally {
        if (mounted.current) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, refreshMs);
    return () => { stop = true; clearInterval(t); };
  }, [refreshMs]);

  return { games, loading, error, updatedAt };
}
