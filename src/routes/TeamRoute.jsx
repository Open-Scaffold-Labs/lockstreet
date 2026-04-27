import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

/**
 * Team profile page. URL: /team/:league/:teamId
 *
 *   - Hero: logo, city + name, record, division standing
 *   - Quick stats: Last 10 SU, Off Rank, Def Rank, PPG, Opp PPG (from /api/team-intel)
 *   - Tabs: Schedule, News, Injuries
 *
 * Phase 1 — schedule has W/L + score, no spreads yet (ScoresAndOdds-derived
 * spread/ATS detail is Phase 2). News from RSS via /api/team-news.
 */
export default function TeamRoute() {
  const { league, teamId } = useParams();
  const [team, setTeam]       = useState(null);  // ESPN team meta
  const [intel, setIntel]     = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [news, setNews]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('schedule');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await fetchTeamMeta(league, teamId);
        if (cancelled) return;
        setTeam(meta);

        // In parallel: schedule, intel, news
        const teamCity = meta?.location || '';
        const teamName = meta?.name     || '';
        const [intelRes, schedRes, newsRes] = await Promise.all([
          fetch(`/api/team-intel?league=${league}&teamId=${teamId}&teamAbbr=${meta?.abbreviation || ''}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/team-schedule?league=${league}&teamId=${teamId}`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/team-news?league=${league}&teamName=${encodeURIComponent(teamName)}&teamCity=${encodeURIComponent(teamCity)}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (cancelled) return;
        setIntel(intelRes);
        setSchedule(schedRes);
        setNews(newsRes?.items || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [league, teamId]);

  if (loading && !team) {
    return <section><p style={{ color: 'var(--ink-dim)' }}>Loading team...</p></section>;
  }
  if (!team) {
    return <section><div className="empty">Couldn't load team. <Link to="/scores">Back to scores</Link></div></section>;
  }

  const completedGames = (schedule?.events || []).filter((e) => e.completed);
  const upcomingGames  = (schedule?.events || []).filter((e) => !e.completed)
                                                  .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <section className="tm">
      <Link to="/scores" className="gd-back">← Back to scores</Link>

      <div className="tm-hero">
        {team.logos?.[0]?.href && <img src={team.logos[0].href} alt="" className="tm-hero-logo" />}
        <div className="tm-hero-text">
          <div className="tm-hero-eyebrow">{league.toUpperCase()}</div>
          <h2 className="tm-hero-name">{team.displayName}</h2>
          {team.recordSummary && <div className="tm-hero-record">{team.recordSummary}</div>}
          {team.standingSummary && <div className="tm-hero-standing">{team.standingSummary}</div>}
        </div>
      </div>

      {/* Quick stats — pulled from team-intel proxy */}
      {intel && (
        <div className="tm-stats">
          <Stat k="Last 10 SU" v={intel.last10 ? `${intel.last10.wins}-${intel.last10.losses}${intel.last10.pushes ? `-${intel.last10.pushes}` : ''}` : '—'} />
          <Stat k="Off Rank"   v={intel.offRank ? `#${intel.offRank}` : '—'} sub={intel.offValue ? `${intel.offValue} ${intel.offLabel || ''}` : ''} />
          <Stat k="Def Rank"   v={intel.defRank ? `#${intel.defRank}` : '—'} sub={intel.defValue ? `${intel.defValue} ${intel.defLabel || ''}` : ''} />
          <Stat k="Source"     v={intel.source || '—'} />
        </div>
      )}

      {/* Tabs */}
      <nav className="tm-tabs" role="tablist">
        {['schedule', 'news', 'upcoming'].map((t) => (
          <button key={t} className={'tm-tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
            {t === 'schedule' ? 'Recent Games' : t === 'news' ? 'News' : 'Upcoming'}
          </button>
        ))}
      </nav>

      {tab === 'schedule' && (
        <ScheduleTable events={completedGames.slice(0, 30)} />
      )}
      {tab === 'upcoming' && (
        upcomingGames.length === 0
          ? <div className="empty">No upcoming games on the schedule.</div>
          : <ScheduleTable events={upcomingGames.slice(0, 20)} upcoming />
      )}
      {tab === 'news' && (
        news.length === 0
          ? <div className="empty">No team-specific news in the latest feed.</div>
          : <NewsList items={news} />
      )}
    </section>
  );
}

function Stat({ k, v, sub }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v gold">{v}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

function ScheduleTable({ events, upcoming = false }) {
  if (!events?.length) return <div className="empty">No games to show.</div>;
  return (
    <div className="tm-sched">
      {events.map((e) => {
        const dt = new Date(e.date);
        const dateLabel = dt.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
        const homeAwayMark = e.homeAway === 'away' ? '@' : 'vs';
        const resultClass = e.result === 'W' ? 'win' : e.result === 'L' ? 'loss' : '';
        return (
          <div key={e.id} className="tm-sched-row">
            <div className="tm-sched-date">{dateLabel}</div>
            <div className="tm-sched-opp">
              {e.opp.logo && <img src={e.opp.logo} alt="" className="tm-sched-opp-logo" />}
              <span className="tm-sched-vs">{homeAwayMark}</span>
              <strong>{e.opp.abbr || e.opp.name}</strong>
            </div>
            {upcoming ? (
              <div className="tm-sched-time">
                {dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
            ) : (
              <>
                <div className={`tm-sched-result ${resultClass}`}>{e.result || '—'}</div>
                <div className="tm-sched-score">
                  {e.score ? `${e.score.us}–${e.score.them}` : '—'}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NewsList({ items }) {
  return (
    <div className="tm-news">
      {items.map((it, i) => (
        <a
          key={(it.link || '') + i}
          href={it.link}
          target="_blank"
          rel="noopener noreferrer"
          className="tm-news-card"
        >
          {it.image && <img src={it.image} alt="" className="tm-news-img" />}
          <div className="tm-news-body">
            <div className="tm-news-meta">
              <span className="tm-news-source">via {it.source || 'ESPN'}</span>
              {it.publishedAt && <span className="tm-news-date">{new Date(it.publishedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
            </div>
            <div className="tm-news-title">{it.title}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * Hit ESPN's team endpoint for meta (logo, displayName, record, standing).
 * Returns the team object directly.
 */
async function fetchTeamMeta(league, teamId) {
  const SPORT = {
    nfl: 'football/nfl',
    cfb: 'football/college-football',
    mlb: 'baseball/mlb',
    nba: 'basketball/nba',
    nhl: 'hockey/nhl',
  }[league];
  if (!SPORT) return null;
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${SPORT}/teams/${teamId}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const t = j?.team || {};
    return {
      id:               t.id,
      name:             t.name,
      location:         t.location,
      displayName:      t.displayName,
      abbreviation:     t.abbreviation,
      color:            t.color,
      logos:            t.logos,
      recordSummary:    t.record?.items?.[0]?.summary || null,
      standingSummary:  t.standingSummary || null,
    };
  } catch { return null; }
}
