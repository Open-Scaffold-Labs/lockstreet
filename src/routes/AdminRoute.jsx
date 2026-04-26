import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { supabase } from '../lib/supabase.js';
import GamePicker from '../components/GamePicker.jsx';
import { parseSpread } from '../components/LogBetForm.jsx';

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
        <button className="btn-gold" onClick={() => setPostOpen(true)}>+ Post pick</button>
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
    </>
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
