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
function IconRecord() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-6 4 4 7-9" /><circle cx="20" cy="6" r="1.5" />
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
function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M3 7l2-3h12l2 3" /><circle cx="17" cy="13" r="1.2" />
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
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M5 21v-1a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

const ITEMS = [
  { to: '/scores',    label: 'Scores',   icon: <IconHome /> },
  { to: '/picks',     label: 'Picks',    icon: <IconPicks /> },
  { to: '/lines',     label: 'Lines',    icon: <IconLines /> },
  { to: '/props',     label: 'Heat',     icon: <IconProps /> },
  { to: '/bankroll',  label: 'Bankroll', icon: <IconWallet /> },
  { to: '/about',     label: 'Record',   icon: <IconRecord /> },
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
