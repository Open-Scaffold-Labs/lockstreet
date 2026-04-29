import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitUserPick } from '../hooks/useUserPicks.js';
import { useToast } from '../lib/toast.jsx';
import { useAuth } from '../lib/auth.jsx';
import { winPayoff, juiceForBuys, seasonForLeague } from '../lib/userPicks.js';

/**
 * Modal for submitting a user pick on a game.
 *
 * Required props:
 *   game: {
 *     gameId, league, season?, week?, kickoffAt,
 *     home: { abbr, logo?, name? },
 *     away: { abbr, logo?, name? },
 *     // optional consensus line(s) prefill:
 *     consensus?: { spreadHome?, total?, mlHome?, mlAway? }
 *   }
 *   onClose: () => void
 *   onSubmitted?: (pick) => void
 *
 * Enforces lock-window in the UI by disabling submit when kickoff is
 * inside 30s, but the canonical guard is the DB trigger.
 */
export default function PickModal({ game, onClose, onSubmitted }) {
  const { isSignedIn } = useAuth?.() || {};
  const navigate = useNavigate();
  const toast = useToast();

  const [betType, setBetType]     = useState('spread');
  const [side, setSide]           = useState('home');
  const [units, setUnits]         = useState(1);
  const [pointBuys, setPointBuys] = useState(0);  // half-points bought (0..N)
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState('');
  // Consensus line fetched if not provided by the caller. Shape matches
  // game.consensus: { spreadHome, total }. Pulled from the public_betting
  // table (same source as /lines) so spreads autofill in MakePickFlow.
  const [fetchedConsensus, setFetchedConsensus] = useState(null);
  const [consensusLoading, setConsensusLoading] = useState(false);

  // If the caller didn't supply consensus and we have a league + team
  // abbrs to match against, pull from /api/team-intel?op=public-betting.
  useEffect(() => {
    if (game?.consensus) { setFetchedConsensus(null); return undefined; }
    if (!game?.league || !game?.home?.abbr || !game?.away?.abbr) return undefined;
    let cancel = false;
    setConsensusLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/team-intel?op=public-betting&league=${game.league}`);
        if (!r.ok) return;
        const j = await r.json();
        const rows = j?.rows || [];
        const home = String(game.home.abbr).toUpperCase();
        const away = String(game.away.abbr).toUpperCase();
        const match = rows.find((row) =>
          String(row.homeLabel || '').toUpperCase() === home &&
          String(row.awayLabel || '').toUpperCase() === away
        );
        if (match && !cancel) {
          const sh = match.spreadHomeLine != null ? Number(match.spreadHomeLine) : null;
          const tot = match.totalLine != null ? Number(match.totalLine) : null;
          setFetchedConsensus({
            spreadHome: Number.isFinite(sh) ? sh : null,
            total:      Number.isFinite(tot) ? tot : null,
          });
        }
      } catch { /* best effort — fall through to manual entry */ }
      finally { if (!cancel) setConsensusLoading(false); }
    })();
    return () => { cancel = true; };
  }, [game?.league, game?.home?.abbr, game?.away?.abbr, game?.consensus]);

  // Effective consensus = explicit prop > fetched > none.
  const consensus = game?.consensus || fetchedConsensus;

  // Base line is derived from consensus + selected side. The line input
  // is intentionally read-only — every user gets the same starting line
  // for a given game, and the only sanctioned way to deviate is the
  // buy-half-points control below (with proper juice penalty). Keeps
  // the leaderboard honest.
  const baseLineNum = useMemo(() => {
    if (!consensus) return null;
    if (betType === 'spread') {
      if (consensus.spreadHome == null) return null;
      const sh = Number(consensus.spreadHome);
      return side === 'home' ? sh : -sh;
    }
    if (betType === 'total') {
      return consensus.total != null ? Number(consensus.total) : null;
    }
    return null; // ml
  }, [consensus, betType, side]);

  // Time-to-kickoff guard.
  const kickoffMs = game?.kickoffAt ? new Date(game.kickoffAt).getTime() : 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secsToKick = Math.max(0, Math.round((kickoffMs - now) / 1000));
  const tooLate    = kickoffMs > 0 && (kickoffMs - now) < 30_000;

  const buys      = betType === 'ml' ? 0 : pointBuys;
  const juiceUsed = juiceForBuys(buys);

  // Each half-point bought shifts the line 0.5 in the user's favor.
  // Spread: +0.5 from your side regardless of favorite/dog.
  // Total: over → -0.5 (lower hurdle); under → +0.5 (higher hurdle).
  const adjustedLine = useMemo(() => {
    if (baseLineNum == null || betType === 'ml') return baseLineNum;
    if (!buys) return baseLineNum;
    if (betType === 'spread') return baseLineNum + 0.5 * buys;
    return side === 'over' ? baseLineNum - 0.5 * buys : baseLineNum + 0.5 * buys;
  }, [baseLineNum, buys, betType, side]);

  function close() {
    if (busy) return;
    onClose?.();
  }

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    if (!isSignedIn) {
      navigate('/sign-in?next=' + encodeURIComponent(location.pathname));
      return;
    }
    function reject(msg) {
      setErr(msg);
      toast(msg, { type: 'error', duration: 6000 });
    }
    if (tooLate) { reject('Kickoff is too close — picks lock 30s before tipoff.'); return; }
    if (!game?.kickoffAt) { reject('Missing kickoff time.'); return; }
    if (units < 0.5 || units > 5)  { reject('Units must be between 0.5 and 5.'); return; }
    if (betType !== 'ml' && baseLineNum == null) {
      reject('Line not posted yet for this game — try again once the consensus line is up.');
      return;
    }

    setBusy(true);
    try {
      const pick = await submitUserPick({
        gameId:     game.gameId,
        league:     game.league,
        season:     game.season ?? seasonForLeague(game.league, new Date(game.kickoffAt)),
        week:       game.week ?? null,
        betType,
        side,
        units,
        lineAtPick:  betType === 'ml' ? null : adjustedLine,
        juiceAtPick: juiceUsed,
        pointBuys:   buys,
        marketLine:  betType === 'ml' ? null : baseLineNum,
        marketJuice: -110,
        kickoffAt:   game.kickoffAt,
        homeAbbr:    game.home?.abbr,
        awayAbbr:    game.away?.abbr,
        homeLogo:    game.home?.logo,
        awayLogo:    game.away?.logo,
      });
      toast('Pick locked.', { type: 'success' });
      onSubmitted?.(pick);
      onClose?.();
    } catch (e) {
      const m = String(e?.message || e || '');
      let userMsg;
      if (/Pick locked too late/i.test(m)) userMsg = 'Kickoff has passed — pick rejected.';
      else if (/duplicate key/i.test(m))   userMsg = 'You already have a pick on this game/market.';
      else userMsg = m || 'Could not submit pick.';
      setErr(userMsg);
      toast(userMsg, { type: 'error', duration: 6000 });
      // eslint-disable-next-line no-console
      console.error('[PickModal] submit failed', e);
    } finally {
      setBusy(false);
    }
  }

  if (!game) return null;

  const homeLabel = game.home?.abbr || 'HOME';
  const awayLabel = game.away?.abbr || 'AWAY';

  return (
    <div className="pf-modal-overlay" role="dialog" aria-modal="true" aria-label="Make a pick">
      <form className="pf-modal-card pm-card" onSubmit={submit}>
        <button type="button" className="pm-close" onClick={close} aria-label="Close">×</button>

        <div className="pf-modal-eyebrow">Make a pick</div>
        <h2 className="pf-modal-title">{awayLabel} @ {homeLabel}</h2>
        <p className="pf-modal-body">
          {kickoffMs > 0 ? <>Kicks in <strong>{fmtCountdown(secsToKick)}</strong> · </> : null}
          Locked at submit. Cannot edit. Auto-graded from final score.
        </p>

        <div className="tabs pm-bet-tabs" role="tablist" aria-label="Bet type">
          <button type="button" className={'tab' + (betType === 'spread' ? ' active' : '')} onClick={() => { setBetType('spread'); if (side === 'over' || side === 'under') setSide('home'); }}>
            Spread
          </button>
          <button type="button" className={'tab' + (betType === 'total' ? ' active' : '')} onClick={() => { setBetType('total'); setSide('over'); }}>
            Total
          </button>
          <button type="button" className={'tab' + (betType === 'ml' ? ' active' : '')} onClick={() => { setBetType('ml'); if (side === 'over' || side === 'under') setSide('home'); }}>
            Moneyline
          </button>
        </div>

        <div className="pm-side-grid">
          {betType === 'total' ? (
            <>
              <SideBtn active={side === 'over'}  onClick={() => setSide('over')}  label="OVER"  />
              <SideBtn active={side === 'under'} onClick={() => setSide('under')} label="UNDER" />
            </>
          ) : (
            <>
              <SideBtn active={side === 'away'} onClick={() => setSide('away')} label={awayLabel} />
              <SideBtn active={side === 'home'} onClick={() => setSide('home')} label={homeLabel} />
            </>
          )}
        </div>

        <div className="pf-form">
          {betType !== 'ml' && (
            <div className="pm-line-readonly">
              <span className="pm-line-readonly-label">
                {betType === 'spread' ? 'Line' : 'Total'}
              </span>
              <span className="pm-line-readonly-value">
                {baseLineNum == null
                  ? (consensusLoading ? 'Loading…' : 'Not posted yet')
                  : (betType === 'spread' ? fmtSignedLine(baseLineNum) : baseLineNum)}
              </span>
              <span className="pm-line-readonly-hint">
                Consensus line · adjust below by buying half-points
              </span>
            </div>
          )}

          <label>
            <span>Units · {Number(units).toFixed(1)}u</span>
            <input
              type="range"
              min="0.5" max="5" step="0.5"
              value={units}
              onChange={(e) => setUnits(Number(e.target.value))}
              className="pm-units-slider"
            />
            <div className="pm-units-scale">
              <span>0.5u</span><span>1u</span><span>2u</span><span>3u</span><span>4u</span><span>5u</span>
            </div>
          </label>

          {betType !== 'ml' && (
            <div className="pm-buyhalf-row">
              <span className="pm-buyhalf-label">Buy half-points</span>
              <div className="pm-stepper" role="group" aria-label="Half-points bought">
                <button type="button" className="pm-step" onClick={() => setPointBuys((n) => Math.max(0, n - 1))} disabled={pointBuys <= 0} aria-label="Decrease">−</button>
                <span className="pm-step-value">{pointBuys}</span>
                <button type="button" className="pm-step" onClick={() => setPointBuys((n) => n + 1)} aria-label="Increase">+</button>
              </div>
              <span className="pm-buyhalf-juice">→ {juiceUsed}</span>
            </div>
          )}

          <div className="pm-summary">
            <div>
              Posted: <strong>
                {betType === 'ml'
                  ? 'ML'
                  : adjustedLine == null
                    ? '—'
                    : (betType === 'spread' ? fmtSignedLine(adjustedLine) : adjustedLine)}
                {' '}({juiceUsed})
              </strong>
              {buys > 0 ? <span className="pm-summary-buys"> · bought {buys} half-point{buys === 1 ? '' : 's'}</span> : null}
            </div>
            <div className="pm-summary-payout">
              Win pays {(units * winPayoff(juiceUsed)).toFixed(2)}u · Loss = -{units.toFixed(1)}u
            </div>
          </div>

          {err ? <div className="pf-form-err">{err}</div> : null}

          <button type="submit" className="btn-gold pf-form-submit" disabled={busy || tooLate}>
            {busy ? 'Locking…' : tooLate ? 'Kickoff too close' : 'Lock pick'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SideBtn({ active, onClick, label }) {
  return (
    <button type="button"
      className={'pm-side-btn' + (active ? ' active' : '')}
      onClick={onClick}>
      {label}
    </button>
  );
}

/** Format a spread number with an explicit leading sign so dogs read clearly:
 *  -3.5 → "-3.5", 0 → "0", 8.5 → "+8.5". Matches sportsbook convention. */
function fmtSignedLine(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  if (v > 0) return `+${v}`;
  return String(v);
}

function fmtCountdown(s) {
  if (s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
