import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchAllTeams, searchTeams } from '../lib/teamsCatalog.js';
import { SPORT_LABELS } from '../lib/userPicks.js';

/**
 * Searchable team picker that pulls the full team catalog from ESPN
 * across all six supported sports. Selection sets:
 *   { abbr, name, league, logo, id }
 *
 * Props:
 *   value          — current selection or null
 *   onChange(team) — called with the team object on pick (or null on clear)
 *   placeholder    — input placeholder
 */
export default function TeamPicker({ value, onChange, placeholder = 'Search teams…' }) {
  const [allTeams, setAllTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  // Lazy-load the full catalog once the picker mounts.
  useEffect(() => {
    let cancelled = false;
    fetchAllTeams().then((teams) => {
      if (cancelled) return;
      setAllTeams(teams);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Close on outside pointerdown. We use `pointerdown` instead of
  // `mousedown` because the row buttons fire `onPointerDown` (see
  // below) and we want both handlers to use the same event family —
  // otherwise the doc-mousedown could fire before the row's onClick on
  // iOS and unmount the dropdown mid-tap.
  useEffect(() => {
    if (!open) return undefined;
    function onDocPointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchTeams(allTeams, query);
  }, [allTeams, query]);

  function pick(team) {
    onChange?.(team);
    setQuery('');
    setOpen(false);
  }

  function clear() {
    onChange?.(null);
    setQuery('');
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown')      { e.preventDefault(); setHighlight((h) => Math.min(results.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter')     { e.preventDefault(); pick(results[highlight]); }
    else if (e.key === 'Escape')    { setOpen(false); }
  }

  return (
    <div className="tp-wrap" ref={wrapRef}>
      {value ? (
        <div className="tp-selected">
          {value.logo ? <img src={value.logo} alt="" className="tp-selected-logo" /> : null}
          <div className="tp-selected-info">
            <div className="tp-selected-name">{value.name}</div>
            <div className="tp-selected-meta">
              {SPORT_LABELS[value.league] || value.league?.toUpperCase()} · {value.abbr}
            </div>
          </div>
          <button type="button" className="tp-clear" onClick={clear} aria-label="Clear">×</button>
        </div>
      ) : (
        <input
          type="text"
          className="tp-input"
          value={query}
          placeholder={loading ? 'Loading teams…' : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          disabled={loading}
        />
      )}

      {open && !value && query.trim().length > 0 && (
        <div className="tp-dropdown">
          {loading ? (
            <div className="tp-empty">Loading…</div>
          ) : results.length === 0 ? (
            <div className="tp-empty">No teams match "{query}"</div>
          ) : (
            results.map((t, i) => (
              <button
                key={`${t.league}-${t.id}-${t.abbr}`}
                type="button"
                className={'tp-row' + (i === highlight ? ' active' : '')}
                onMouseEnter={() => setHighlight(i)}
                // Use onPointerDown instead of onClick so iOS Safari
                // can't cancel the tap as a scroll-start gesture before
                // the click event commits. preventDefault stops the
                // synthesized mouseclick (no double-fire);
                // stopPropagation prevents the document pointerdown
                // outside-handler from seeing this and closing the
                // dropdown mid-pick. Also keep onClick as a desktop /
                // keyboard fallback for accessibility.
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(t);
                }}
                onClick={(e) => {
                  // Pointerdown already handled it on touch / mouse.
                  // This fallback only matters for assistive tech that
                  // synthesizes click without a pointer event.
                  if (e.detail === 0) pick(t);
                }}
              >
                {t.logo ? <img src={t.logo} alt="" className="tp-row-logo" /> : <span className="tp-row-logo-fallback">{t.abbr}</span>}
                <div className="tp-row-info">
                  <div className="tp-row-name">{t.name}</div>
                  <div className="tp-row-meta">
                    {SPORT_LABELS[t.league] || t.league.toUpperCase()} · {t.abbr}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
