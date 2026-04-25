import { useEffect, useState } from 'react';
import { useUser, useAuth, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import { useEspnScoreboard } from '../hooks/useEspnScoreboard.js';

/**
 * Admin panel - for the bettor to post/schedule picks per game.
 *
 * Gating:
 *   1. Must be signed in (Supabase Auth).
 *   2. Must have app_metadata.role === 'admin' OR know the ADMIN_PASSWORD.
 */
export default function AdminRoute() {
  const { user } = useUser?.() || {};
  const { getToken } = useAuth?.() || {};
  const { games, loading: gamesLoading } = useEspnScoreboard();

  const isSupaAdmin = user?.publicMetadata?.role === 'admin';
  const [pw, setPw] = useState(sessionStorageGet('ls_admin_pw') || '');
  const [picks, setPicks] = useState([]);
  const [form, setForm] = useState({ gameId: '', side: '', units: 3 });
  const [status, setStatus] = useState(null);

  async function loadPicks() {
    const res = await fetch('/api/picks');
    if (res.ok) { const j = await res.json(); setPicks(j.picks || []); }
  }
  useEffect(() => { loadPicks(); }, []);

  async function savePick(e) {
    e.preventDefault();
    setStatus('saving...');
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Admin-Password': pw,
        },
        body: JSON.stringify({
          gameId: form.gameId,
          side: form.side,
          units: Number(form.units),
        }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      setStatus('saved OK');
      sessionStorageSet('ls_admin_pw', pw);
      await loadPicks();
      setForm({ gameId: '', side: '', units: 3 });
    } catch (e2) { setStatus('error: ' + e2.message); }
  }

  async function deletePick(gameId) {
    if (!confirm(`Remove pick for ${gameId}?`)) return;
    const token = getToken ? await getToken() : null;
    const res = await fetch(`/api/picks?gameId=${encodeURIComponent(gameId)}`, {
      method: 'DELETE',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Admin-Password': pw },
    });
    if (res.ok) loadPicks();
  }

  async function broadcast(gameId) {
    const token = getToken ? await getToken() : null;
    const res = await fetch('/api/send-notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Admin-Password': pw,
      },
      body: JSON.stringify({ gameId, title: 'New pick dropped', body: 'Open Lock Street to see it.' }),
    });
    setStatus(res.ok ? 'sent OK' : 'push failed');
  }

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

      <SignedIn>
        {!isSupaAdmin && (
          <div className="admin-card" style={{ marginBottom: 20 }}>
            <h3>Admin password</h3>
            <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 0 }}>
              Your account doesn't have <code>role=admin</code> in app_metadata yet - enter the
              <code> ADMIN_PASSWORD </code> from env to unlock write actions.
            </p>
            <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="ADMIN_PASSWORD" type="password" style={{ marginTop: 6 }} />
          </div>
        )}

        <div className="admin-grid">
          <div className="admin-card">
            <h3>Post a pick</h3>
            <form className="admin-form" onSubmit={savePick}>
              <label>Game</label>
              <select value={form.gameId} onChange={(e) => setForm((f) => ({ ...f, gameId: e.target.value }))} required disabled={gamesLoading}>
                <option value="">- select -</option>
                {games.filter((g) => g.status !== 'final').map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.away?.abbr} @ {g.home?.abbr} - {g.league.toUpperCase()} - {g.week}
                  </option>
                ))}
              </select>

              <label>Pick side</label>
              <input placeholder="e.g. PHI +3 / Under 47" value={form.side} onChange={(e) => setForm((f) => ({ ...f, side: e.target.value }))} required />

              <label>Units</label>
              <input type="number" min="0.5" max="10" step="0.5" value={form.units} onChange={(e) => setForm((f) => ({ ...f, units: e.target.value }))} required />

              <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
                <button className="btn-gold" type="submit">Save pick</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)' }}>{status}</span>
              </div>
            </form>
          </div>

          <div className="admin-card">
            <h3>Posted picks ({picks.length})</h3>
            {picks.length === 0 && <p style={{ color: 'var(--ink-dim)', fontSize: 13 }}>Nothing posted yet.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {picks.map((p) => (
                <div key={p.gameId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: 10, borderRadius: 8, background: '#0a0e17', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    <div style={{ color: 'var(--gold)', fontWeight: 700 }}>{p.side}</div>
                    <div style={{ color: 'var(--ink-dim)' }}>game {p.gameId} - {p.units}u</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" onClick={() => broadcast(p.gameId)}>Push</button>
                    <button className="btn-ghost" onClick={() => deletePick(p.gameId)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SignedIn>
    </section>
  );
}

function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
