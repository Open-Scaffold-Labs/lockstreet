import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { supabase } from '../lib/supabase.js';
import GamePicker from '../components/GamePicker.jsx';
import { parseSpread } from '../components/LogBetForm.jsx';
import { useCurrentContest, useContestLeaderboard } from '../hooks/useContest.js';

/**
 * Admin pick-poster.
 * Posts go directly into the public.picks table via Supabase (RLS-gated to admins).
 * Same UX as bankroll: League/Week → Game → Side → Details.
 */
export default function AdminRoute() {
  return (
    <section>
      <SignedOut>
        <div className="empty">
          Admin panel requires sign-in.
          <div style={{ marginTop: 14 }}>
            <SignInButton afterSignInUrl="/admin">
              <button className="btn-gold">Sign in</button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn><AdminInner /></SignedIn>
    </section>
  );
}

function AdminInner() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'admin';
  const toast = useToast();
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postOpen, setPostOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const loadPicks = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .order('posted_at', { ascending: false });
    if (!error) setPicks(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadPicks(); }, [loadPicks]);

  if (!isAdmin) {
    return (
      <div className="empty">
        <h2 style={{ marginTop: 0 }}>Admin only</h2>
        <p style={{ color: 'var(--ink-dim)' }}>
          Your account doesn't have <code>app_metadata.role = 'admin'</code>. An admin can promote you via SQL.
        </p>
      </div>
    );
  }

  async function handleDelete(id) {
    if (!confirm('Delete this pick? This is permanent.')) return;
    const { error } = await supabase.from('picks').delete().eq('id', id);
    if (error) toast(error.message, { type: 'error' });
    else { toast('Deleted', { type: 'success' }); loadPicks(); }
  }

  async function handleSave(payload) {
    const { data, error } = await supabase
      .from('picks')
      .upsert({
        game_id:    payload.gameId,
        league:     payload.league,
        season:     payload.season,
        week:       payload.week ? Number(String(payload.week).replace(/\D/g, '')) || null : null,
        side:       payload.side,
        units:      payload.units,
        reasoning:  payload.reasoning || null,
        visibility: payload.visibility,
        locks_at:   payload.locksAt || null,
        created_by: user.id,
      }, { onConflict: 'game_id' })
      .select()
      .single();
    if (error) throw error;
    toast('Pick posted', { type: 'success' });
    setPostOpen(false);
    loadPicks();
    return data;
  }

  return (
    <>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Admin · Pick board</div>
          <div className="trc-final">
            {picks.length}<span className="trc-final-sub">picks posted · <Link to="/picks" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>view live at /picks →</Link></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setEmailOpen(true)}>Email subs</button>
          <button className="btn-gold" onClick={() => setPostOpen(true)}>+ Post pick</button>
        </div>
      </div>

      <div className="about-block">
        <h3>Posted picks</h3>
        {loading ? (
          <p style={{ color: 'var(--ink-dim)' }}>Loading...</p>
        ) : picks.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-dim)' }}>
            <p style={{ marginBottom: 16 }}>No picks posted yet. Drop your first pick.</p>
            <button className="btn-gold" onClick={() => setPostOpen(true)}>+ Post your first pick</button>
          </div>
        ) : (
          <div className="bk-table">
            {picks.map((p) => (
              <div key={p.id} className={`bk-row res-${p.result}`}>
                <div className="bk-row-main">
                  <div className="bk-row-desc">
                    <span className={'lg-badge ' + (p.league || 'nfl')}>{(p.league || 'NFL').toUpperCase()}</span>
                    <strong>{p.side}</strong>
                    <span className="bk-odds">{p.units}u</span>
                    {p.visibility === 'public'
                      ? <span className="bk-odds" style={{ color: 'var(--green)' }}>PUBLIC</span>
                      : <span className="bk-odds" style={{ color: 'var(--gold)' }}>PAID</span>}
                  </div>
                  <div className="bk-row-meta">
                    Wk {p.week || '?'} · game {p.game_id} · posted {new Date(p.posted_at).toLocaleString()}
                  </div>
                  {p.reasoning && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.5 }}>
                      {p.reasoning.slice(0, 180)}{p.reasoning.length > 180 ? '...' : ''}
                    </div>
                  )}
                </div>
                <div className="bk-row-pl">
                  <Link to={`/picks#${p.game_id}`} className="btn-ghost">View</Link>
                  <button className="bk-x" onClick={() => handleDelete(p.id)} aria-label="Delete">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {postOpen && <PostPickModal onSave={handleSave} onCancel={() => setPostOpen(false)} />}
      {emailOpen && <EmailSubsModal onCancel={() => setEmailOpen(false)} toast={toast} />}

      <ContestAdminPanel toast={toast} />
    </>
  );
}

// =====================================================================
// Contest admin: create a contest, set MNF actuals, grant prize to winner.
// Phase 1 — manual operations. Phase 2 will auto-grade + auto-grant.
// =====================================================================

function ContestAdminPanel({ toast }) {
  const { contest, refresh: refreshContest } = useCurrentContest();
  const { rows: leaderboard, refresh: refreshBoard } = useContestLeaderboard(contest);

  const [mnfTotal, setMnfTotal] = useState('');
  const [mnfQbYds, setMnfQbYds] = useState('');
  const [creating, setCreating] = useState(false);

  // Hydrate from contest record
  useEffect(() => {
    if (contest) {
      setMnfTotal(contest.mnf_total_actual != null ? String(contest.mnf_total_actual) : '');
      setMnfQbYds(contest.mnf_qb_yds_actual != null ? String(contest.mnf_qb_yds_actual) : '');
    }
  }, [contest]);

  async function handleCreateContest(season, week, firstKickoff) {
    setCreating(true);
    const { error } = await supabase.from('contests').insert({
      season: Number(season),
      week: Number(week),
      status: 'open',
      first_kickoff_at: firstKickoff || null,
    });
    setCreating(false);
    if (error) {
      toast.error?.(`Create failed: ${error.message}`);
    } else {
      toast.success?.('Contest created.');
      refreshContest();
    }
  }

  async function handleSaveMnfActuals() {
    if (!contest) return;
    const { error } = await supabase
      .from('contests')
      .update({
        mnf_total_actual: mnfTotal !== '' ? Number(mnfTotal) : null,
        mnf_qb_yds_actual: mnfQbYds !== '' ? Number(mnfQbYds) : null,
      })
      .eq('id', contest.id);
    if (error) {
      toast.error?.(`Save failed: ${error.message}`);
    } else {
      toast.success?.('MNF actuals saved.');
      refreshContest();
      refreshBoard();
    }
  }

  async function handleGrantWinner(userId) {
    if (!contest) return;
    if (!confirm('Grant 1 free week to this user and mark contest paid?')) return;

    // 1. Set winner_user_id and mark contest paid
    const { error: e1 } = await supabase
      .from('contests')
      .update({ winner_user_id: userId, status: 'paid', end_at: new Date().toISOString() })
      .eq('id', contest.id);
    if (e1) { toast.error?.(`Mark winner failed: ${e1.message}`); return; }

    // 2. Extend / create subscription row by 7 days
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const newPeriodEnd = existing?.current_period_end && new Date(existing.current_period_end) > new Date()
      ? new Date(new Date(existing.current_period_end).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : sevenDaysFromNow;

    const { error: e2 } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          tier: existing?.tier || 'weekly',
          status: 'active',
          current_period_end: newPeriodEnd,
        },
        { onConflict: 'user_id' }
      );
    if (e2) { toast.error?.(`Subscription update failed: ${e2.message}`); return; }

    toast.success?.('Winner granted 1 free week.');
    refreshContest();
    refreshBoard();
  }

  return (
    <div className="about-block" style={{ marginTop: 24 }}>
      <h3>Contest admin</h3>

      {!contest ? (
        <CreateContestForm onCreate={handleCreateContest} creating={creating} />
      ) : (
        <>
          <p style={{ color: 'var(--ink-dim)', marginBottom: 12 }}>
            <strong style={{ color: 'var(--gold)' }}>{contest.season} Week {contest.week}</strong>
            {' · '}status: {contest.status}
            {' · '}{leaderboard.length} entries
            {contest.first_kickoff_at ? ` · locks ${new Date(contest.first_kickoff_at).toLocaleString()}` : ''}
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 16,
            alignItems: 'end',
          }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>MNF total points (actual)</span>
              <input type="number" value={mnfTotal} onChange={(e) => setMnfTotal(e.target.value)}
                style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>MNF combined QB pass yds (actual)</span>
              <input type="number" value={mnfQbYds} onChange={(e) => setMnfQbYds(e.target.value)}
                style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink)' }} />
            </label>
            <button className="btn-ghost" onClick={handleSaveMnfActuals}>Save MNF</button>
          </div>

          <h4 style={{ marginBottom: 8 }}>Top of leaderboard</h4>
          {leaderboard.length === 0 ? (
            <p style={{ color: 'var(--ink-dim)' }}>No entries yet.</p>
          ) : (
            <div className="bk-table">
              {leaderboard.slice(0, 10).map((r, i) => (
                <div key={r.id} className="bk-row">
                  <div className="bk-row-main">
                    <div className="bk-row-desc">
                      <span className="lg-badge nfl">{i + 1}</span>
                      <strong>{String(r.user_id).slice(0, 8)}</strong>
                      <span className="bk-odds">{r.wins}-{r.losses}{r.pushes ? `-${r.pushes}` : ''}</span>
                      {!r.qualified && <span className="bk-odds" style={{ color: 'var(--bad)' }}>not qualified</span>}
                    </div>
                    <div className="bk-row-meta" style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
                      MNF guess: {r.mnf_total_prediction ?? '—'} pts / {r.mnf_qb_yds_prediction ?? '—'} yds
                      {r.mnf_total_diff != null ? ` · diff: ${r.mnf_total_diff} / ${r.mnf_qb_yds_diff}` : ''}
                    </div>
                  </div>
                  <div className="bk-row-pl">
                    <button className="btn-gold" onClick={() => handleGrantWinner(r.user_id)} disabled={contest.status === 'paid'}>
                      Grant week
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CreateContestForm({ onCreate, creating }) {
  const [season, setSeason] = useState(2026);
  const [week, setWeek] = useState(1);
  const [firstKickoff, setFirstKickoff] = useState('');

  return (
    <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <p style={{ marginBottom: 12, color: 'var(--ink-dim)' }}>No active contest. Create one to open entries.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8, alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Season</span>
          <input type="number" value={season} onChange={(e) => setSeason(e.target.value)}
            style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink)' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Week</span>
          <input type="number" value={week} onChange={(e) => setWeek(e.target.value)}
            style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink)' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>First kickoff (lock time)</span>
          <input type="datetime-local" value={firstKickoff} onChange={(e) => setFirstKickoff(e.target.value)}
            style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--ink)' }} />
        </label>
        <button className="btn-gold" onClick={() => onCreate(season, week, firstKickoff ? new Date(firstKickoff).toISOString() : null)} disabled={creating}>
          {creating ? '...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function EmailSubsModal({ onCancel, toast }) {
  const [subject, setSubject] = useState('Lock Street — this week\'s preview');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/send-weekly', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ subject, headline, body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast(`Sent to ${j.sent}/${j.total} subscribers`, { type: 'success', duration: 5000 });
      onCancel();
    } catch (e) {
      toast(e.message || 'Send failed', { type: 'error', duration: 6000 });
    } finally { setBusy(false); }
  }

  return (
    <div className="onboarding-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="onboarding-card lbf-card lbf-multi">
        <button className="ob-skip" onClick={onCancel}>Cancel</button>
        <div className="ob-eyebrow">Email blast · active subscribers only</div>
        <h2 className="ob-title" style={{ fontSize: 22 }}>Weekly email</h2>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginBottom: 12 }}>
          Free users won't receive this. Goes only to users with active subscriptions.
        </p>
        <div className="lbf-form">
          <label>Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
          </label>
          <label>Headline (in-email H1)
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Your week 5 picks are live" />
          </label>
          <label>Body (HTML allowed)
            <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="<p>Quick preview of this week's slate...</p>"
              style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: '#0a0e17', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 13, resize: 'vertical' }} />
          </label>
        </div>
        <div className="ob-actions" style={{ marginTop: 12 }}>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-gold" onClick={send} disabled={busy || !subject || !body}>
            {busy ? 'Sending...' : 'Send to subscribers'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PostPickModal({ onSave, onCancel }) {
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const [betType, setBetType] = useState('spread');
  const [side, setSide]       = useState(null);
  const [spreadTaken, setSpreadTaken] = useState('');
  const [totalTaken,  setTotalTaken]  = useState('');
  const [units, setUnits]     = useState('3');
  const [visibility, setVisibility] = useState('paid');
  const [reasoning, setReasoning]   = useState('');

  function pickGame(g) {
    setGame(g);
    const m = parseSpread(g.spread, g.away?.abbr, g.home?.abbr);
    if (m) setSpreadTaken(String(m.home));
    if (g.ou) setTotalTaken(g.ou);
  }

  async function submit() {
    if (!game || !side) return;
    setBusy(true); setErr(null);
    try {
      const sideStr = describePickSide(game, side, betType, spreadTaken, totalTaken);
      const payload = {
        gameId: game.id,
        league: game.league,
        season: game.season,
        week:   game.weekKey,
        side:   sideStr,
        units:  Number(units) || 1,
        visibility,
        reasoning,
        locksAt: game.kickoff,
      };
      await onSave(payload);
    } catch (e) { setErr(e.message || 'Failed'); setBusy(false); }
  }

  if (!game) {
    return (
      <div className="onboarding-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
        <div className="onboarding-card lbf-card lbf-multi" role="dialog" aria-modal="true">
          <button className="ob-skip" onClick={onCancel}>Cancel</button>
          <div className="ob-eyebrow">Post a pick · Pick the game</div>
          <h2 className="ob-title" style={{ fontSize: 20, marginBottom: 14 }}>Which game?</h2>
          <GamePicker onPick={pickGame} onCancel={onCancel} filterStatus="upcoming" embedded />
        </div>
      </div>
    );
  }

  const m = parseSpread(game.spread, game.away?.abbr, game.home?.abbr);
  const homeLine = m ? formatSpread(m.home) : '';
  const awayLine = m ? formatSpread(-m.home) : '';
  const valid = !!side && (
    (betType === 'spread' && spreadTaken !== '') ||
    (betType === 'total'  && totalTaken  !== '') ||
    (betType === 'moneyline')
  );

  return (
    <div className="onboarding-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="onboarding-card lbf-card lbf-multi" role="dialog" aria-modal="true">
        <button className="ob-skip" onClick={onCancel}>Cancel</button>
        <div className="ob-eyebrow">Post a pick · Side + reasoning</div>
        <h2 className="ob-title" style={{ fontSize: 20 }}>{game.away?.abbr} @ {game.home?.abbr}</h2>
        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

        <div className="lbf-bettype-row">
          {[
            { v: 'spread', label: 'Spread' },
            { v: 'total',  label: 'Total' },
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
                <div className="lbf-side-line">{awayLine || '—'}</div>
              </button>
              <button className={'lbf-side' + (side === 'home' ? ' active' : '')} onClick={() => setSide('home')}>
                <div className="lbf-side-team">{game.home?.abbr}</div>
                <div className="lbf-side-line">{homeLine || '—'}</div>
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
                <div className="lbf-side-team">{game.away?.abbr}</div><div className="lbf-side-line">ML</div>
              </button>
              <button className={'lbf-side' + (side === 'home' ? ' active' : '')} onClick={() => setSide('home')}>
                <div className="lbf-side-team">{game.home?.abbr}</div><div className="lbf-side-line">ML</div>
              </button>
            </>
          )}
        </div>

        <div className="lbf-form" style={{ marginTop: 12 }}>
          {betType === 'spread' && (
            <label>Spread on the pick
              <input type="number" step="0.5" value={spreadTaken} onChange={(e) => setSpreadTaken(e.target.value)} placeholder="-3.5" />
            </label>
          )}
          {betType === 'total' && (
            <label>Total on the pick
              <input type="number" step="0.5" value={totalTaken} onChange={(e) => setTotalTaken(e.target.value)} placeholder="47.5" />
            </label>
          )}
          <div className="lbf-row">
            <label>Units (1-5)
              <input type="number" min="0.5" max="5" step="0.5" value={units} onChange={(e) => setUnits(e.target.value)} />
            </label>
            <label>Visibility
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                <option value="paid">Paid (subscribers only)</option>
                <option value="public">Free pick (visible to everyone)</option>
              </select>
            </label>
          </div>
          <label>Reasoning (subscribers see this)
            <textarea
              value={reasoning} onChange={(e) => setReasoning(e.target.value)}
              rows={4} placeholder="Sharp money came in early on home. PHI's road QB rating in November is..."
              style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-strong)', background: '#0a0e17', color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 13, resize: 'vertical' }}
            />
          </label>
        </div>

        <div className="ob-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn-ghost" onClick={() => setGame(null)}>← Different game</button>
          <button type="button" className="btn-gold" onClick={submit} disabled={!valid || busy}>
            {busy ? 'Posting...' : `Post pick → /picks`}
          </button>
        </div>
      </div>
    </div>
  );
}

function describePickSide(game, side, betType, spread, total) {
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

function formatSpread(n) {
  if (n == null || isNaN(n)) return '';
  return (n > 0 ? '+' : '') + n;
}
