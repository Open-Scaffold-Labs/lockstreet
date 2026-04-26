import { Link } from 'react-router-dom';
import { useUser } from '../lib/auth.jsx';
import {
  useCurrentContest,
  useContestLeaderboard,
  useContestArchive,
  useContestGrader,
} from '../hooks/useContest.js';

/**
 * Weekly leaderboard for the active contest plus a hall-of-fame archive
 * of past weekly winners. Sorted by:
 *   wins desc → losses asc → MNF total diff asc → MNF QB pass yds diff asc
 */
export default function LeaderboardRoute() {
  const { user } = useUser?.() || {};
  const { contest, loading } = useCurrentContest();
  useContestGrader(contest?.id);   // lazy auto-grade on every leaderboard load
  const { rows } = useContestLeaderboard(contest);
  const archive = useContestArchive();

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Leaderboard</div>
          <div className="trc-final">
            {contest ? `Week ${contest.week}` : '—'}
            <span className="trc-final-sub">
              {contest ? `${contest.season} season · ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}` : 'No contest open'}
            </span>
          </div>
        </div>
        <Link to="/contest" className="trc-btn-sm" style={{ alignSelf: 'center' }}>
          Enter contest →
        </Link>
      </div>

      {loading && <p style={{ color: 'var(--ink-dim)' }}>Loading...</p>}

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
    </section>
  );
}

// Privacy: don't expose full user IDs / emails publicly. Show first 6 chars only.
function shortenUserId(uid) {
  if (!uid) return '—';
  return String(uid).slice(0, 6);
}
