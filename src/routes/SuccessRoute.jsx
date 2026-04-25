import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function SuccessRoute() {
  const nav = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => nav('/picks'), 3500);
    return () => clearTimeout(t);
  }, [nav]);

  return (
    <div className="empty" style={{ padding: '80px 20px' }}>
      <div style={{ fontSize: 48, color: 'var(--green)' }}>✓</div>
      <h2 style={{ color: 'var(--ink)', margin: '10px 0 6px' }}>You're in.</h2>
      <p style={{ color: 'var(--ink-dim)', maxWidth: 420, margin: '0 auto 20px' }}>
        Payment confirmed. Picks will unlock across the app momentarily.
        Taking you to <Link to="/picks" style={{ color: 'var(--gold)' }}>Picks</Link>…
      </p>
    </div>
  );
}
