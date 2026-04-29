import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useProfile } from '../hooks/useProfile.js';
import { useFollows } from '../hooks/useFollows.js';
import FollowButton from '../components/FollowButton.jsx';

/**
 * /u/:handle/follows — read-only view of another user's following /
 * followers lists. Tabs swap between the two; ?tab=followers preselects
 * the followers list (linked to from ProfileHeader's meta count).
 *
 * Each row links to that profile and shows a FollowButton scoped to
 * the *viewer*'s relationship with that user (not the page owner's).
 * So you can follow/unfollow people you find while browsing someone
 * else's network.
 */
export default function PublicFollowsRoute() {
  const { handle } = useParams();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'followers' ? 'followers' : 'following';
  const [tab, setTab] = useState(initialTab);

  const { profile, loading: pLoading } = useProfile({ handle });
  const ownerId = profile?.userId || null;
  const { following, followers, loading: fLoading } = useFollows(ownerId);

  if (pLoading) {
    return <section><div className="pf-loading">Loading…</div></section>;
  }
  if (!profile) {
    return (
      <section>
        <div className="empty">
          <div className="trc-eyebrow">Not found</div>
          <h2 style={{ marginTop: 6, marginBottom: 8, fontSize: 24 }}>No user @{handle}</h2>
          <Link to="/leaderboard" className="btn-gold">Browse the leaderboard</Link>
        </div>
      </section>
    );
  }

  const list = tab === 'following' ? following : followers;

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">@{profile.handle}</div>
          <div className="trc-final">
            {profile.displayName}
            <span className="trc-final-sub">
              {following.length} following · {followers.length} {followers.length === 1 ? 'follower' : 'followers'}
            </span>
          </div>
        </div>
        <Link to={`/u/${profile.handle}`} className="btn-ghost" style={{ alignSelf: 'center' }}>
          ← Back to profile
        </Link>
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
        {fLoading ? (
          <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>
        ) : list.length === 0 ? (
          <p style={{ color: 'var(--ink-dim)' }}>
            {tab === 'following'
              ? `@${profile.handle} doesn't follow anyone yet.`
              : `@${profile.handle} doesn't have any followers yet.`}
          </p>
        ) : (
          <div className="bk-table">
            {list.map((p) => (
              <UserRow key={p.userId} profile={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function UserRow({ profile }) {
  const initials = (profile.displayName || profile.handle || '?')
    .split(/\s+|@/)[0].slice(0, 2).toUpperCase();
  return (
    <div className="bk-row pf-user-row">
      <Link to={`/u/${profile.handle}`} className="pf-user-link">
        <div className="pf-user-avatar" aria-hidden="true">
          {profile.favTeamLogo ? (
            <img src={profile.favTeamLogo} alt="" />
          ) : profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" />
          ) : (
            <span>{initials}</span>
          )}
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
      <div className="bk-row-pl">
        <FollowButton targetUserId={profile.userId} compact />
      </div>
    </div>
  );
}
