import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchGameSummary } from '../lib/espnSummary.js';
import { fantasyPoints } from '../lib/fantasy.js';

/**
 * Per-game detail page.
 *   Route: /game/:league/:gameId
 *
 * Pulls ESPN's summary endpoint, computes fantasy points (PPR football,
 * DK-style elsewhere) from raw box-score stats. Polls every 30s when the
 * game is live. Mobile-first layout.
 */
export default function GameDetailRoute() {
  const { league, gameId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const s = await fetchGameSummary(league, gameId);
        if (!cancelled) { setData(s); setError(null); }
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // Poll every 30s for live games
    const interval = setInterval(() => {
      if (!data || data.status === 'live') load();
    }, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [league, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build sorted "top fantasy" list across both teams
  const topFantasy = useMemo(() => {
    if (!data?.parsed) return [];
    const all = [];
    for (const team of data.parsed) {
      for (const p of team.players) {
        const fp = fantasyPoints(league, p.stats, { isPitcher: p.isPitcher, isGoalie: p.isGoalie });
        if (fp > 0) all.push({ ...p, fp, teamAbbr: team.teamAbbr });
      }
    }
    return all.sort((a, b) => b.fp - a.fp).slice(0, 5);
  }, [data, league]);

  if (loading) return <section><p style={{ color: 'var(--ink-dim)' }}>Loading game...</p></section>;
  if (error)   return <section><div className="empty">Couldn't load game. <Link to="/scores">Back to scores</Link></div></section>;
  if (!data)   return <section><div className="empty">Game not found.</div></section>;

  const { home, away } = data;

  return (
    <section className="gd">
      <Link to="/scores" className="gd-back">← Back to scores</Link>

      {/* Game header */}
      <div className="gd-header">
        <div className="gd-team gd-away">
          <span className={'lg-badge ' + league}>{league.toUpperCase()}</span>
          <div className="gd-team-name">{away.name}</div>
          <div className="gd-team-record">{away.record}</div>
          <div className="gd-team-score">{away.score}</div>
        </div>
        <div className="gd-status">
          <div className="gd-status-line">{statusLabel(data)}</div>
          {data.status === 'live' && <div className="gd-live-dot">● LIVE</div>}
        </div>
        <div className="gd-team gd-home">
          <span className={'lg-badge ' + league}>{league.toUpperCase()}</span>
          <div className="gd-team-name">{home.name}</div>
          <div className="gd-team-record">{home.record}</div>
          <div className="gd-team-score">{home.score}</div>
        </div>
      </div>

      {/* Top fantasy performers (live or final) */}
      {topFantasy.length > 0 && (
        <div className="gd-section">
          <h3 className="gd-h3">
            {data.status === 'live' ? 'Live Fantasy Leaders' : 'Top Fantasy Performers'}
          </h3>
          <div className="gd-fantasy-grid">
            {topFantasy.map((p, i) => (
              <div key={p.id} className="gd-fantasy-card">
                <div className="gd-fantasy-rank">{i + 1}</div>
                <div className="gd-fantasy-body">
                  <div className="gd-fantasy-name">{p.name}</div>
                  <div className="gd-fantasy-meta">{p.position || '—'} · {p.teamAbbr}</div>
                  <div className="gd-fantasy-line">{statLine(league, p)}</div>
                </div>
                <div className="gd-fantasy-pts">
                  <span>{p.fp.toFixed(1)}</span>
                  <em>FP</em>
                </div>
              </div>
            ))}
          </div>
          <p className="gd-fantasy-note">
            PPR for football · DK-style scoring elsewhere · computed live from ESPN box score
          </p>
        </div>
      )}

      {/* Per-team player tables */}
      {data.parsed.map((team) => (
        <div key={team.teamId} className="gd-section">
          <h3 className="gd-h3">{team.teamAbbr} player stats</h3>
          {team.players.length === 0 ? (
            <p style={{ color: 'var(--ink-dim)', fontSize: 13 }}>No player stats yet.</p>
          ) : (
            <div className="gd-player-list">
              {team.players
                .map((p) => ({ ...p, fp: fantasyPoints(league, p.stats, { isPitcher: p.isPitcher, isGoalie: p.isGoalie }) }))
                .sort((a, b) => b.fp - a.fp)
                .filter((p) => p.fp > 0 || hasAnyStat(p.stats))
                .map((p) => (
                  <div key={p.id} className="gd-player-row">
                    <div className="gd-player-info">
                      <strong>{p.name}</strong>
                      <span className="gd-player-pos">{p.position || ''}</span>
                    </div>
                    <div className="gd-player-stats">{statLine(league, p)}</div>
                    <div className="gd-player-fp">{p.fp.toFixed(1)}</div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function statusLabel(data) {
  if (data.status === 'final') return 'FINAL';
  if (data.status === 'live')  return data.statusText || `${data.clock || ''} · Q${data.period || ''}`;
  // upcoming
  if (data.date) {
    return new Date(data.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  return 'Scheduled';
}

function hasAnyStat(stats) {
  if (!stats) return false;
  return Object.values(stats).some((v) => Number(v) > 0);
}

function statLine(league, p) {
  const s = p.stats || {};
  if (league === 'nfl' || league === 'cfb') {
    const parts = [];
    if (s.passYds || s.passTd) parts.push(`${s.passYds || 0} pass yds, ${s.passTd || 0} TD`);
    if (s.rushYds || s.rushTd) parts.push(`${s.rushYds || 0} rush yds, ${s.rushTd || 0} TD`);
    if (s.rec || s.recYds)     parts.push(`${s.rec || 0} rec, ${s.recYds || 0} yds, ${s.recTd || 0} TD`);
    return parts.join(' · ') || '—';
  }
  if (league === 'mlb') {
    if (p.isPitcher) return `${s.ip || 0} IP, ${s.k || 0} K, ${s.er || 0} ER`;
    const hits = (s.singles || 0) + (s.doubles || 0) + (s.triples || 0) + (s.hr || 0);
    return `${hits}-for-?, ${s.r || 0} R, ${s.rbi || 0} RBI, ${s.hr || 0} HR`;
  }
  if (league === 'nba') {
    return `${s.pts || 0} PTS · ${s.reb || 0} REB · ${s.ast || 0} AST`;
  }
  if (league === 'nhl') {
    if (p.isGoalie) return `${s.sv || 0} SV · ${s.ga || 0} GA`;
    return `${s.g || 0}G · ${s.a || 0}A · ${s.sog || 0} SOG`;
  }
  return '—';
}
