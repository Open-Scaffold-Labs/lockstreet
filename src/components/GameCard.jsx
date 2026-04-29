import { useState } from 'react';
import { Link } from 'react-router-dom';
import TeamOrb from './TeamOrb.jsx';
import PickLockOverlay from './PickLockOverlay.jsx';
import PickModal from './PickModal.jsx';
import { SignedIn } from '../lib/auth.jsx';

function fmtMl(n) {
  if (n == null || !Number.isFinite(n)) return '';
  return n > 0 ? `+${n}` : String(n);
}

function atsPct(rec) {
  if (!rec || rec === '—') return null;
  const [w, l] = rec.split('-').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w + l === 0) return null;
  return (w / (w + l)) * 100;
}
function atsClass(rec) {
  const p = atsPct(rec);
  if (p == null) return '';
  if (p >= 60) return 'good';
  if (p < 40) return 'bad';
  return '';
}

function formatKickoff(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch { return ''; }
}

function countdownTo(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `in ${totalMin}m`;
  const totalHr = Math.floor(totalMin / 60);
  if (totalHr < 24) return `in ${totalHr}h ${totalMin % 60}m`;
  const days = Math.floor(totalHr / 24);
  return `in ${days}d ${totalHr % 24}h`;
}

function TeamRow({ team, score, side, showScore }) {
  const winClass = side === 'win' ? 'win' : side === 'lose' ? 'muted' : '';
  return (
    <div className="team-row">
      <TeamOrb team={team} />
      <div className="tcol">
        <div className="tabbr">
          {team?.abbr}
          {team?.ats && team.ats !== '—' && (
            <span className={`ats-chip ${atsClass(team.ats)}`}>{team.ats} ATS</span>
          )}
        </div>
        <div className="tcity">{[team?.city, team?.name].filter(Boolean).join(' ')}</div>
        {team?.su && <div className="trec">SU {team.su}</div>}
      </div>
      {showScore ? (
        <div className={`score ${winClass}`}>{score}</div>
      ) : (
        <div className="score muted" aria-hidden />
      )}
    </div>
  );
}

export default function GameCard({ game, pick, pickUnlocked, delay = 0, hideLeagueBadge = false }) {
  const { league, week, status, period, kickoff, home, away, score, spread, ou, move, mlHome, mlAway } = game;
  const hasMl = (mlHome != null && Number.isFinite(mlHome)) || (mlAway != null && Number.isFinite(mlAway));
  const [pickOpen, setPickOpen] = useState(false);

  // Show the "+ Pick" button only on upcoming games whose kickoff is more
  // than 30s away (matches the lock-window enforcement in PickModal).
  const kickoffMs = kickoff ? new Date(kickoff).getTime() : 0;
  const canPick = status === 'upcoming' && kickoffMs > Date.now() + 30_000;

  // Pre-fill consensus line so PickModal's spread/total fields auto-populate.
  // spread is a string like "BUF -3.5" — parse out the home spread.
  const consensus = (() => {
    let spreadHome = null;
    if (spread && home?.abbr) {
      const m = String(spread).match(new RegExp(`${home.abbr}\\s+([+-]?\\d+(?:\\.\\d)?)`, 'i'));
      if (m) spreadHome = Number(m[1]);
      else {
        // Try away abbr — flip the sign
        const m2 = away?.abbr && String(spread).match(new RegExp(`${away.abbr}\\s+([+-]?\\d+(?:\\.\\d)?)`, 'i'));
        if (m2) spreadHome = -Number(m2[1]);
      }
    }
    return {
      spreadHome,
      total: ou ? Number(String(ou).replace(/[^\d.\-]/g, '')) || null : null,
      mlHome,
      mlAway,
    };
  })();

  let hSide = '', aSide = '';
  if (status === 'final' && score) {
    if (score.home > score.away) { hSide = 'win'; aSide = 'lose'; }
    else if (score.away > score.home) { aSide = 'win'; hSide = 'lose'; }
  }
  const showScore = status !== 'upcoming';

  let stateEl;
  if (status === 'live') {
    stateEl = <span className="state live"><span className="live-dot" />{period}</span>;
  } else if (status === 'final') {
    stateEl = <span className="state final">{period || 'Final'}</span>;
  } else {
    const cd = countdownTo(kickoff);
    stateEl = (
      <span className="state upcoming">
        {formatKickoff(kickoff)}
        {cd && <span className="state-countdown"> · {cd}</span>}
      </span>
    );
  }

  return (
    <>
    {pickOpen && (
      <PickModal
        game={{
          gameId: game.id,
          league,
          kickoffAt: kickoff,
          home: { abbr: home?.abbr, logo: home?.logo, name: home?.name },
          away: { abbr: away?.abbr, logo: away?.logo, name: away?.name },
          consensus,
        }}
        onClose={() => setPickOpen(false)}
      />
    )}
    <Link
      to={`/game/${league}/${game.id}`}
      state={{ game }}
      className="card-link"
      style={{ animationDelay: `${delay}s` }}
    >
      <article className="card">
        <div className="card-top">
          {!hideLeagueBadge && <span className={`lg-badge ${league}`}>{league.toUpperCase()}</span>}
          {week && <span className="wk">{week}</span>}
          {game.series?.summary && <span className="series-tally">{game.series.summary}</span>}
          {stateEl}
        </div>
        <div className="teams">
          <TeamRow team={away} score={score?.away} side={aSide} showScore={showScore} />
          <TeamRow team={home} score={score?.home} side={hSide} showScore={showScore} />
        </div>
        <div className="lines">
          {spread && <span className="pill"><span className="k">SPREAD</span>{spread}</span>}
          {ou &&     <span className="pill"><span className="k">O/U</span>{ou}</span>}
          {hasMl && (
            <span className="pill"><span className="k">ML</span>
              {away?.abbr || ''} {fmtMl(mlAway)}{mlHome != null ? ` / ${home?.abbr || ''} ${fmtMl(mlHome)}` : ''}
            </span>
          )}
          {move &&   <span className="pill move"><span className="k">MOVE</span>{move}</span>}
          {canPick && (
            <SignedIn>
              <button
                type="button"
                className="card-pick-btn"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPickOpen(true); }}
                aria-label="Make a pick on this game"
              >
                + Pick
              </button>
            </SignedIn>
          )}
        </div>

        {pick && (
          <div className="pick">
            <div className="pick-label">Lock Street {pick.visibility === 'public' ? 'Free Pick' : 'Pick'}</div>
            <div className="pick-side">{pick.side}</div>
            <div className="pick-units">{pick.units} units</div>
            {pick.result && pick.result !== 'pending' && (
              <span className={`pick-result-badge ${pick.result}`}>{pick.result}</span>
            )}
            {!(pickUnlocked || pick.visibility === 'public') && <PickLockOverlay />}
          </div>
        )}
      </article>
    </Link>
    </>
  );
}
