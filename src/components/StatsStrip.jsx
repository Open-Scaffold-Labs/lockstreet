import { useMemo, useState } from 'react';
import {
  aggregatePickStats,
  filterPicksToWindow,
  filterPicksToSport,
  fmtNet,
  fmtPct,
  SPORT_LABELS,
  SPORTS,
  MIN_SAMPLE,
} from '../lib/userPicks.js';

/**
 * Sport-tabbed stats summary for a user's picks.
 *
 * Props:
 *   picks  - array of camelCased user picks (from useUserPicks)
 *   window - 'week' | 'month' | 'season'  (default 'season')
 *
 * Renders the headline 5-stat row: Net Units, Record, Win% @ Line,
 * Juice Paid, Pt-Buy Cost. The first row of tabs filters by sport.
 *
 * If the user is below the qualifying sample for the active window,
 * shows "X more picks to qualify" under the strip.
 */
export default function StatsStrip({ picks, window = 'season' }) {
  const [sport, setSport] = useState('all');

  const stats = useMemo(() => {
    const filtered = filterPicksToWindow(filterPicksToSport(picks, sport), window);
    return aggregatePickStats(filtered);
  }, [picks, sport, window]);

  const min = MIN_SAMPLE[window] ?? 0;
  const remaining = Math.max(0, min - stats.picksCount);

  return (
    <div className="pf-stats-wrap">
      <div className="tabs pf-sport-tabs" role="tablist" aria-label="Filter by sport">
        {[ 'all', ...SPORTS ].map((s) => (
          <button
            key={s}
            type="button"
            className={'tab' + (s === sport ? ' active' : '')}
            onClick={() => setSport(s)}
          >
            {SPORT_LABELS[s] || s.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="pf-stats-strip">
        <Cell
          k="Net Units"
          v={fmtNet(stats.netUnits)}
          tone={stats.netUnits > 0 ? 'green' : stats.netUnits < 0 ? 'red' : 'gold'}
          big
        />
        <Cell
          k="Record"
          v={`${stats.wins}-${stats.losses}-${stats.pushes}`}
          sub={stats.pending ? `${stats.pending} pending` : ''}
          tone="gold"
        />
        <Cell
          k="Win % @ Line"
          v={stats.picksCount > 0 ? fmtPct(stats.winPct) : '—'}
          sub={`${stats.picksCount} picks`}
          tone="gold"
        />
        <Cell
          k="Juice Paid"
          v={stats.picksCount > 0 ? `${stats.juicePaid.toFixed(1)}u` : '—'}
          sub="cost of -110+ juice"
          tone="dim"
        />
        <Cell
          k="Pt-Buy Cost"
          v={stats.picksCount > 0
              ? `${stats.pointBuyCost > 0 ? '+' : ''}${stats.pointBuyCost.toFixed(1)}u`
              : '—'}
          sub={stats.pointBuyCost > 0 ? 'cost' : stats.pointBuyCost < 0 ? 'gain' : 'flat'}
          tone={stats.pointBuyCost > 0 ? 'red' : stats.pointBuyCost < 0 ? 'green' : 'dim'}
        />
      </div>

      {remaining > 0 && (
        <div className="pf-min-sample">
          {remaining} more graded {plural(remaining, 'pick')} to qualify for the {window} leaderboard.
        </div>
      )}
    </div>
  );
}

function Cell({ k, v, sub = '', tone = 'gold', big = false }) {
  return (
    <div className={'stat pf-stat' + (big ? ' pf-stat-big' : '')}>
      <div className="k">{k}</div>
      <div className={'v ' + (tone === 'red' ? 'red' : tone === 'green' ? 'green' : tone === 'dim' ? 'dim' : 'gold')}>
        {v}
      </div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

function plural(n, w) { return n === 1 ? w : w + 's'; }
