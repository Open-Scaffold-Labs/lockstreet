import { useEffect, useMemo, useState } from 'react';
import { fetchScoreboardWeek } from '../lib/espn.js';

/**
 * League + week/date + game picker. Reusable across LogBetForm (bankroll)
 * and AdminPickForm (post a pick). Calls onPick(game) once a game is chosen.
 *
 * NFL/CFB use a week-based slate; MLB/NBA/NHL use a date picker (single day).
 *
 * Props:
 *   onPick(game)
 *   onCancel?
 *   defaultLeague?, defaultWeek?, defaultSeason?, defaultDate?
 *   filterStatus? - 'upcoming' to hide already-final games
 */

const NFL_WEEKS_REG  = Array.from({ length: 18 }, (_, i) => ({ key: `${i+1}`, label: `Week ${i+1}`, week: i+1, seasontype: 2 }));
const NFL_WEEKS_POST = [
  { key: 'WC',  label: 'Wild Card',  week: 1, seasontype: 3 },
  { key: 'DIV', label: 'Divisional', week: 2, seasontype: 3 },
  { key: 'CONF',label: 'Conf Champ', week: 3, seasontype: 3 },
  { key: 'SB',  label: 'Super Bowl', week: 5, seasontype: 3 },
];
const CFB_WEEKS_REG  = Array.from({ length: 16 }, (_, i) => ({ key: `${i+1}`, label: `Week ${i+1}`, week: i+1, seasontype: 2 }));
const CFB_WEEKS_POST = [{ key: 'BOWL', label: 'Bowl Games', week: 1, seasontype: 3 }];

const FOOTBALL = new Set(['nfl', 'cfb']);

export function weeksFor(league) {
  if (league === 'nfl') return [...NFL_WEEKS_REG, ...NFL_WEEKS_POST];
  if (league === 'cfb') return [...CFB_WEEKS_REG, ...CFB_WEEKS_POST];
  return [];
}

export const CURRENT_SEASON = 2026;

const LEAGUES = [
  { value: 'nfl', label: 'NFL' },
  { value: 'cfb', label: 'College Football' },
  { value: 'mlb', label: 'MLB' },
  { value: 'nba', label: 'NBA' },
  { value: 'nhl', label: 'NHL' },
];

// Convert a YYYY-MM-DD string into ESPN's expected YYYYMMDD format.
function toEspnDate(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  return yyyyMmDd.replace(/-/g, '');
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function GamePicker({
  onPick, onCancel,
  defaultLeague = 'nfl', defaultWeek = '1', defaultSeason = CURRENT_SEASON,
  defaultDate = null,
  filterStatus = null,
  embedded = false,
}) {
  const [step, setStep] = useState(1);
  const [league, setLeague]   = useState(defaultLeague);
  const [weekKey, setWeekKey] = useState(defaultWeek);
  const [season, setSeason]   = useState(defaultSeason);
  const [date, setDate]       = useState(defaultDate || todayIso());

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const weeks = useMemo(() => weeksFor(league), [league]);
  const weekObj = weeks.find((w) => w.key === weekKey);
  const isFootball = FOOTBALL.has(league);

  useEffect(() => {
    if (step !== 2) return;
    let cancel = false;
    setLoading(true); setGames([]); setErr(null);
    const args = isFootball
      ? { league, seasontype: weekObj?.seasontype, week: weekObj?.week, year: season }
      : { league, dates: toEspnDate(date) };
    fetchScoreboardWeek(args)
      .then((list) => { if (!cancel) {
        const filtered = filterStatus ? list.filter((g) => g.status === filterStatus) : list;
        setGames(filtered);
      }})
      .catch((e) => { if (!cancel) setErr(e.message || 'Failed to load games'); })
      .finally(()  => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [step, league, weekKey, season, date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={embedded ? 'gp-embedded' : ''}>
      <div className="lbf-stepper">
        <span className={'lbf-dot' + (step >= 1 ? ' done' : '')} />
        <span className={'lbf-dot' + (step >= 2 ? ' done' : '')} />
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

      {step === 1 && (
        <>
          <div className="lbf-form">
            <div className="lbf-row">
              <label>League
                <select value={league} onChange={(e) => {
                  const newL = e.target.value;
                  setLeague(newL);
                  if (newL === 'nfl' || newL === 'cfb') setWeekKey(weeksFor(newL)[0].key);
                }}>
                  {LEAGUES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </label>
              {isFootball && (
                <label>Season
                  <select value={season} onChange={(e) => setSeason(Number(e.target.value))}>
                    {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
              )}
            </div>
            {isFootball ? (
              <label>Week
                <select value={weekKey} onChange={(e) => setWeekKey(e.target.value)}>
                  {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
                </select>
              </label>
            ) : (
              <label>Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            )}
          </div>
          <div className="ob-actions" style={{ marginTop: 14 }}>
            {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
            <button type="button" className="btn-gold" onClick={() => setStep(2)}>Find games →</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8 }}>
            {league.toUpperCase()} · {isFootball ? `${weekObj?.label} · ${season}` : new Date(date).toLocaleDateString([], { weekday: 'short', month: 'long', day: 'numeric' })}
          </div>
          {loading ? (
            <p style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: 20 }}>Loading games...</p>
          ) : games.length === 0 ? (
            <p style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: 20 }}>
              {filterStatus === 'upcoming' ? 'No upcoming games for that selection.' : 'No games found.'}
            </p>
          ) : (
            <div className="lbf-game-list">
              {games.map((g) => {
                const status = g.status === 'final' ? 'FINAL' : g.status === 'live' ? 'LIVE' : new Date(g.kickoff).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric' });
                const score = g.status !== 'upcoming' && g.score ? `${g.score.away}-${g.score.home}` : '';
                return (
                  <button key={g.id} className="lbf-game" onClick={() => onPick({ ...g, season, weekKey, date })}>
                    <div className="lbf-game-head">
                      <span className={'lg-badge ' + g.league}>{g.league.toUpperCase()}</span>
                      <span className="lbf-game-status">{status}</span>
                      {score && <span className="lbf-game-score">{score}</span>}
                    </div>
                    <div className="lbf-game-teams"><strong>{g.away?.abbr}</strong> @ <strong>{g.home?.abbr}</strong></div>
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
            <button type="button" className="btn-ghost" onClick={() => setStep(1)}>← Back</button>
          </div>
        </>
      )}
    </div>
  );
}
