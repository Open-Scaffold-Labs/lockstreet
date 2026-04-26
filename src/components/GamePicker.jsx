import { useEffect, useMemo, useState } from 'react';
import { fetchScoreboardWeek } from '../lib/espn.js';

/**
 * Two-step league + week + game picker. Reusable across LogBetForm (bankroll)
 * and AdminPickForm (post a pick). Calls onPick(game) once a game is chosen.
 *
 * Props:
 *   onPick(game) - callback when a game is selected
 *   onCancel?    - optional cancel button handler
 *   defaultLeague?, defaultWeek?, defaultSeason? - initial values
 *   filterStatus? - optional 'upcoming' to hide already-final games
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

export function weeksFor(league) {
  if (league === 'nfl') return [...NFL_WEEKS_REG, ...NFL_WEEKS_POST];
  if (league === 'cfb') return [...CFB_WEEKS_REG, ...CFB_WEEKS_POST];
  return [];
}

export const CURRENT_SEASON = 2026;

export default function GamePicker({
  onPick, onCancel,
  defaultLeague = 'nfl', defaultWeek = '1', defaultSeason = CURRENT_SEASON,
  filterStatus = null,
  embedded = false,
}) {
  const [step, setStep] = useState(1);
  const [league, setLeague]   = useState(defaultLeague);
  const [weekKey, setWeekKey] = useState(defaultWeek);
  const [season, setSeason]   = useState(defaultSeason);

  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const weeks = useMemo(() => weeksFor(league), [league]);
  const weekObj = weeks.find((w) => w.key === weekKey);

  useEffect(() => {
    if (step !== 2 || !weekObj) return;
    let cancel = false;
    setLoading(true); setGames([]); setErr(null);
    fetchScoreboardWeek({ league, seasontype: weekObj.seasontype, week: weekObj.week, year: season })
      .then((list) => { if (!cancel) {
        const filtered = filterStatus ? list.filter((g) => g.status === filterStatus) : list;
        setGames(filtered);
      }})
      .catch((e) => { if (!cancel) setErr(e.message || 'Failed to load games'); })
      .finally(()  => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [step, league, weekKey, season]); // eslint-disable-line react-hooks/exhaustive-deps

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
                <select value={league} onChange={(e) => { setLeague(e.target.value); setWeekKey(weeksFor(e.target.value)[0].key); }}>
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
            {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
            <button type="button" className="btn-gold" onClick={() => setStep(2)}>Find games →</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', marginBottom: 8 }}>
            {league.toUpperCase()} · {weekObj?.label} · {season}
          </div>
          {loading ? (
            <p style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: 20 }}>Loading games...</p>
          ) : games.length === 0 ? (
            <p style={{ color: 'var(--ink-dim)', textAlign: 'center', padding: 20 }}>
              {filterStatus === 'upcoming' ? 'No upcoming games for that week.' : 'No games found for that week.'}
            </p>
          ) : (
            <div className="lbf-game-list">
              {games.map((g) => {
                const status = g.status === 'final' ? 'FINAL' : g.status === 'live' ? 'LIVE' : new Date(g.kickoff).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
                const score = g.status !== 'upcoming' && g.score ? `${g.score.away}-${g.score.home}` : '';
                return (
                  <button key={g.id} className="lbf-game" onClick={() => onPick({ ...g, season, weekKey })}>
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
