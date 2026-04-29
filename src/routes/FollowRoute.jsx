import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import { useFollows } from '../hooks/useFollows.js';
import { searchProfiles } from '../hooks/useProfile.js';
import FollowButton from '../components/FollowButton.jsx';

/**
 * /follow — manage who you follow. Search box on top, two columns
 * (Following / Followers) below. On mobile the columns become tabs.
 */
export default function FollowRoute() {
  return (
    <section>
      <SignedOut>
        <div className="empty">
          <div className="trc-eyebrow">Follow</div>
          <h2 style={{ marginTop: 6, marginBottom: 8, fontSize: 26 }}>Follow other handicappers.</h2>
          <p style={{ color: 'var(--ink-dim)', maxWidth: 480, margin: '0 auto 18px' }}>
            See who's hot, get their picks in real time as they lock, and compare your record to
            theirs.
          </p>
          <SignInButton afterSignInUrl="/follow">
            <button className="btn-gold">Sign in</button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <FollowBody />
      </SignedIn>
    </section>
  );
}

function FollowBody() {
  const { userId } = useAuth?.() || {};
  const { following, followers, loading, reload } = useFollows(userId);
  // Initial tab from ?tab= query param so the profile-header
  // "Followers" link lands on the right list.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'followers' ? 'followers' : 'following';
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchProfiles(query);
        if (!cancelled) setResults(r);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const followingIds = new Set(following.map((f) => f.userId));

  return (
    <>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Follow graph</div>
          <div className="trc-final">
            {following.length} following
            <span className="trc-final-sub">{followers.length} {followers.length === 1 ? 'follower' : 'followers'}</span>
          </div>
        </div>
        <Link to="/leaderboard" className="btn-gold">Browse leaderboard</Link>
      </div>

      <div className="about-block" style={{ marginTop: 14 }}>
        <h3>Find people</h3>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search handle or display name…"
          className="pf-search-input"
          autoFocus
        />
        {query.trim().length >= 2 && (
          <div className="pf-search-results bk-table" style={{ marginTop: 12 }}>
            {searching ? (
              <div style={{ color: 'var(--ink-dim)', padding: 12 }}>Searching…</div>
            ) : results.length === 0 ? (
              <div style={{ color: 'var(--ink-dim)', padding: 12 }}>No matches.</div>
            ) : (
              results.map((p) => (
                <UserRow
                  key={p.userId}
                  profile={p}
                  rightSlot={
                    p.userId === userId ? (
                      <span className="pf-result-badge res-push" style={{ minWidth: 64 }}>YOU</span>
                    ) : (
                      <FollowButton targetUserId={p.userId} compact onChange={reload} />
                    )
                  }
                />
              ))
            )}
          </div>
        )}
      </div>

      <div className="tabs pf-window-tabs" role="tablist" aria-label="Follow lists">
        <button type="button" className={'tab' + (tab === 'following' ? ' active' : '')} onClick={() => setTab('following')}>
          Following <span className="count">{following.length}</span>
        </button>
        <button type="button" className={'tab' + (tab === 'followers' ? ' active' : '')} onClick={() => setTab('followers')}>
          Followers <span className="count">{followers.length}</span>
        </button>
      </div>

      <div className="about-block" style={{ marginTop: 8 }}>
        {loading ? (
          <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>
        ) : tab === 'following' ? (
          following.length === 0 ? (
            <p style={{ color: 'var(--ink-dim)' }}>You don't follow anyone yet. Search above or visit the <Link to="/leaderboard" style={{ color: 'var(--gold)' }}>leaderboard</Link> to find people.</p>
          ) : (
            <div className="bk-table">
              {following.map((p) => (
                <UserRow
                  key={p.userId}
                  profile={p}
                  rightSlot={<FollowButton targetUserId={p.userId} compact onChange={reload} />}
                />
              ))}
            </div>
          )
        ) : followers.length === 0 ? (
          <p style={{ color: 'var(--ink-dim)' }}>No followers yet — make picks and they'll find you.</p>
        ) : (
          <div className="bk-table">
            {followers.map((p) => (
              <UserRow
                key={p.userId}
                profile={p}
                rightSlot={
                  followingIds.has(p.userId)
                    ? <FollowButton targetUserId={p.userId} compact onChange={reload} />
                    : <FollowButton targetUserId={p.userId} compact onChange={reload} />
                }
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function UserRow({ profile, rightSlot }) {
  const initials = (profile.displayName || profile.handle || '?')
    .split(/\s+|@/)[0].slice(0, 2).toUpperCase();
  return (
    <div className="bk-row pf-user-row">
      <Link to={`/u/${profile.handle}`} className="pf-user-link">
        <div className="pf-user-avatar" aria-hidden="true">
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{initials}</span>}
        </div>
        <div>
          <div className="pf-user-name">
            {profile.displayName}
            {profile.isSystem ? <span className="pf-system-badge" style={{ marginLeft: 6 }}>OFFICIAL</span> : null}
          </div>
          <div className="pf-user-handle">
            @{profile.handle}
            {profile.favTeam ? <span style={{ marginLeft: 8, color: 'var(--ink-faint)' }}>· {profile.favTeam}</span> : null}
          </div>
        </div>
      </Link>
      <div className="bk-row-pl">{rightSlot}</div>
    </div>
  );
}
