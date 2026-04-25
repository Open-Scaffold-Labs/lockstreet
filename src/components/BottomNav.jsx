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

const ITEMS = [
  { to: '/scores',    label: 'Scores',  icon: <IconHome /> },
  { to: '/picks',     label: 'Picks',   icon: <IconPicks /> },
  { to: '/about',     label: 'Record',  icon: <IconRecord /> },
  { to: '/subscribe', label: 'Pro',     icon: <IconStar /> },
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
