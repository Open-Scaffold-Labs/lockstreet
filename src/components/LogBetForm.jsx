import { useEffect, useMemo, useState } from 'react';
import { fetchScoreboardWeek } from '../lib/espn.js';

/**
 * Multi-step bet logger.
 *   1. League + Week (NFL: 1-18 reg + WC/DIV/CONF/SB; CFB: 1-15 reg + Bowls)
 *   2. Pick a game from that week
 *   3. Pick the side (away / home / over / under) and the spread you got
 *   4. Confirm sizing + result + notes
 *
 * onSave receives a structured bet payload; the parent inserts to Supabase.
 */

const NFL_WEEKS_REG = Array.from({ length: 18 }, (_, i) => ({ key: `${i+1}`, label: `Week ${i+1}`, week: i+1, seasontype: 2 }));
const NFL_WEEKS_POST = [
  { key: 'WC',  label: 'Wild Card',     week: 1, seasontype: 3 },
  { key: 'DIV', label: 'Divisional',    week: 2, seasontype: 3 },
  { key: 'CONF',label: 'Conf Champ',    week: 3, seasontype: 3 },
  { key: 'SB',  label: 'Super Bowl',    week: 5, seasontype: 3 },
];
const CFB_WEEKS_REG = Array.from({ length: 16 }, (_, i) => ({ key: `${i+1}`, label: `Week ${i+1}`, week: i+1, seasontype: 2 }));
const CFB_WEEKS_POST = [{ key: 'BOWL', label: 'Bowl Games', week: 1, seasontype: 3 }];

function weeksFor(league) {
  if (league === 'nfl') return [...NFL_WEEKS_REG, ...NFL_WEEKS_POST];
  if (league === 'cfb') return [...CFB_WEEKS_REG, ...CFB_WEEKS_POST];
  return [];
}

const CURRENT_SEASON = 2026;

export default function LogBetForm({ onSave, onCancel, defaultUnitSize = 25 }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const [league, setLeague]   = useState('nfl');
  const [weekKey, setWeekKey] = useState('1');
  const [season, setSeason]   = useState(CURRENT_SEASON);

  const [games, setGames]     = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [game, setGame]       = useState(null);

  const [betType, setBetType] = useState('spread');     // 'spread' | 'total' | 'moneyline'
  const [side, setSide]       = useState(null);         // 'home'|'away'|'over'|'under'
  const [spreadTaken, setSpreadTaken] = useState('');
  const [totalTaken,  setTotalTaken]  = useState('');
  const [odds, setOdds]       = useState('-110');
  const [units, setUnits]     = useState('1');
  const [unitSize, setUnitSize] = useState(String(defaultUnitSize));
  const [notes, setNotes]     = useState('');

  const weeks = useMemo(() => weeksFor(league), [league]);
  const weekObj = weeks.find((w) => w.key === weekKey);

  // Fetch games whenever week changes (step 2)
  useEffect(() => {
    if (step !== 2 || !weekObj) return;
    let cancel = false;
    setGamesLoading(true);
    setGames([]);
    fetchScoreboardWeek({ league, seasontype: weekObj.seasontype, week: weekObj.week, year: season })
      .then((list) => { if (!cancel) setGames(list); })
      .catch((e)   => { if (!cancel) setErr(e.message || 'Failed to load games'); })
      .finally(()  => { if (!cancel) setGamesLoading(false); });
    return () => { cancel = true; };
  }, [step, league, weekKey, season]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickGame(g) {
    setGame(g);
    // Auto-fill spread/total from market line if available
    const m = parseSpread(g.spread, g.away?.abbr, g.home?.abbr);
    if (m) setSpreadTaken(String(m.home));
    if (g.ou) setTotalTaken(g.ou);
    setStep(3);
  }

  async function submit() {
    if (!game || !side) return;
    setBusy(true); setErr(null);
    try {
      const desc = describeBet(game, side, betType, spreadTaken, totalTaken);
      const payload = {
        gameId:     game.id,
        league,
        season,
        week:       weekKey,
        homeAbbr:   game.home?.abbr,
        awayAbbr:   game.away?.abbr,
        kickoffAt:  game.kickoff,
        betType,
        betSide:    side,
        spreadTaken: betType === 'spread' && spreadTaken ? Number(spreadTaken) : null,
        totalTaken:  betType === 'total'  && totalTaken  ? Number(totalTaken)  : null,
        description: desc,
        units:    Number(units) || 1,
        odds,
        unitSize: Number(unitSize) || 25,
        result:   'pending',
        notes,
      };
      await onSave(payload);
    } catch (e) { setErr(e.message || 'Failed to save'); setBusy(false); }
  }

  return (
    <div className="onboarding-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="onboarding-card lbf-card lbf-multi" role="dialog" aria-modal="true">
        <button className="ob-skip" onClick={onCancel}>Cancel</button>
        <div className="ob-eyebrow">Log a bet · Step {step} of 3</div>
        <div className="lbf-stepper">
          <span className={'lbf-dot' + (step >= 1 ? ' done' : '')} />
          <span className={'lbf-dot' + (step >= 2 ? ' done' : '')} />
          <span className={'lbf-dot' + (step >= 3 ? ' done' : '')} />
        </div>

        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{err}</div>}

        {step === 1 && (
          <Step1
            league={league} setLeague={(l) => { setLeague(l); setWeekKey(weeksFor(l)[0].key); }}
            weeks={weeks} weekKey={weekKey} setWeekKey={setWeekKey}
            season={season} setSeason={setSeason}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step2
            games={games} loading={gamesLoading}
            league={league} weekLabel={weekObj?.label || ''}
            onPick={pickGame} onBack={() => setStep(1)}
          />
        )}

        {step === 3 && game && (
          <Step3
            game={game} betType={betType} setBetType={setBetType}
            side={side} setSide={setSide}
            spreadTaken={spreadTaken} setSpreadTaken={setSpreadTaken}
            totalTaken={totalTaken}   setTotalTaken={setTotalTaken}
            odds={odds} setOdds={setOdds}
            units={units} setUnits={setUnits}
            unitSize={unitSize} setUnitSize={setUnitSize}
            notes={notes} setNotes={setNotes}
            onBack={() => setStep(2)} onSubmit={submit} busy={busy}
          />
        )}
      </div>
    </div>
  );
}

function Step1({ league, setLeague, weeks, weekKey, setWeekKey, season, setSeason, onNext }) {
  return (
    <>
      <h2 className="ob-title" style={{ fontSize: 20 }}>Pick league + week</h2>
      <div className="lbf-form">
        <div className="lbf-row">
          <label>League
            <select value={league} onChange={(e) => setLeague(e.target.value)}>
              <option value="nfl">NFL</option>
              <option value="cfb">College Football</option>
            </select>
          </label>
          <label>Season
            <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
              {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <label>Week
          <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)}>
            {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </label>
      </div>
      <div className="ob-actions" style={{ marginTop: 14 }}>
        <button type="button" className="btn-gold" onClick={onNext}>Find games →</button>
      </div>
    </>
  );
}

function Step2({ games, loading, league, weekLabel, onPick, onBack }) {
  return (
    <>
      <h2 className="ob-title" style={{ fontSize: 20 }}>{league.toUpperCase()} · {weekLabel}</h2>
      {loading ? (
        <p style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: 20 }}>Loading games...</p>
      ) : games.length === 0 ? (
        <p style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: 20 }}>No games found for that week.</p>
      ) : (
        <div className="lbf-game-list">
          {games.map((g) => {
            const status = g.status === 'final' ? 'FINAL' : g.status === 'live' ? 'LIVE' : new Date(g.kickoff).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
            const score = g.status !== 'upcoming' && g.score ? `${g.score.away}-${g.score.home}` : '';
            return (
              <button key={g.id} className="lbf-game" onClick={() => onPick(g)}>
                <div className="lbf-game-head">
                  <span className={'lg-badge ' + g.league}>{g.league.toUpperCase()}</span>
                  <span className="lbf-game-status">{status}</span>
                  {score && <span className="lbf-game-score">{score}</span>}
                </div>
                <div className="lbf-game-teams">
                  <strong>{g.away?.abbr}</strong> @ <strong>{g.home?.abbr}</strong>
                </div>
                <div className="lbf-game-line">
                  {g.spread && <span>{g.spread}</span>}
                  {g.ou && <span> · O/U {g.ou}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="ob-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </>
  );
}

function Step3({
  game, betType, setBetType, side, setSide,
  spreadTaken, setSpreadTaken, totalTaken, setTotalTaken,
  odds, setOdds, units, setUnits, unitSize, setUnitSize,
  notes, setNotes, onBack, onSubmit, busy,
}) {
  const m = parseSpread(game.spread, game.away?.abbr, game.home?.abbr);
  const homeSpreadDisplay = m ? formatSpread(m.home) : '';
  const awaySpreadDisplay = m ? formatSpread(-m.home) : '';

  const valid = !!side && (
    (betType === 'spread'    && spreadTaken !== '') ||
    (betType === 'total'     && totalTaken  !== '') ||
    (betType === 'moneyline')
  );

  return (
    <>
      <h2 className="ob-title" style={{ fontSize: 20 }}>{game.away?.abbr} @ {game.home?.abbr}</h2>
      <div className="lbf-bettype-row">
        {[
          { v: 'spread',    label: 'Spread' },
          { v: 'total',     label: 'Total' },
          { v: 'moneyline', label: 'Moneyline' },
        ].map((t) => (
          <button key={t.v} className={'lbf-pill' + (betType === t.v ? ' active' : '')}
                  onClick={() => { setBetType(t.v); setSide(null); }}>{t.label}</button>
        ))}
      </div>

      <div className="lbf-side-row">
        {betType === 'spread' && (
          <>
            <button className={'lbf-side' + (side === 'away' ? ' active' : '')} onClick={() => setSide('away')}>
              <div className="lbf-side-team">{game.away?.abbr}</div>
              <div className="lbf-side-line">{awaySpreadDisplay || '—'}</div>
            </button>
            <button className={'lbf-side' + (side === 'home' ? ' active' : '')} onClick={() => setSide('home')}>
              <div className="lbf-side-team">{game.home?.abbr}</div>
              <div className="lbf-side-line">{homeSpreadDisplay || '—'}</div>
            </button>
          </>
        )}
        {betType === 'total' && (
          <>
            <button className={'lbf-side' + (side === 'over' ? ' active' : '')} onClick={() => setSide('over')}>
              <div className="lbf-side-team">Over</div>
              <div className="lbf-side-line">{game.ou ? `O ${game.ou}` : '—'}</div>
            </button>
            <button className={'lbf-side' + (side === 'under' ? ' active' : '')} onClick={() => setSide('under')}>
              <div className="lbf-side-team">Under</div>
              <div className="lbf-side-line">{game.ou ? `U ${game.ou}` : '—'}</div>
            </button>
          </>
        )}
        {betType === 'moneyline' && (
          <>
            <button className={'lbf-side' + (side === 'away' ? ' active' : '')} onClick={() => setSide('away')}>
              <div className="lbf-side-team">{game.away?.abbr}</div>
              <div className="lbf-side-line">ML</div>
            </button>
            <button className={'lbf-side' + (side === 'home' ? ' active' : '')} onClick={() => setSide('home')}>
              <div className="lbf-side-team">{game.home?.abbr}</div>
              <div className="lbf-side-line">ML</div>
            </button>
          </>
        )}
      </div>

      <div className="lbf-form" style={{ marginTop: 12 }}>
        {betType === 'spread' && (
          <label>Spread you got
            <input type="number" step="0.5" value={spreadTaken} onChange={(e) => setSpreadTaken(e.target.value)}
              placeholder="-3.5  (negative if favored)" />
          </label>
        )}
        {betType === 'total' && (
          <label>Total you got
            <input type="number" step="0.5" value={totalTaken} onChange={(e) => setTotalTaken(e.target.value)}
              placeholder="47.5" />
          </label>
        )}
        <div className="lbf-row">
          <label>Units
            <input type="number" min="0.5" step="0.5" value={units} onChange={(e) => setUnits(e.target.value)} />
          </label>
          <label>Unit size ($)
            <input type="number" min="1" step="1" value={unitSize} onChange={(e) => setUnitSize(e.target.value)} />
          </label>
        </div>
        <label>Odds
          <input value={odds} onChange={(e) => setOdds(e.target.value)} placeholder="-110" />
        </label>
        <label>Notes (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sharp move, weather, injury read..." maxLength={240} />
        </label>
      </div>
      <div className="ob-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn-ghost" onClick={onBack}>← Back</button>
        <button type="button" className="btn-gold" onClick={onSubmit} disabled={!valid || busy}>
          {busy ? 'Saving...' : 'Log bet'}
        </button>
      </div>
    </>
  );
}

// ---- helpers --------------------------------------------------------------

/** Parse ESPN's "PHI -3.5" / "DAL -7" string into { fav, home: numeric_home_spread }. */
export function parseSpread(spreadStr, awayAbbr, homeAbbr) {
  if (!spreadStr) return null;
  const m = String(spreadStr).match(/([A-Z]{2,4})\s*([+-]?\d+(\.\d+)?)/);
  if (!m) return null;
  const team = m[1];
  const num = Number(m[2]);
  // ESPN convention: "DAL -3.5" means DAL is favored by 3.5.
  // Home spread is what the home team "gives" — negative if home is favored.
  let homeSpread;
  if (team === homeAbbr)      homeSpread = num;            // home -3.5 stays as -3.5
  else if (team === awayAbbr) homeSpread = -num;           // away -3.5 → home +3.5
  else homeSpread = num;
  return { fav: team, home: homeSpread };
}

function formatSpread(n) {
  if (n == null || isNaN(n)) return '';
  return (n > 0 ? '+' : '') + n;
}

function describeBet(game, side, betType, spread, total) {
  const a = game.away?.abbr || 'AWAY', h = game.home?.abbr || 'HOME';
  if (betType === 'spread') {
    const team = side === 'home' ? h : a;
    return `${team} ${formatSpread(Number(spread)) || ''}`.trim();
  }
  if (betType === 'total') {
    return `${side === 'over' ? 'Over' : 'Under'} ${total || ''}`.trim();
  }
  return `${side === 'home' ? h : a} ML`;
}
