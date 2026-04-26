import { useEffect, useRef, useState } from 'react';
import { fetchAll } from '../lib/espn.js';

const ORDER = { live: 0, upcoming: 1, final: 2 };

/**
 * @param {object} options
 * @param {number} [options.refreshMs] poll interval; only fires when date is null/today
 * @param {string[]} [options.leagues]
 * @param {string|null} [options.date] YYYYMMDD — when set, fetches that day's slate
 *   and disables auto-refresh polling (no need to poll yesterday's box scores).
 */
export function useEspnScoreboard({ refreshMs = 30_000, leagues = ['nfl', 'cfb'], date = null } = {}) {
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
        const all = await fetchAll(leagues, date);
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
    // Only poll when viewing today's slate. Past/future days don't change.
    const t = !date ? setInterval(load, refreshMs) : null;
    return () => { stop = true; if (t) clearInterval(t); };
  }, [refreshMs, leagues.join(','), date]);

  return { games, loading, error, updatedAt };
}
