import { NavLink } from 'react-router-dom';

/**
 * iOS-style bottom tab bar. Visible only on small screens (<=600px).
 * Hidden via CSS on desktop. Sits above the content with safe-area-aware padding.
 */

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
    </svg>
  );
}
function IconPicks() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3h14v18l-7-4-7 4z" />
    </svg>
  );
}
function IconFeed() {
  // Activity / pulse glyph — three stacked rows representing a feed.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
      <circle cx="20" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9" />
    </svg>
  );
}
function IconProfile() {
  // Person silhouette: head + shoulders. Used for the Profile tab
  // (replaces the old Bankroll wallet icon).
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
function IconLines() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  );
}
function IconProps() {
  // Flame icon for the Heat Check tab.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1.5 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.6.7-2.5 1.5-3.2C10 8 11 5.5 12 2z" />
      <path d="M8 14a4 4 0 0 0 8 0c0 5-2.5 8-4 8s-4-3-4-8z" />
    </svg>
  );
}

// Order, left → right: Profile, Feed, Scores, Lines, Picks, Heat
// Check, Pro. Profile stays leftmost as the user's home base; Feed
// sits next so the social loop is right next to the home tab.
const ITEMS = [
  { to: '/profile',   label: 'Profile',  icon: <IconProfile /> },
  { to: '/feed',      label: 'Feed',     icon: <IconFeed /> },
  { to: '/scores',    label: 'Scores',   icon: <IconHome /> },
  { to: '/lines',     label: 'Lines',    icon: <IconLines /> },
  { to: '/picks',     label: 'Picks',    icon: <IconPicks /> },
  { to: '/props',     label: 'Heat\nCheck', icon: <IconProps /> },
  { to: '/subscribe', label: 'Pro',      icon: <IconStar /> },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" role="tablist" aria-label="Primary">
      {ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}
          end
        >
          <span className="bn-icon">{it.icon}</span>
          <span className="bn-label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
