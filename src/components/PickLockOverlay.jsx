import { Link } from 'react-router-dom';

export default function PickLockOverlay() {
  return (
    <Link className="pick-locked" to="/subscribe">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Subscribe to see pick
    </Link>
  );
}
