import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchProfiles } from '../hooks/useProfile.js';
import { fetchAllTeams } from '../lib/teamsCatalog.js';

/**
 * Magnifying-glass icon in the header that opens a dropdown panel for
 * searching:
 *   - Teams (across NFL / CFB / NBA / NHL / MLB) — click → /team/:league/:teamId
 *   - People (handles + display names)            — click → /u/:handle
 *
 * Two labeled sections render in the dropdown when both kinds match.
 * Pressing Enter picks the first result, regardless of section.
 *
 * Sits in Header.jsx's SignedIn block, just to the left of <UserButton />.
 */

const LEAGUE_LABEL = { nfl: 'NFL', cfb: 'CFB', nba: 'NBA', nhl: 'NHL', mlb: 'MLB', cbb: 'CBB' };
const TEAM_RESULT_LIMIT = 6;
const USER_RESULT_LIMIT = 6;

export default function HeaderUserSearch() {
  const [open, setOpen]             = useState(false);
  const [query, setQuery]           = useState('');
  const [userResults, setUserResults]   = useState([]);
  const [teamCatalog, setTeamCatalog]   = useState(null); // null until first load
  const [searchingUsers, setSearchingUsers] = useState(false);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Lazily load the team catalog once the panel opens (small JSON, instant
  // after first hit thanks to the in-memory cache in teamsCatalog.js).
  useEffect(() => {
    if (!open || teamCatalog !== null) return;
    let cancel = false;
    fetchAllTeams().then((t) => { if (!cancel) setTeamCatalog(t || []); });
    return () => { cancel = true; };
  }, [open, teamCatalog]);

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

  // Debounced people search (server-side).
  useEffect(() => {
    let cancel = false;
    if (query.trim().length < 2) { setUserResults([]); return; }
    setSearchingUsers(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchProfiles(query);
        if (!cancel) setUserResults((r || []).slice(0, USER_RESULT_LIMIT));
      } finally {
        if (!cancel) setSearchingUsers(false);
      }
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [query]);

  // Client-side team filter — runs synchronously over the in-memory catalog.
  // Match priority: exact abbr > abbr-starts-with > name-contains.
  const teamResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !Array.isArray(teamCatalog) || teamCatalog.length === 0) return [];
    const Q = q.toUpperCase();
    const scored = [];
    for (const t of teamCatalog) {
      const abbr  = String(t.abbr || '').toUpperCase();
      const name  = String(t.name || '').toLowerCase();
      const sname = String(t.shortName || '').toLowerCase();
      let score = 0;
      if (abbr === Q)            score = 100;
      else if (abbr.startsWith(Q)) score = 80;
      else if (name.includes(q))   score = 50;
      else if (sname.includes(q))  score = 40;
      if (score > 0) scored.push({ team: t, score });
    }
    scored.sort((a, b) => b.score - a.score || a.team.name.localeCompare(b.team.name));
    return scored.slice(0, TEAM_RESULT_LIMIT).map((s) => s.team);
  }, [query, teamCatalog]);

  const hasAnyResults = teamResults.length > 0 || userResults.length > 0;
  const firstResult   = teamResults[0]
    ? { kind: 'team', team: teamResults[0] }
    : userResults[0]
    ? { kind: 'user', user: userResults[0] }
    : null;

  function pickTeam(team) {
    setOpen(false);
    setQuery('');
    setUserResults([]);
    navigate(`/team/${team.league}/${team.id}`);
  }
  function pickUser(handle) {
    setOpen(false);
    setQuery('');
    setUserResults([]);
    navigate(`/u/${handle}`);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' && firstResult) {
      e.preventDefault();
      if (firstResult.kind === 'team') pickTeam(firstResult.team);
      else pickUser(firstResult.user.handle);
    }
  }

  return (
    <div className="hdr-search-wrap" ref={wrapRef}>
      <button
        type="button"
        className="hdr-search-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Search teams and users"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      {open && (
        <div className="hdr-search-panel" role="dialog" aria-label="Find teams or users">
          <input
            ref={inputRef}
            type="search"
            className="hdr-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search teams or handles…"
            autoComplete="off"
          />
          {query.trim().length >= 2 && (
            <div className="hdr-search-results">
              {/* Teams section */}
              {teamResults.length > 0 && (
                <>
                  <div className="hdr-search-section">Teams</div>
                  {teamResults.map((t) => (
                    <button
                      key={`team-${t.league}-${t.id}`}
                      type="button"
                      className="hdr-search-row"
                      onClick={() => pickTeam(t)}
                    >
                      {t.logo ? (
                        <img src={t.logo} alt="" className="hdr-search-avatar" />
                      ) : (
                        <span className="hdr-search-avatar-fb">{(t.abbr || '?').slice(0, 2)}</span>
                      )}
                      <span className="hdr-search-info">
                        <span className="hdr-search-name">{t.name}</span>
                        <span className="hdr-search-handle">
                          {LEAGUE_LABEL[t.league] || t.league?.toUpperCase()} · {t.abbr}
                        </span>
                      </span>
                    </button>
                  ))}
                </>
              )}

              {/* People section */}
              {userResults.length > 0 && (
                <>
                  <div className="hdr-search-section">People</div>
                  {userResults.map((p) => {
                    const initial = (p.displayName || p.handle || '?').slice(0, 1).toUpperCase();
                    return (
                      <button
                        key={`user-${p.userId}`}
                        type="button"
                        className="hdr-search-row"
                        onClick={() => pickUser(p.handle)}
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
                  })}
                </>
              )}

              {/* Empty / loading states */}
              {!hasAnyResults && (
                searchingUsers || teamCatalog === null
                  ? <div className="hdr-search-empty">Searching…</div>
                  : <div className="hdr-search-empty">No matches.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
