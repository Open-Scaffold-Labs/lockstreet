import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';
import { usePicks } from '../hooks/usePicks.js';
import { useSubscription } from '../hooks/useSubscription.js';
import { isFootballOffSeason, nextSeasonStart, daysUntil } from '../lib/offseason.js';
import GameCard from '../components/GameCard.jsx';
import { SkeletonCardGrid } from '../components/Skeleton.jsx';

// Closed picks linger on /picks for 6 days after the game graded, then drop off.
const CLOSED_TTL_MS = 6 * 24 * 60 * 60 * 1000;

function isOpen(p)   { return p.result === 'pending'; }
function isClosed(p) {
  if (p.result === 'pending') return false;
  if (!p.gradedAt) return true; // graded with no timestamp -- keep showing for now
  return Date.now() - new Date(p.gradedAt).getTime() < CLOSED_TTL_MS;
}

export default function PicksRoute() {
  const { games, loading } = useEspnScoreboard();
  const { picks, loading: picksLoading } = usePicks();
  const sub = useSubscription();

  const [view, setView] = useState('open'); // 'open' | 'closed'

  const allPicks = useMemo(() => Object.values(picks), [picks]);
  const openPicks   = useMemo(() => allPicks.filter(isOpen),   [allPicks]);
  const closedPicks = useMemo(() => allPicks.filter(isClosed), [allPicks]);
  const filteredPicks = view === 'open' ? openPicks : closedPicks;

  // Match filtered picks to ESPN games (so we can render GameCard).
  // When the live ESPN scoreboard has the game, merge: keep ESPN's score/status,
  // but prefer the pick's stored matchup snapshot for team logos and the
  // SPREAD / O/U / ML pill row (so the card shows what was taken at post time,
  // not the current/closing line).
  const cards = useMemo(() => {
    return filteredPicks.map((p) => {
      const live = games.find((g) => g.id === p.gameId);
      const synth = synthesizeGame(p);
      if (!live) return { pick: p, game: synth };
      return {
        pick: p,
        game: {
          ...live,
          // Prefer pick snapshot for line pills + team identity
          spread: synth.spread || live.spread,
          ou:     synth.ou     || live.ou,
          mlHome: p.mlHome ?? live.mlHome ?? null,
          mlAway: p.mlAway ?? live.mlAway ?? null,
          home: { ...live.home, ...(p.homeAbbr ? { abbr: p.homeAbbr } : {}), logo: live.home?.logo || p.homeLogo || null },
          away: { ...live.away, ...(p.awayAbbr ? { abbr: p.awayAbbr } : {}), logo: live.away?.logo || p.awayLogo || null },
        },
      };
    });
  }, [filteredPicks, games]);

  if (loading || picksLoading) return <SkeletonCardGrid count={6} />;

  if (allPicks.length === 0) return <><SystemInfoBanner games={games} /><PicksEmptyState /></>;

  return (
    <section>
      <SystemInfoBanner games={games} />
      <PicksTabs
        view={view} setView={setView}
        openCount={openPicks.length} closedCount={closedPicks.length}
      />
      {cards.length === 0 ? (
        <div className="empty">
          {view === 'open' ? 'No open picks right now.' : 'No closed picks in the last 6 days.'}
        </div>
      ) : (
        <div className="grid">
          {cards.map(({ game, pick }, i) => (
            <GameCard
              key={pick.id || pick.gameId}
              game={game}
              pick={pick}
              pickUnlocked={sub.active || pick.visibility === 'public'}
              delay={Math.min(i, 10) * 0.04}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Always-visible info card at the top of /picks. Explains the system covers
 * NFL / CFB / CBB only and reinforces the brand promise that every posted
 * pick is one we're taking ourselves. During football off-season it also
 * shows a countdown to NFL/CFB kickoff.
 */
function SystemInfoBanner({ games }) {
  const offSeason = isFootballOffSeason(games);
  const cfbDays = daysUntil(nextSeasonStart('cfb'));
  const nflDays = daysUntil(nextSeasonStart('nfl'));
  const showCountdown = offSeason && (cfbDays > 0 || nflDays > 0);

  return (
    <div className="off-season-banner">
      {showCountdown && (
        <div className="osb-row">
          <div className="osb-label">FOOTBALL OFF-SEASON</div>
          <div className="osb-stats">
            {cfbDays > 0 && <span><strong>{cfbDays}</strong> days to CFB Week 1</span>}
            {cfbDays > 0 && nflDays > 0 && <span className="osb-dot">·</span>}
            {nflDays > 0 && <span><strong>{nflDays}</strong> days to NFL kickoff</span>}
          </div>
        </div>
      )}
      <div className="osb-cta">
        Lock Street's edge is in three sports — <strong>NFL, College Football, and College Basketball</strong>.
        We don't post picks we aren't taking ourselves. Your success is our success.
      </div>
    </div>
  );
}

function PicksEmptyState() {
  // 3 sample matchups as visual teaser of what a paid pick card looks like.
  const samples = [
    { league: 'NFL', away: 'PHI', home: 'DAL', spread: '-3.5', total: 'O 47.5' },
    { league: 'CFB', away: 'OSU', home: 'MICH', spread: '+6',  total: 'U 51' },
    { league: 'NFL', away: 'BUF', home: 'KC',   spread: '+2.5', total: 'O 49.5' },
  ];

  return (
    <section className="picks-empty">
      <div className="picks-empty-hero">
        <span className="hero-eyebrow">Subscriber-only content</span>
        <h2>Picks drop game day. <span className="accent">Locked at kickoff.</span></h2>
        <p>
          4 NFL + 4 CFB picks against the spread, every week, with full reasoning
          and unit sizing. Paid picks never go public — your edge stays your edge.
        </p>
        <div className="hero-cta-row">
          <Link to="/subscribe" className="btn-gold btn-lg">Subscribe</Link>
          <Link to="/about" className="btn-ghost btn-lg">See track record</Link>
        </div>
      </div>

      <div className="sample-label">Preview · what a paid pick looks like</div>
      <div className="grid">
        {samples.map((s, i) => (
          <div key={i} className="card sample-card" style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="card-top">
              <span className={'lg-badge ' + s.league.toLowerCase()}>{s.league}</span>
              <span className="wk">SAMPLE</span>
            </div>
            <div className="teams">
              <div className="team-row">
                <div className="orb">{s.away}</div>
                <div className="tcol"><div className="tabbr">{s.away}</div></div>
                <div className="score muted">—</div>
              </div>
              <div className="team-row">
                <div className="orb">{s.home}</div>
                <div className="tcol"><div className="tabbr">{s.home}</div></div>
                <div className="score muted">—</div>
              </div>
            </div>
            <div className="lines">
              <span className="pill"><span className="k">SPREAD</span>{s.home} {s.spread}</span>
              <span className="pill"><span className="k">TOTAL</span>{s.total}</span>
            </div>
            <div className="pick">
              <div className="pick-label">Lock Street pick</div>
              <div className="pick-side" style={{ filter: 'blur(6px)' }}>HIDDEN</div>
              <div className="pick-units" style={{ filter: 'blur(4px)' }}>?u</div>
              <Link to="/subscribe" className="pick-locked">SUBSCRIBE TO UNLOCK</Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


/** Open / Closed tab nav for /picks. Open = pending; Closed = graded picks
 *  inside the 6-day display window (older closed picks are filtered out). */
function PicksTabs({ view, setView, openCount, closedCount }) {
  return (
    <div className="picks-tabs">
      <button
        type="button"
        className={'picks-tab' + (view === 'open' ? ' active' : '')}
        onClick={() => setView('open')}
      >
        Open <span className="picks-tab-count">{openCount}</span>
      </button>
      <button
        type="button"
        className={'picks-tab' + (view === 'closed' ? ' active' : '')}
        onClick={() => setView('closed')}
      >
        Closed <span className="picks-tab-count">{closedCount}</span>
      </button>
    </div>
  );
}

/** Build a minimal "game" object from a pick when ESPN's current scoreboard doesn't have it (past games). */
function synthesizeGame(pick) {
  const lg = pick.league || 'nfl';
  // Only football has a meaningful weekly slate. MLB/NBA/NHL regular-season
  // 'week' is misleading; only show postseason round (which we don't store
  // explicitly yet -- just hide the badge for non-football regular season).
  const isFootball = lg === 'nfl' || lg === 'cfb';
  return {
    id: pick.gameId,
    league: lg,
    week: isFootball && pick.week ? `Week ${pick.week}` : '',
    status: pick.result === 'pending' ? 'upcoming' : 'final',
    period: pick.result === 'pending' ? '' : 'Final',
    kickoff: pick.locksAt || pick.postedAt,
    home: pick.homeAbbr
      ? { abbr: pick.homeAbbr, logo: pick.homeLogo || null, city: '', name: '' }
      : { abbr: '?', city: '', name: '' },
    away: pick.awayAbbr
      ? { abbr: pick.awayAbbr, logo: pick.awayLogo || null, city: '', name: '' }
      : { abbr: '?', city: '', name: '' },
    score: null,
    spread: pick.spreadHome != null && pick.homeAbbr
      ? `${pick.homeAbbr} ${pick.spreadHome > 0 ? '+' : ''}${pick.spreadHome}`
      : null,
    ou: pick.totalTaken != null ? String(pick.totalTaken) : null,
    mlHome: pick.mlHome ?? null,
    mlAway: pick.mlAway ?? null,
    move: null,
  };
}
