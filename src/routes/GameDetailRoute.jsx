import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchGameSummary } from '../lib/espnSummary.js';
import { fantasyPoints } from '../lib/fantasy.js';

/**
 * Hit our /api/team-intel proxy which fans out to the best free per-sport
 * source (NBA Stats / MLB Stats API / NHL API / ESPN). Returns a unified
 * shape with offRank / defRank / last10. Server-side caches 6 hours.
 */
async function fetchTeamIntel(league, teamId, teamAbbr) {
  const params = new URLSearchParams({ league });
  if (teamId) params.set('teamId', teamId);
  if (teamAbbr) params.set('teamAbbr', teamAbbr);
  try {
    const r = await fetch(`/api/team-intel?${params}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

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
  const [teamStats, setTeamStats] = useState({ home: null, away: null });

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

  // Once we have summary data, pull each team's intel in parallel via our
  // /api/team-intel proxy (sport-specific free APIs). Best-effort — failures
  // fall back to '—' in the UI.
  useEffect(() => {
    if (!data?.away?.id || !data?.home?.id) return;
    let cancelled = false;
    Promise.all([
      fetchTeamIntel(league, data.away.id, data.away.abbr),
      fetchTeamIntel(league, data.home.id, data.home.abbr),
    ]).then(([away, home]) => {
      if (!cancelled) setTeamStats({ away, home });
    });
    return () => { cancelled = true; };
  }, [league, data?.away?.id, data?.home?.id, data?.away?.abbr, data?.home?.abbr]);

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

      {/* Game header — team logo + name links to that team's profile page */}
      <div className="gd-header">
        <Link to={`/team/${league}/${away.id}`} className="gd-team gd-away gd-team-link">
          {away.logo && <img src={away.logo} alt="" className="gd-team-logo" />}
          <div className="gd-team-name">{away.name}</div>
          <div className="gd-team-record">{away.record}</div>
          <div className="gd-team-score">{away.score}</div>
        </Link>
        <div className="gd-status">
          <div className="gd-status-line">{statusLabel(data)}</div>
          {data.status === 'live' && <div className="gd-live-dot">● LIVE</div>}
        </div>
        <Link to={`/team/${league}/${home.id}`} className="gd-team gd-home gd-team-link">
          {home.logo && <img src={home.logo} alt="" className="gd-team-logo" />}
          <div className="gd-team-name">{home.name}</div>
          <div className="gd-team-record">{home.record}</div>
          <div className="gd-team-score">{home.score}</div>
        </Link>
      </div>

      {/* Live Play Tracker — only while the game is in progress and ESPN
          is shipping plays. Sits ABOVE team stats so the most actionable
          info (current state of the game) is the first thing the user sees
          after the header. Auto-refreshes via the 30s polling above. */}
      {data.status === 'live' && data.recentPlays?.length > 0 && (
        <div className="gd-section">
          <h3 className="gd-h3">Live Play Tracker</h3>
          <div className="gd-plays">
            {data.recentPlays.map((p) => (
              <div key={p.id} className={'gd-play' + (p.scoringPlay ? ' scoring' : '')}>
                <div className="gd-play-time">
                  {p.period ? `Q${p.period}` : ''}{p.period && p.clock ? ' ' : ''}{p.clock}
                </div>
                <div className="gd-play-text">{p.text}</div>
                {(p.awayScore != null && p.homeScore != null) && (
                  <div className="gd-play-score">{p.awayScore}–{p.homeScore}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-side team preview: last-5 SU record + injuries.
          Always rendered when ESPN provides any of the data — works for
          upcoming games (when boxscore is empty) and pre-game research. */}
      {(away.lastFive || home.lastFive || away.injuries.length || home.injuries.length) && (
        <div className="gd-preview-grid">
          <TeamPreview side={away} label="AWAY" stats={teamStats.away} />
          <TeamPreview side={home} label="HOME" stats={teamStats.home} />
        </div>
      )}

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

/**
 * Side-by-side team preview block: recent record (last 5 SU from ESPN
 * summary) and injury list. Shown for upcoming games as pre-game research
 * and remains visible during live/final games. ESPN's summary endpoint
 * doesn't reliably ship offensive/defensive league rank or 10-game ATS
 * record — those would need separate team-stats fetches and are noted as
 * "—" for now.
 */
function TeamPreview({ side, label, stats }) {
  const injuries = side.injuries || [];
  // Prefer the proxy's last10 (real number from sport-specific APIs);
  // fall back to ESPN summary's last5 if proxy hasn't responded yet.
  const last10 = stats?.last10;
  const last5 = side.lastFive;
  const recentLine = last10
    ? `${last10.wins}-${last10.losses}${last10.pushes ? `-${last10.pushes}` : ''}`
    : last5 ? `${last5.wins}-${last5.losses}` : '—';
  const recentLabel = last10 ? 'Last 10 SU' : 'Last 5 SU';
  const offRank = stats?.offRank ? `#${stats.offRank}` : '—';
  const defRank = stats?.defRank ? `#${stats.defRank}` : '—';

  return (
    <div className="gd-preview-team">
      <div className="gd-preview-head">
        {side.logo && <img src={side.logo} alt="" className="gd-preview-logo" />}
        <div>
          <div className="gd-preview-side">{label}</div>
          <div className="gd-preview-team-name">{side.abbr}</div>
        </div>
      </div>

      <div className="gd-preview-stat-row">
        <div className="gd-preview-stat">
          <div className="gd-preview-label">{recentLabel}</div>
          <div className="gd-preview-value">{recentLine}</div>
        </div>
        <div className="gd-preview-stat">
          <div className="gd-preview-label">Last 10 ATS</div>
          <div className="gd-preview-value gd-preview-muted">—</div>
        </div>
      </div>

      <div className="gd-preview-stat-row">
        <div className="gd-preview-stat">
          <div className="gd-preview-label">Off Rank</div>
          <div className={'gd-preview-value' + (stats?.offRank ? '' : ' gd-preview-muted')}>{offRank}</div>
          {stats?.offValue && <div className="gd-preview-substat">{stats.offValue} {stats.offLabel || ''}</div>}
        </div>
        <div className="gd-preview-stat">
          <div className="gd-preview-label">Def Rank</div>
          <div className={'gd-preview-value' + (stats?.defRank ? '' : ' gd-preview-muted')}>{defRank}</div>
          {stats?.defValue && <div className="gd-preview-substat">{stats.defValue} {stats.defLabel || ''}</div>}
        </div>
      </div>

      <div className="gd-preview-stat">
        <div className="gd-preview-label">Injuries</div>
        {injuries.length === 0 ? (
          <div className="gd-preview-value gd-preview-muted">None reported</div>
        ) : (
          <ul className="gd-injuries">
            {injuries.slice(0, 6).map((inj, i) => (
              <li key={i}>
                <strong>{inj.name}</strong>
                {inj.position ? <span className="gd-injury-pos"> {inj.position}</span> : null}
                <span className="gd-injury-status"> · {inj.status || 'unknown'}</span>
              </li>
            ))}
            {injuries.length > 6 && (
              <li className="gd-preview-muted">+{injuries.length - 6} more</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function statusLabel(data) {
  if (data.status === 'final') return 'FINAL';
  if (data.status === 'live') {
    const lg = data.league;
    // Baseball has no clock — surface ESPN's text ("Top 7th") directly.
    if (lg === 'mlb') return data.statusText || 'LIVE';
    // Hockey: P1 / P2 / P3 / OT.
    if (lg === 'nhl') {
      if (data.clock && data.period) return `P${data.period} · ${data.clock}`;
      return data.statusText || 'LIVE';
    }
    // NBA / NFL / CFB — quarter + clock.
    if (data.clock && data.period) return `Q${data.period} · ${data.clock}`;
    return data.statusText || 'LIVE';
  }
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
