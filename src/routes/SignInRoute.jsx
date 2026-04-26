import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

export default function SignInRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isSignedIn } = useAuth();
  const next = params.get('next') || '/';

  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);

  useEffect(() => { if (isSignedIn) navigate(next, { replace: true }); }, [isSignedIn, next, navigate]);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setInfo(null); setBusy(true);
    try {
      if (!supabase) throw new Error('Supabase not configured. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo('Account created. Check your email for confirmation if required, then sign in.');
        setMode('signin');
      }
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '40px 0' }}>
      <form onSubmit={submit} style={{
        width: 'min(380px, 92vw)', padding: 24, background: '#0f172a',
        border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <h2 style={{ margin: 0 }}>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com" required autoFocus
          style={{ padding: 10, background: '#0a0e17', border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 6, color: '#fff' }} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="password (min 6 chars)" required minLength={6}
          style={{ padding: 10, background: '#0a0e17', border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 6, color: '#fff' }} />
        {err && <div style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
        {info && <div style={{ color: '#10b981', fontSize: 13 }}>{info}</div>}
        <button type="submit" disabled={busy} className="btn-gold"
          style={{ padding: 10, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Working...' : (mode === 'signin' ? 'Sign in' : 'Sign up')}
        </button>
        <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null); setInfo(null); }}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
