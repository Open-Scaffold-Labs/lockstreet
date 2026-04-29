import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import UserPickCard from '../components/UserPickCard.jsx';

/**
 * /feed — community activity feed.
 *
 * Two tabs:
 *   - Following: most-recent picks from people you follow (signed-in only).
 *   - All:       most-recent public picks across all users.
 *
 * Each tab uses UserPickCard with showAuthor so the @handle is visible
 * inline. Picks are read via the existing "Public reads non-private
 * picks" RLS policy on user_picks — no schema changes required.
 *
 * Realtime: we subscribe to INSERTs on user_picks while the page is
 * mounted and prepend new rows to the active tab if they pass the
 * filter (own follow set for Following, all for All).
 */
export default function FeedRoute() {
  const [tab, setTab] = useState('following');

  return (
    <section>
      <div className="sub-hero" style={{ marginBottom: 18 }}>
        <h2>Feed</h2>
        <p>Live picks from the community. Locked at kickoff, graded automatically.</p>
      </div>

      <div className="tabs feed-tabs" role="tablist" aria-label="Feed filter">
        <button
          type="button"
          className={'tab' + (tab === 'following' ? ' active' : '')}
          onClick={() => setTab('following')}
        >
          Following
        </button>
        <button
          type="button"
          className={'tab' + (tab === 'all' ? ' active' : '')}
          onClick={() => setTab('all')}
        >
          All
        </button>
      </div>

      {tab === 'following' ? (
        <>
          <SignedOut>
            <FollowingSignedOut />
          </SignedOut>
          <SignedIn>
            <FollowingFeed />
          </SignedIn>
        </>
      ) : (
        <AllFeed />
      )}
    </section>
  );
}

// =====================================================================
// Following tab
// =====================================================================

function FollowingSignedOut() {
  return (
    <div className="empty">
      <p style={{ color: 'var(--ink-dim)', maxWidth: 480, margin: '0 auto 18px' }}>
        Sign in to see picks from handicappers you follow. Or jump to the{' '}
        <Link to="#all" onClick={(e) => { e.preventDefault(); }}>All</Link> tab to
        browse the full community.
      </p>
      <SignInButton afterSignInUrl="/feed">
        <button className="btn-gold">Sign in</button>
      </SignInButton>
    </div>
  );
}

function FollowingFeed() {
  const { userId } = useAuth?.() || {};
  const { picks, authors, loading, error } = usePicksFeed({ scope: 'following', meId: userId });

  if (loading) return <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>;
  if (error)   return <p style={{ color: 'var(--bad)' }}>Failed to load: {error.message}</p>;

  if (!picks.length) {
    return (
      <div className="empty">
        <p style={{ color: 'var(--ink-dim)', maxWidth: 480, margin: '0 auto 18px' }}>
          No picks from people you follow yet. Find people to follow, or check the{' '}
          All tab to see what the community is on.
        </p>
        <Link to="/leaderboard" className="btn-gold" style={{ display: 'inline-block', padding: '12px 22px', textDecoration: 'none' }}>
          Browse leaderboard
        </Link>
      </div>
    );
  }

  return (
    <div className="bk-table">
      {picks.map((p) => (
        <UserPickCard key={p.id} pick={p} showAuthor author={authors[p.userId]} />
      ))}
    </div>
  );
}

// =====================================================================
// All tab
// =====================================================================

function AllFeed() {
  const { picks, authors, loading, error } = usePicksFeed({ scope: 'all' });

  if (loading) return <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>;
  if (error)   return <p style={{ color: 'var(--bad)' }}>Failed to load: {error.message}</p>;

  if (!picks.length) {
    return (
      <div className="empty">
        <p style={{ color: 'var(--ink-dim)' }}>
          No public picks yet. Be the first — head to{' '}
          <Link to="/profile">your profile</Link> and post a pick.
        </p>
      </div>
    );
  }

  return (
    <div className="bk-table">
      {picks.map((p) => (
        <UserPickCard key={p.id} pick={p} showAuthor author={authors[p.userId]} />
      ))}
    </div>
  );
}

// =====================================================================
// Shared data hook
// =====================================================================

/**
 * Fetch the most recent public picks for either scope:
 *   - 'all':       newest 50 picks across the platform
 *   - 'following': newest 50 picks from users meId follows
 *
 * Pulls authors in a second query keyed by user_id. Subscribes to
 * realtime INSERTs and prepends matching rows.
 */
function usePicksFeed({ scope, meId = null }) {
  const [picks, setPicks]     = useState([]);
  const [authors, setAuthors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [followIds, setFollowIds] = useState(null); // null = unloaded, [] = none

  // Step 1: if scope is following, load the follow list first.
  useEffect(() => {
    let cancelled = false;
    if (scope !== 'following') { setFollowIds(null); return undefined; }
    if (!supabase || !meId) { setFollowIds([]); return undefined; }
    (async () => {
      const { data, error: e } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', meId);
      if (cancelled) return;
      if (e) { setError(e); setLoading(false); return; }
      setFollowIds((data || []).map((r) => r.followed_id));
    })();
    return () => { cancelled = true; };
  }, [scope, meId]);

  // Step 2: fetch picks based on scope.
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    if (scope === 'following' && followIds === null) return; // wait for follows
    setLoading(true);
    try {
      let q = supabase
        .from('user_picks')
        .select(
          'id, user_id, game_id, league, season, week, bet_type, side, units, ' +
          'line_at_pick, juice_at_pick, market_line, market_juice, point_buys, ' +
          'is_free_pick, home_abbr, away_abbr, home_logo, away_logo, ' +
          'locked_at, kickoff_at, result, graded_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(50);
      if (scope === 'following') {
        if (!followIds.length) { setPicks([]); setAuthors({}); setError(null); return; }
        q = q.in('user_id', followIds);
      }
      const { data, error: e } = await q;
      if (e) throw e;
      const mapped = (data || []).map(mapPickRow);
      setPicks(mapped);
      setError(null);

      // Fetch profiles for the picks' authors.
      const uniqUserIds = [...new Set(mapped.map((p) => p.userId))];
      if (uniqUserIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, handle, display_name, avatar_url, fav_team_logo')
          .in('user_id', uniqUserIds);
        const map = {};
        (profs || []).forEach((p) => {
          map[p.user_id] = {
            handle: p.handle,
            displayName: p.display_name,
            avatarUrl: p.avatar_url,
            favTeamLogo: p.fav_team_logo,
          };
        });
        setAuthors(map);
      } else {
        setAuthors({});
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [scope, followIds]);

  useEffect(() => { load(); }, [load]);

  // Realtime: prepend new INSERTs that match the scope filter.
  useEffect(() => {
    if (!supabase) return undefined;
    if (scope === 'following' && followIds === null) return undefined;
    const followSet = scope === 'following' ? new Set(followIds || []) : null;
    const channel = supabase
      .channel(`feed-${scope}-${meId || 'anon'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_picks' },
        async (payload) => {
          const row = payload?.new;
          if (!row) return;
          if (scope === 'following' && (!followSet || !followSet.has(row.user_id))) return;
          const newPick = mapPickRow(row);
          setPicks((prev) => [newPick, ...prev].slice(0, 50));
          // Lazy-fetch the author if we haven't seen them yet.
          if (!authors[newPick.userId]) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('user_id, handle, display_name, avatar_url, fav_team_logo')
              .eq('user_id', newPick.userId)
              .maybeSingle();
            if (prof) {
              setAuthors((a) => ({
                ...a,
                [prof.user_id]: {
                  handle: prof.handle,
                  displayName: prof.display_name,
                  avatarUrl: prof.avatar_url,
                  favTeamLogo: prof.fav_team_logo,
                },
              }));
            }
          }
        },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, meId, (followIds || []).join(',')]);

  return useMemo(() => ({ picks, authors, loading, error }), [picks, authors, loading, error]);
}

// camelCase shape that UserPickCard expects.
function mapPickRow(p) {
  return {
    id: p.id,
    userId: p.user_id,
    gameId: p.game_id,
    league: p.league,
    season: p.season,
    week: p.week,
    betType: p.bet_type,
    side: p.side,
    units: Number(p.units),
    lineAtPick:  p.line_at_pick != null ? Number(p.line_at_pick) : null,
    juiceAtPick: p.juice_at_pick != null ? Number(p.juice_at_pick) : -110,
    marketLine:  p.market_line  != null ? Number(p.market_line)  : null,
    marketJuice: p.market_juice != null ? Number(p.market_juice) : -110,
    pointBuys:   p.point_buys != null ? Number(p.point_buys) : 0,
    isFreePick:  !!p.is_free_pick,
    homeAbbr: p.home_abbr,
    awayAbbr: p.away_abbr,
    homeLogo: p.home_logo,
    awayLogo: p.away_logo,
    lockedAt:  p.locked_at,
    kickoffAt: p.kickoff_at,
    result: p.result,
    gradedAt: p.graded_at,
    createdAt: p.created_at,
    juice_at_pick: p.juice_at_pick,
    market_juice:  p.market_juice,
    graded_at:     p.graded_at,
    result_:       p.result,
  };
}
