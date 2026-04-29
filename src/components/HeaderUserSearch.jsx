import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchProfiles } from '../hooks/useProfile.js';

/**
 * Magnifying-glass icon in the header that opens a dropdown panel for
 * searching other users by handle or display name. Click a result →
 * navigate to that user's public profile (/u/:handle).
 *
 * Sits in Header.jsx's SignedIn block, just to the left of <UserButton />.
 */
export default function HeaderUserSearch() {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Autofocus the input when the panel opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Debounced search.
  useEffect(() => {
    let cancel = false;
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchProfiles(query);
        if (!cancel) setResults(r);
      } finally {
        if (!cancel) setSearching(false);
      }
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [query]);

  function pick(handle) {
    setOpen(false);
    setQuery('');
    setResults([]);
    navigate(`/u/${handle}`);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' && results[0]) { e.preventDefault(); pick(results[0].handle); }
  }

  return (
    <div className="hdr-search-wrap" ref={wrapRef}>
      <button
        type="button"
        className="hdr-search-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Search users"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      {open && (
        <div className="hdr-search-panel" role="dialog" aria-label="Find users">
          <input
            ref={inputRef}
            type="search"
            className="hdr-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search handle or display name…"
            autoComplete="off"
          />
          {query.trim().length >= 2 && (
            <div className="hdr-search-results">
              {searching ? (
                <div className="hdr-search-empty">Searching…</div>
              ) : results.length === 0 ? (
                <div className="hdr-search-empty">No matches.</div>
              ) : (
                results.map((p) => {
                  const initial = (p.displayName || p.handle || '?').slice(0, 1).toUpperCase();
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      className="hdr-search-row"
                      onClick={() => pick(p.handle)}
                    >
                      {p.favTeamLogo ? (
                        <img src={p.favTeamLogo} alt="" className="hdr-search-avatar" />
                      ) : (
                        <span className="hdr-search-avatar-fb">{initial}</span>
                      )}
                      <span className="hdr-search-info">
                        <span className="hdr-search-name">{p.displayName}</span>
                        <span className="hdr-search-handle">@{p.handle}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
