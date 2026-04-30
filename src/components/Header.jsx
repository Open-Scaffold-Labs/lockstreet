import { NavLink, Link } from 'react-router-dom';
import { SignInButton, SignedIn, SignedOut, UserButton } from '../lib/auth.jsx';
import { useSubscription } from '../hooks/useSubscription.js';
import HeaderUserSearch from './HeaderUserSearch.jsx';

// Profile is the leftmost desktop tab — same position as in BottomNav.
// Bankroll was renamed and repointed to /profile; the calculator can
// come back later as a sub-section if there's demand.
const TABS = [
  { to: '/profile',     label: 'Profile' },
  { to: '/feed',        label: 'Feed' },
  { to: '/scores',      label: 'Scores' },
  { to: '/picks',       label: 'Picks' },
  { to: '/lines',       label: 'Lines' },
  { to: '/props',       label: 'Heat Check' },
  { to: '/leaderboard', label: 'Leaders' },
  { to: '/contest',     label: 'Contest' },
  { to: '/weekly',      label: 'Weekly' },
  { to: '/subscribe',   label: 'Pro' },
];

export default function Header() {
  const sub = useSubscription();

  return (
    <header className="hdr">
      <div className="hdr-row">
        <Link to="/" className="brand" aria-label="Lock Street home">
          <span className="b1">Lock</span>
          <span className="b2">Street</span>
        </Link>
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
          {sub.active ? (
            <Link to="/subscribe" className="gopro active"><span>OK</span><span>ACTIVE</span></Link>
          ) : (
            <Link to="/subscribe" className="gopro"><span>GO PRO</span></Link>
          )}
          <HeaderUserSearch />
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
