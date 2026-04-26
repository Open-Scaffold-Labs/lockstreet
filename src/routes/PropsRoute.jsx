import { useMemo, useState } from 'react';

/**
 * Player-prop board (mock UI).
 * Categories: Passing yds, Rushing yds, Receiving yds, Anytime TD.
 * Replace MOCK_PROPS with a real prop feed when an odds API is wired.
 */

const SPORTS = ['NFL', 'NCAAF'];

// Seeded so reload is consistent
const MOCK_PROPS = [
  { sport: 'NFL', player: 'J. Hurts',     team: 'PHI', stat: 'Passing Yds',  line: 247.5, over: -110, under: -110 },
  { sport: 'NFL', player: 'A.J. Brown',   team: 'PHI', stat: 'Receiving Yds', line:  74.5, over: -115, under: -105 },
  { sport: 'NFL', player: 'S. Barkley',   team: 'PHI', stat: 'Rushing Yds',  line:  82.5, over: -120, under: +100 },
  { sport: 'NFL', player: 'D. Prescott',  team: 'DAL', stat: 'Passing Yds',  line: 268.5, over: -110, under: -110 },
  { sport: 'NFL', player: 'CeeDee Lamb',  team: 'DAL', stat: 'Receiving Yds', line:  88.5, over: -110, under: -110 },
  { sport: 'NFL', player: 'P. Mahomes',   team: 'KC',  stat: 'Passing TDs',  line:   2.5, over: +110, under: -130 },
  { sport: 'NFL', player: 'T. Kelce',     team: 'KC',  stat: 'Anytime TD',   line: null,  over: -150, under: +130 },
  { sport: 'NCAAF', player: 'J. Smith',   team: 'OSU', stat: 'Passing Yds',  line: 285.5, over: -115, under: -105 },
  { sport: 'NCAAF', player: 'M. Anderson',team: 'MICH',stat: 'Rushing Yds',  line: 102.5, over: -110, under: -110 },
];

export default function PropsRoute() {
  const [sport, setSport] = useState('NFL');
  const [stat, setStat]   = useState('all');

  const stats = useMemo(() => Array.from(new Set(MOCK_PROPS.filter((p) => p.sport === sport).map((p) => p.stat))), [sport]);

  const filtered = useMemo(() =>
    MOCK_PROPS.filter((p) => p.sport === sport && (stat === 'all' || p.stat === stat)),
    [sport, stat]);

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Player props</div>
          <div className="trc-final">
            {filtered.length}<span className="trc-final-sub">props on the board · sample data</span>
          </div>
        </div>
        <div className="filter">
          {SPORTS.map((s) => (
            <button key={s} className={sport === s ? 'active' : ''} onClick={() => setSport(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div className="filter" style={{ marginBottom: 14 }}>
        <button className={stat === 'all' ? 'active' : ''} onClick={() => setStat('all')}>ALL</button>
        {stats.map((s) => (
          <button key={s} className={stat === s ? 'active' : ''} onClick={() => setStat(s)}>{s.toUpperCase()}</button>
        ))}
      </div>

      <div className="bk-table">
        {filtered.map((p, i) => (
          <div key={i} className="bk-row res-pending">
            <div className="bk-row-main">
              <div className="bk-row-desc">
                <span className={'lg-badge ' + (p.sport === 'NFL' ? 'nfl' : 'cfb')}>{p.sport}</span>
                <strong>{p.player}</strong>
                <span className="bk-odds">{p.team}</span>
                <span className="bk-odds" style={{ color: 'var(--gold)' }}>{p.stat}</span>
              </div>
              <div className="bk-row-meta">
                {p.line != null ? `Line: ${p.line}` : 'Yes/No prop'}
              </div>
            </div>
            <div className="bk-row-pl" style={{ gap: 6 }}>
              <div className="prop-side">
                <span className="prop-label">{p.line != null ? 'O' : 'YES'}</span>
                <span className="prop-odd">{p.over > 0 ? '+' : ''}{p.over}</span>
              </div>
              <div className="prop-side">
                <span className="prop-label">{p.line != null ? 'U' : 'NO'}</span>
                <span className="prop-odd">{p.under > 0 ? '+' : ''}{p.under}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="footnote-disclaimer" style={{ maxWidth: 600 }}>
        Demo prop board. Replace MOCK_PROPS with a real props feed when an odds API is wired.
      </p>
    </section>
  );
}
