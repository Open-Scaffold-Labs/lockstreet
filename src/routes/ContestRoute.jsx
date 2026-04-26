import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser, SignInButton, SignedIn, SignedOut } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import {
  useCurrentContest,
  useMyContestEntry,
  submitContestEntry,
} from '../hooks/useContest.js';

/**
 * Weekly pick'em contest entry form.
 *
 * Rules:
 *  - Pick a side ATS for every NFL game on the slate (10 expected; all-available
 *    during NFL playoffs).
 *  - Pick a side ATS for every CFB game on the slate (10 expected; all-available
 *    during bowl season).
 *  - Submit two MNF tiebreaker predictions: total points + combined QB pass yds.
 *  - Submit before first kickoff of the week. After that, picks are locked.
 *  - Best record wins 1 free week of subscription. Tiebreakers (in order):
 *      1) closest to MNF total points
 *      2) closest to combined MNF QB passing yards
 */

export default function ContestRoute() {
  const { user } = useUser?.() || {};
  const toast = useToast?.() || {};
  const { contest, nflGames, cfbGames, loading, error } = useCurrentContest();
  const { entry, picks, refresh } = useMyContestEntry(contest?.id, user?.id);

  const [picksByGame, setPicksByGame] = useState({});  // { game_id: { side, league, ... } }
  const [mnfTotal, setMnfTotal] = useState('');
  const [mnfQbYds, setMnfQbYds] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Hydrate local state from saved entry/picks on load
  useEffect(() => {
    if (entry) {
      setMnfTotal(entry.mnf_total_prediction != null ? String(entry.mnf_total_prediction) : '');
      setMnfQbYds(entry.mnf_qb_yds_prediction != null ? String(entry.mnf_qb_yds_prediction) : '');
    }
    if (picks?.length) {
      const idx = {};
      for (const p of picks) idx[p.game_id] = p;
      setPicksByGame(idx);
    }
  }, [entry, picks]);

  // Slates filtered to upcoming-only
  const nfl = useMemo(() => (nflGames || []).filter((g) => g.status === 'upcoming'), [nflGames]);
  const cfb = useMemo(() => (cfbGames || []).filter((g) => g.status === 'upcoming'), [cfbGames]);

  // Required pick counts (adapt to bowl/playoff slate sizes)
  const nflRequired = nfl.length >= 10 ? 10 : nfl.length;
  const cfbRequired = cfb.length >= 10 ? 10 : cfb.length;
  const totalRequired = nflRequired + cfbRequired;

  const nflPicked = nfl.filter((g) => picksByGame[g.id]).length;
  const cfbPicked = cfb.filter((g) => picksByGame[g.id]).length;
  const totalPicked = nflPicked + cfbPicked;
  const qualified = nflPicked >= nflRequired && cfbPicked >= cfbRequired;
  const tieBreakersOk = mnfTotal !== '' && mnfQbYds !== '';

  // Lock detection: first kickoff has passed
  const locked = contest?.first_kickoff_at && new Date(contest.first_kickoff_at) < new Date();

  function setSide(g, side, league) {
    if (locked) return;
    setPicksByGame((prev) => {
      const next = { ...prev };
      if (next[g.id]?.side === side) {
        delete next[g.id]; // toggle off
      } else {
        next[g.id] = {
          game_id:    g.id,
          league,
          home_abbr:  g.home?.abbr,
          away_abbr:  g.away?.abbr,
          kickoff_at: g.kickoff,
          side,
          spread_taken: parseSpread(g.spread, side, g.home?.abbr, g.away?.abbr),
        };
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!user?.id || !contest?.id) return;
    if (!qualified) {
      toast.error?.(`Need ${totalRequired} picks (${nflRequired} NFL + ${cfbRequired} CFB).`);
      return;
    }
    if (!tieBreakersOk) {
      toast.error?.('Both Monday Night tiebreakers required.');
      return;
    }
    setSubmitting(true);
    try {
      await submitContestEntry({
        contestId: contest.id,
        userId: user.id,
        mnfTotalPrediction: Number(mnfTotal),
        mnfQbYdsPrediction: Number(mnfQbYds),
        picks: Object.values(picksByGame),
      });
      toast.success?.('Entry locked in. Good luck.');
      await refresh();
    } catch (e) {
      toast.error?.(`Submit failed: ${e.message || e}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ============= render =============

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Weekly contest</div>
          <div className="trc-final">
            {contest ? `Week ${contest.week}` : '—'}
            <span className="trc-final-sub">
              {contest ? `${contest.season} season · winner gets 1 free week` : 'No contest open'}
            </span>
          </div>
        </div>
        <Link to="/leaderboard" className="trc-btn-sm" style={{ alignSelf: 'center' }}>
          Leaderboard →
        </Link>
      </div>

      <SignedOut>
        <div className="empty" style={{ padding: 18 }}>
          <strong>Sign in to enter the contest.</strong>{' '}
          Free to enter — winner each week gets a free week of paid picks.
          <div style={{ marginTop: 10 }}>
            <SignInButton mode="modal"><button className="trc-btn-sm">Sign in</button></SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        {loading && <p style={{ color: 'var(--ink-dim)' }}>Loading contest...</p>}
        {error && <p style={{ color: 'var(--bad)' }}>Error: {error}</p>}

        {!loading && !contest && (
          <div className="empty" style={{ padding: 18 }}>
            <strong>No active contest yet.</strong>{' '}
            Contests open weekly during NFL/CFB season. Check back closer to kickoff.
          </div>
        )}

        {contest && (
          <>
            {locked ? (
              <div className="empty" style={{ padding: 18, marginBottom: 14 }}>
                <strong>Picks are locked for this week.</strong>{' '}
                First kickoff has passed. <Link to="/leaderboard">View standings →</Link>
              </div>
            ) : (
              <div className="contest-summary" style={{
                padding: 14, marginBottom: 14, background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong style={{ color: qualified ? 'var(--gold)' : 'var(--ink)' }}>
                      {totalPicked} / {totalRequired} picks
                    </strong>{' '}
                    <span style={{ color: 'var(--ink-dim)' }}>
                      ({nflPicked}/{nflRequired} NFL · {cfbPicked}/{cfbRequired} CFB)
                    </span>
                  </div>
                  {contest.first_kickoff_at && (
                    <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>
                      Locks {new Date(contest.first_kickoff_at).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <h3 style={{ marginTop: 24, marginBottom: 8, color: 'var(--gold)' }}>NFL · pick {nflRequired}</h3>
            <PickList games={nfl} league="nfl" picksByGame={picksByGame} setSide={setSide} locked={locked} />

            <h3 style={{ marginTop: 24, marginBottom: 8, color: 'var(--gold)' }}>CFB · pick {cfbRequired}</h3>
            <PickList games={cfb} league="cfb" picksByGame={picksByGame} setSide={setSide} locked={locked} />

            <h3 style={{ marginTop: 24, marginBottom: 8, color: 'var(--gold)' }}>Monday Night Tiebreakers</h3>
            <div style={{
              padding: 14, background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Total points (combined)</span>
                <input
                  type="number" min="0" max="120" value={mnfTotal} disabled={locked}
                  onChange={(e) => setMnfTotal(e.target.value)}
                  placeholder="e.g. 47"
                  style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>Combined QB passing yds</span>
                <input
                  type="number" min="0" max="900" value={mnfQbYds} disabled={locked}
                  onChange={(e) => setMnfQbYds(e.target.value)}
                  placeholder="e.g. 480"
                  style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink)' }}
                />
              </label>
            </div>

            {!locked && (
              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !qualified || !tieBreakersOk}
                  className="trc-btn-primary"
                  style={{ opacity: (qualified && tieBreakersOk && !submitting) ? 1 : 0.5 }}
                >
                  {submitting ? 'Saving...' : entry ? 'Update entry' : 'Lock in entry'}
                </button>
              </div>
            )}
          </>
        )}
      </SignedIn>

      <p className="footnote-disclaimer" style={{ maxWidth: 600, marginTop: 20 }}>
        Free contest. {totalRequired || 20} picks required to qualify. Best record wins 1 free week of Lock Street picks.
        Tiebreakers: closest to MNF total points, then closest to combined MNF QB passing yards.
      </p>
    </section>
  );
}

// ----- subcomponents -----

function PickList({ games, league, picksByGame, setSide, locked }) {
  if (!games || games.length === 0) {
    return <p style={{ color: 'var(--ink-dim)' }}>No upcoming games this week.</p>;
  }
  return (
    <div className="bk-table">
      {games.map((g) => {
        const picked = picksByGame[g.id];
        const homeSel = picked?.side === g.home?.abbr;
        const awaySel = picked?.side === g.away?.abbr;
        return (
          <div key={g.id} className="bk-row" style={{ alignItems: 'center' }}>
            <div className="bk-row-main">
              <div className="bk-row-desc">
                <span className={'lg-badge ' + league}>{league.toUpperCase()}</span>
                <strong>{g.away?.abbr} @ {g.home?.abbr}</strong>
                <span className="bk-odds">{g.spread || '—'}</span>
              </div>
              <div className="bk-row-meta" style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
                {g.kickoff ? new Date(g.kickoff).toLocaleString([], { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric' }) : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setSide(g, g.away?.abbr, league)}
                disabled={locked}
                className={awaySel ? 'trc-btn-primary' : 'trc-btn-sm'}
                style={{ minWidth: 64 }}
              >
                {g.away?.abbr}
              </button>
              <button
                onClick={() => setSide(g, g.home?.abbr, league)}
                disabled={locked}
                className={homeSel ? 'trc-btn-primary' : 'trc-btn-sm'}
                style={{ minWidth: 64 }}
              >
                {g.home?.abbr}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Parse the spread for the side the user picked, e.g. "PHI -3.5" with side "PHI" → -3.5,
// or "PHI -3.5" with side "DAL" → +3.5. Returns 0 if we can't parse.
function parseSpread(spreadStr, side, homeAbbr, awayAbbr) {
  if (!spreadStr) return 0;
  const m = String(spreadStr).match(/([A-Z]{2,4})\s*([+-]?\d+(\.\d+)?)/);
  if (!m) return 0;
  const team = m[1];
  const num = Number(m[2]);
  if (team === side) return num;
  // Other side gets the inverse
  return -num;
}
