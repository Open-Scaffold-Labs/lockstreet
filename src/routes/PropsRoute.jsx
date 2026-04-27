import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TeamOrb from '../components/TeamOrb.jsx';

/**
 * /props (rebranded as HEAT CHECK).
 *
 * Lists every team currently covering the spread on >= 7 of their last
 * 10 games (per the public_betting last_10_ats_pct fields). Sorted hot
 * to cold; ties broken alphabetically. Powered by /api/team-intel
 * ?op=heat-check (cached 30 min server-side).
 */

const LEAGUE_ORDER = ['nba', 'nhl', 'mlb', 'nfl', 'cfb'];

function espnLogoUrl(league, abbr) {
  if (!league || !abbr) return null;
  const lg = league.toLowerCase();
  const espnLg = lg === 'cfb' ? 'ncaa' : lg;
  return `https://a.espncdn.com/i/teamlogos/${espnLg}/500/${abbr.toLowerCase()}.png`;
}

function useHeatCheck() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const r = await fetch('/api/team-intel?op=heat-check');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!cancel) setTeams(j?.teams || []);
      } catch (e) {
        if (!cancel) setError(String(e.message || e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  return { teams, loading, error };
}

export default function PropsRoute() {
  const { teams, loading, error } = useHeatCheck();
  const [leagueFilter, setLeagueFilter] = useState('all');

  const filtered = useMemo(() => {
    if (leagueFilter === 'all') return teams;
    return teams.filter((t) => t.league === leagueFilter);
  }, [teams, leagueFilter]);

  return (
    <section className="lines-section">
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Heat Check</div>
          <div className="trc-final">
            {filtered.length}<span className="trc-final-sub">
              {' '}team{filtered.length === 1 ? '' : 's'} covering 7+ of last 10
            </span>
          </div>
        </div>
        <div className="filter">
          <button className={leagueFilter === 'all' ? 'active' : ''} onClick={() => setLeagueFilter('all')}>ALL</button>
          {LEAGUE_ORDER.map((lg) => (
            <button key={lg} className={leagueFilter === lg ? 'active' : ''} onClick={() => setLeagueFilter(lg)}>
              {lg.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: 'var(--ink-dim)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--ink-dim)' }}>Couldn't load Heat Check ({error}).</p>}
      {!loading && filtered.length === 0 && (
        <div className="empty">
          No teams currently covering 7+ of their last 10 in this view.
        </div>
      )}

      <div className="hc-grid">
        {filtered.map((t, i) => <HeatRow key={`${t.league}-${t.abbr}`} t={t} rank={i + 1} />)}
      </div>

      <p className="footnote-disclaimer" style={{ maxWidth: 600 }}>
        Hot list refreshes once daily, ranked by last-10 ATS. Not betting advice.
        <br />21+. Bet responsibly. 1-800-GAMBLER.
      </p>
    </section>
  );
}

function HeatRow({ t, rank }) {
  const logo = espnLogoUrl(t.league, t.abbr);
  return (
    <Link to={`/team/${t.league}/${t.abbr}`} className="hc-row">
      <div className="hc-rank">#{rank}</div>
      <div className="hc-orb"><TeamOrb team={{ abbr: t.abbr, logo }} /></div>
      <div className="hc-meta">
        <div className="hc-abbr tabbr">{t.abbr}</div>
        <div className="hc-league">{t.league.toUpperCase()}</div>
      </div>
      <div className="hc-stat">
        <div className="hc-pct">{Math.round(t.atsPct)}%</div>
        <div className="hc-record">{t.record} ATS · L10</div>
      </div>
    </Link>
  );
}
