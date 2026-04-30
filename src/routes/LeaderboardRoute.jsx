import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../lib/auth.jsx';
import {
  useCurrentContest,
  useContestLeaderboard,
  useContestArchive,
  useContestGrader,
} from '../hooks/useContest.js';
import { useLeaderboard } from '../hooks/useLeaderboard.js';
import { fmtNet, fmtPct, SPORT_LABELS, SPORTS } from '../lib/userPicks.js';

/**
 * /leaderboard — two views, tabbed at the top:
 *
 *   Hot Capper (default) — the public Hot/Not board sourced from
 *     leaderboard_window. Window × sport filters, qualifying min-sample
 *     enforced server-side via the view's where-clause-friendly index.
 *
 *   Weekly contest — the existing contest leaderboard for the current
 *     week, plus the past-winners archive. Untouched from before.
 */
export default function LeaderboardRoute() {
  const [view, setView] = useState('hot');

  return (
    <section>
      <div className="tabs pf-window-tabs" role="tablist" aria-label="Leaderboard view">
        <button type="button" className={'tab' + (view === 'hot' ? ' active' : '')} onClick={() => setView('hot')}>
          Hot Capper
        </button>
        <button type="button" className={'tab' + (view === 'contest' ? ' active' : '')} onClick={() => setView('contest')}>
          Weekly Contest
        </button>
      </div>

      {view === 'hot'     ? <HotCapperBoard />     : <WeeklyContestBoard />}
    </section>
  );
}

// =============================================================
// Hot Capper — sport × window leaderboard from leaderboard_window
// =============================================================
function HotCapperBoard() {
  const [windowKey, setWindowKey] = useState('month');
  const [sport, setSport]         = useState('all');

  const { rows: hot,   loading: hotLoading } = useLeaderboard({ window: windowKey, sport, side: 'hot',  limit: 25 });
  const { rows: notRows, loading: notLoading } = useLeaderboard({ window: windowKey, sport, side: 'not', limit: 25 });

  return (
    <>
      <div className="bk-header" style={{ marginTop: 14 }}>
        <div>
          <div className="trc-eyebrow">Hot Capper</div>
          <div className="trc-final">
            Who's running it up
            <span className="trc-final-sub">
              Sorted by net units. Min sample enforced. Juice + point-buy cost shown.
            </span>
          </div>
        </div>
      </div>

      <div className="tabs pf-window-tabs" role="tablist" aria-label="Window">
        {[
          { k: 'week',   label: 'This Week' },
          { k: 'month',  label: 'This Month' },
          { k: 'season', label: 'Season' },
        ].map((t) => (
          <button key={t.k} type="button"
            className={'tab' + (windowKey === t.k ? ' active' : '')}
            onClick={() => setWindowKey(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="tabs pf-sport-tabs" role="tablist" aria-label="Sport">
        {[ 'all', ...SPORTS ].map((s) => (
          <button key={s} type="button"
            className={'tab' + (s === sport ? ' active' : '')}
            onClick={() => setSport(s)}>
            {SPORT_LABELS[s] || s.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="about-block">
        <h3 style={{ color: 'var(--green)' }}>🔥 Who's Hot</h3>
        {hotLoading ? (
          <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>
        ) : hot.length === 0 ? (
          <EmptyBoard side="hot" sport={sport} windowKey={windowKey} />
        ) : (
          <BoardTable rows={hot} side="hot" />
        )}
      </div>

      <div className="about-block">
        <h3 style={{ color: 'var(--red)' }}>❄ Who's Not</h3>
        {notLoading ? (
          <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>
        ) : notRows.length === 0 ? (
          <EmptyBoard side="not" sport={sport} windowKey={windowKey} />
        ) : (
          <BoardTable rows={notRows} side="not" />
        )}
      </div>

      <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)', marginTop: 4, letterSpacing: '0.04em' }}>
        Records grade automatically from final scores. Picks are immutable after kickoff. See your own profile to qualify.
      </p>
    </>
  );
}

function BoardTable({ rows, side }) {
  return (
    <div className="bk-table">
      {rows.map((r, i) => (
        <Link key={r.userId} to={`/u/${r.handle}`} className="bk-row pf-pick" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="bk-row-main">
            <div className="bk-row-desc">
              <span className="lg-badge" style={{ minWidth: 32, textAlign: 'center' }}>{i + 1}</span>
              <strong>{r.displayName}</strong>
              <span className="pf-pick-author">@{r.handle}</span>
              {r.isSystem ? <span className="pf-system-badge">OFFICIAL</span> : null}
              <span className="pf-bet-type">{(r.league || '').toUpperCase()}</span>
            </div>
            <div className="bk-row-meta">
              {r.wins}-{r.losses}{r.pushes ? `-${r.pushes}` : ''} · {fmtPct(r.winPctAtLine)} at line · {r.picksCount} picks
              · juice {r.juicePaid.toFixed(1)}u · pt-buy {r.pointBuyCost > 0 ? '+' : ''}{r.pointBuyCost.toFixed(1)}u
            </div>
          </div>
          <div className="bk-row-pl">
            <div className={'bk-pl ' + (side === 'hot' ? 'pos' : 'neg')}>
              {fmtNet(r.unitsWonNet)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function EmptyBoard({ side, sport, windowKey }) {
  const sportLabel = sport === 'all' ? 'any sport' : (SPORT_LABELS[sport] || sport.toUpperCase());
  const winLabel = windowKey === 'week' ? 'this week' : windowKey === 'month' ? 'this month' : 'this season';
  if (side === 'hot') {
    return (
      <p style={{ color: 'var(--ink-dim)' }}>
        Nobody qualifies in {sportLabel} {winLabel} yet. Make picks on{' '}
        <Link to="/scores" style={{ color: 'var(--gold)' }}>/scores</Link>{' '}
        to start your record.
      </p>
    );
  }
  return (
    <p style={{ color: 'var(--ink-dim)' }}>
      Nobody's underwater {winLabel} in {sportLabel}. Yet.
    </p>
  );
}

// =============================================================
// Weekly contest — preserved from the previous LeaderboardRoute
// =============================================================
function WeeklyContestBoard() {
  const { user } = useUser?.() || {};
  const { contest, loading } = useCurrentContest();
  useContestGrader(contest?.id);
  const { rows } = useContestLeaderboard(contest);
  const archive = useContestArchive();

  return (
    <>
      <div className="bk-header" style={{ marginTop: 14 }}>
        <div>
          <div className="trc-eyebrow">Weekly contest</div>
          <div className="trc-final">
            {contest ? `Week ${contest.week}` : '—'}
            <span className="trc-final-sub">
              {contest ? `${contest.season} season · ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}` : 'No contest open'}
            </span>
          </div>
        </div>
        <Link to="/contest" className="btn-gold" style={{ alignSelf: 'center' }}>
          Enter contest →
        </Link>
      </div>

      {loading && <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>}

      {!loading && (!rows || rows.length === 0) && (
        <div className="empty">No entries yet for this week. Be first.</div>
      )}

      {rows.length > 0 && (
        <div className="bk-table" style={{ marginBottom: 24 }}>
          {rows.map((r, i) => (
            <div key={r.id} className={'bk-row ' + (r.user_id === user?.id ? 'res-pending' : '')} style={{ alignItems: 'center' }}>
              <div className="bk-row-main">
                <div className="bk-row-desc">
                  <span className="lg-badge nfl" style={{ minWidth: 36, textAlign: 'center' }}>{i + 1}</span>
                  <strong>{r.user_id === user?.id ? 'You' : shortenUserId(r.user_id)}</strong>
                  {!r.qualified && <span className="bk-odds" style={{ color: 'var(--bad)' }}>not qualified</span>}
                </div>
                <div className="bk-row-meta" style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
                  {r.picks_count} picks · MNF: {r.mnf_total_prediction ?? '—'} pts / {r.mnf_qb_yds_prediction ?? '—'} pass yds
                </div>
              </div>
              <div className="bk-row-pl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <strong style={{ fontSize: 18, color: 'var(--gold)' }}>
                  {r.wins}-{r.losses}{r.pushes ? `-${r.pushes}` : ''}
                </strong>
                {contest?.mnf_total_actual != null && r.mnf_total_diff != null && (
                  <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>
                    diff: {r.mnf_total_diff} pts / {r.mnf_qb_yds_diff ?? '—'} yds
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {archive.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 8, color: 'var(--gold)' }}>Past winners</h3>
          <div className="bk-table">
            {archive.map((c) => (
              <div key={c.id} className="bk-row">
                <div className="bk-row-main">
                  <div className="bk-row-desc">
                    <span className="lg-badge nfl">W{c.week}</span>
                    <strong>{c.season} Week {c.week}</strong>
                  </div>
                  <div className="bk-row-meta" style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
                    {c.end_at ? new Date(c.end_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <div className="bk-row-pl">
                  {c.winner_user_id ? (
                    <span style={{ color: 'var(--gold)' }}>{shortenUserId(c.winner_user_id)}</span>
                  ) : (
                    <span style={{ color: 'var(--ink-dim)' }}>pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// Privacy: don't expose full user IDs / emails publicly. Show first 6 chars only.
function shortenUserId(uid) {
  if (!uid) return '—';
  return String(uid).slice(0, 6);
}
