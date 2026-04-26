import { NavLink, Link } from 'react-router-dom';
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '../lib/auth.jsx';
import { useSubscription } from '../hooks/useSubscription.js';

const TABS = [
  { to: '/scores',    label: 'Scores' },
  { to: '/picks',     label: 'Picks' },
  { to: '/lines',     label: 'Lines' },
  { to: '/props',     label: 'Props' },
  { to: '/bankroll',  label: 'Bankroll' },
  { to: '/contest',   label: 'Contest' },
  { to: '/leaderboard', label: 'Leaders' },
  { to: '/weekly',    label: 'Weekly' },
  { to: '/about',     label: 'Track Record' },
  { to: '/subscribe', label: 'Subscribe' },
];

export default function Header() {
  const sub = useSubscription();
  const { user } = useUser?.() || {};
  const isAdmin = user?.publicMetadata?.role === 'admin';

  return (
    <header className="hdr">
      <div className="hdr-row">
        <Link to="/" className="brand">
          <span className="b1">Lock</span>
          <span className="b2">Street</span>
          <span className="badge-ats">61% ATS</span>
        </Link>
        <span className="tagline">“Be fearful when others are greedy. Be greedy when others are fearful.” — Buffett</span>
        <div className="spacer" />

        <SignedOut>
          <SignInButton mode="modal">
            <button className="btn-ghost" type="button">Sign in</button>
          </SignInButton>
          <Link to="/subscribe" className="gopro" aria-label="Upgrade">
            <span>GO PRO</span>
          </Link>
        </SignedOut>

        <SignedIn>
          {isAdmin && <Link to="/admin" className="btn-ghost">Admin</Link>}
          {sub.active ? (
            <Link to="/subscribe" className="gopro active"><span>OK</span><span>ACTIVE</span></Link>
          ) : (
            <Link to="/subscribe" className="gopro"><span>GO PRO</span></Link>
          )}
          <UserButton />
        </SignedIn>
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
