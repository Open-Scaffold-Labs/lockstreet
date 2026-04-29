import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import UserPickCard from '../components/UserPickCard.jsx';
import PostCard from '../components/PostCard.jsx';
import PostComposer from '../components/PostComposer.jsx';

/**
 * /feed — community activity feed.
 *
 * Layout:
 *   - Tagline (close to header — no big <h2>)
 *   - PostComposer (textarea + Include pick + Post)
 *   - Following / All tabs
 *   - Mixed feed: posts (text + optional embedded pick) and bare
 *     picks (no wrapping post), sorted by created_at desc.
 *
 * Realtime: subscribes to INSERTs on both posts and user_picks.
 * Bare picks that are later wrapped by a post (composer flow) are
 * deduped server-side via a subquery.
 */
export default function FeedRoute() {
  const [tab, setTab] = useState('following');
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <section className="feed-page">
      <p className="feed-tagline">
        Live picks from the community. Locked at kickoff, graded automatically, never deleted.
      </p>

      <PostComposer onPosted={() => setReloadKey((k) => k + 1)} />

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
          <SignedOut><FollowingSignedOut /></SignedOut>
          <SignedIn><FollowingFeed reloadKey={reloadKey} /></SignedIn>
        </>
      ) : (
        <AllFeed reloadKey={reloadKey} />
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
        Sign in to see picks from handicappers you follow. Or jump to the All tab to
        browse the full community.
      </p>
      <SignInButton afterSignInUrl="/feed">
        <button className="btn-gold">Sign in</button>
      </SignInButton>
    </div>
  );
}

function FollowingFeed({ reloadKey }) {
  const { userId } = useAuth?.() || {};
  const { items, authors, loading, error } = useFeed({ scope: 'following', meId: userId, reloadKey });
  return <FeedList items={items} authors={authors} loading={loading} error={error} emptyKind="following" />;
}

function AllFeed({ reloadKey }) {
  const { items, authors, loading, error } = useFeed({ scope: 'all', reloadKey });
  return <FeedList items={items} authors={authors} loading={loading} error={error} emptyKind="all" />;
}

function FeedList({ items, authors, loading, error, emptyKind }) {
  if (loading) return <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>;
  if (error)   return <p style={{ color: 'var(--bad)' }}>Failed to load: {error.message}</p>;

  if (!items.length) {
    return (
      <div className="empty">
        {emptyKind === 'following' ? (
          <p style={{ color: 'var(--ink-dim)', maxWidth: 480, margin: '0 auto 18px' }}>
            No activity from people you follow yet. Try the All tab, or browse the leaderboard to find handicappers.
          </p>
        ) : (
          <p style={{ color: 'var(--ink-dim)' }}>
            No public activity yet. Be the first — drop a pick or a take above.
          </p>
        )}
        {emptyKind === 'following' && (
          <Link to="/leaderboard" className="btn-gold" style={{ display: 'inline-block', padding: '10px 20px', textDecoration: 'none' }}>
            Browse leaderboard
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="feed-list">
      {items.map((it) => (
        it.kind === 'post' ? (
          <PostCard key={`p-${it.id}`} post={it} author={authors[it.userId]} />
        ) : (
          <UserPickCard key={`k-${it.id}`} pick={it} showAuthor author={authors[it.userId]} />
        )
      ))}
    </div>
  );
}

// =====================================================================
// Shared data hook — merges posts + bare picks
// =====================================================================

const FEED_LIMIT = 50;

/**
 * Pulls the last FEED_LIMIT posts and bare picks (picks not wrapped
 * by a post), merges by created_at desc, and resolves authors.
 *
 * Realtime: subscribes to both tables; new rows are prepended if
 * they pass the scope filter.
 */
function useFeed({ scope, meId = null, reloadKey = 0 }) {
  const [items, setItems]     = useState([]);
  const [authors, setAuthors] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [followIds, setFollowIds] = useState(scope === 'following' ? null : []);

  // Load follow list for scope=following.
  useEffect(() => {
    let cancelled = false;
    if (scope !== 'following') { setFollowIds([]); return undefined; }
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

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    if (scope === 'following' && followIds === null) return;
    setLoading(true);
    try {
      // Following + empty list = nothing to show.
      if (scope === 'following' && !followIds.length) {
        setItems([]); setAuthors({}); setError(null); return;
      }

      // 1) Posts (with embedded pick joined inline).
      let postQ = supabase
        .from('posts')
        .select(
          'id, user_id, body, created_at, ' +
          'pick:user_picks(' +
            'id, user_id, game_id, league, season, week, bet_type, side, units, ' +
            'line_at_pick, juice_at_pick, market_line, market_juice, point_buys, ' +
            'is_free_pick, home_abbr, away_abbr, home_logo, away_logo, ' +
            'locked_at, kickoff_at, result, graded_at, created_at)'
        )
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (scope === 'following') postQ = postQ.in('user_id', followIds);

      // 2) Bare picks (no wrapping post). We fetch picks then filter
      //    out the wrapped ones client-side using the post pick_ids
      //    we just got back. (Supabase JS doesn't support NOT IN
      //    subselects cleanly.)
      let pickQ = supabase
        .from('user_picks')
        .select(
          'id, user_id, game_id, league, season, week, bet_type, side, units, ' +
          'line_at_pick, juice_at_pick, market_line, market_juice, point_buys, ' +
          'is_free_pick, home_abbr, away_abbr, home_logo, away_logo, ' +
          'locked_at, kickoff_at, result, graded_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (scope === 'following') pickQ = pickQ.in('user_id', followIds);

      const [postsRes, picksRes] = await Promise.all([postQ, pickQ]);
      if (postsRes.error) throw postsRes.error;
      if (picksRes.error) throw picksRes.error;

      const postRows = postsRes.data || [];
      const pickRows = picksRes.data || [];

      // Build set of pick_ids that are wrapped by a post.
      const wrappedPickIds = new Set(
        postRows.map((r) => r.pick?.id).filter(Boolean)
      );

      // Map posts to feed items.
      const postItems = postRows.map((r) => ({
        kind: 'post',
        id: r.id,
        userId: r.user_id,
        body: r.body,
        createdAt: r.created_at,
        pick: r.pick ? mapPickRow(r.pick) : null,
      }));

      // Map bare picks (excluding wrapped ones).
      const bareItems = pickRows
        .filter((p) => !wrappedPickIds.has(p.id))
        .map((p) => ({ kind: 'pick', ...mapPickRow(p) }));

      // Merge by created_at desc, cap at FEED_LIMIT.
      const merged = [...postItems, ...bareItems]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, FEED_LIMIT);
      setItems(merged);
      setError(null);

      // Fetch profiles for all distinct authors.
      const uniqUserIds = [...new Set(merged.map((it) => it.userId))];
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
  }, [scope, followIds, reloadKey]);

  useEffect(() => { load(); }, [load]);

  // Realtime: posts + user_picks INSERTs.
  useEffect(() => {
    if (!supabase) return undefined;
    if (scope === 'following' && followIds === null) return undefined;
    const followSet = scope === 'following' ? new Set(followIds || []) : null;
    const channel = supabase
      .channel(`feed-${scope}-${meId || 'anon'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        () => { load(); /* simplest: refetch — keeps dedup correct */ },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_picks' },
        async (payload) => {
          const row = payload?.new;
          if (!row) return;
          if (scope === 'following' && (!followSet || !followSet.has(row.user_id))) return;
          // Don't prepend immediately if this pick might be about to
          // be wrapped by a post (composer creates pick THEN post).
          // The post INSERT will trigger a refetch; until then we
          // optimistically show the bare pick.
          const newItem = { kind: 'pick', ...mapPickRow(row) };
          setItems((prev) => [newItem, ...prev].slice(0, FEED_LIMIT));
          if (!authors[newItem.userId]) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('user_id, handle, display_name, avatar_url, fav_team_logo')
              .eq('user_id', newItem.userId)
              .maybeSingle();
            if (prof) setAuthors((a) => ({ ...a, [prof.user_id]: {
              handle: prof.handle, displayName: prof.display_name,
              avatarUrl: prof.avatar_url, favTeamLogo: prof.fav_team_logo,
            } }));
          }
        },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, meId, (followIds || []).join(',')]);

  return useMemo(() => ({ items, authors, loading, error }), [items, authors, loading, error]);
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
