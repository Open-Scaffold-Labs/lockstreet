import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { lookupTeam } from '../lib/teamsCatalog.js';
import { useAuth, useUser, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import { useMyProfile, setMyPrivacy } from '../hooks/useProfile.js';
import { useToast } from '../lib/toast.jsx';
import { useUserPicks } from '../hooks/useUserPicks.js';
import { useFollows } from '../hooks/useFollows.js';
import { useRealtimeFollowFeed } from '../hooks/useRealtimeFollowFeed.js';
import OnboardingProfileModal from '../components/OnboardingProfileModal.jsx';
import StatsStrip from '../components/StatsStrip.jsx';
import UserPickCard from '../components/UserPickCard.jsx';
import FollowButton from '../components/FollowButton.jsx';
import MakePickFlow from '../components/MakePickFlow.jsx';

/**
 * /profile — your own home page.
 * Replaces the legacy /bankroll route.
 *
 * - SignedOut: marketing CTA explaining the feature.
 * - SignedIn + no profile row: OnboardingProfileModal (handle, fav team).
 * - SignedIn + profile: header + window tabs + StatsStrip + picks tabs.
 */
export default function ProfileRoute() {
  return (
    <section>
      <SignedOut><ProfileSignedOut /></SignedOut>
      <SignedIn><ProfileSignedIn /></SignedIn>
    </section>
  );
}

function ProfileSignedOut() {
  return (
    <div className="empty">
      <div className="trc-eyebrow">Your profile</div>
      <h2 style={{ marginTop: 6, marginBottom: 8, fontSize: 28, letterSpacing: '-0.02em' }}>
        A permanent, unforgeable record.
      </h2>
      <p style={{ color: 'var(--ink-dim)', maxWidth: 520, margin: '0 auto 18px', fontSize: 15, lineHeight: 1.55 }}>
        Pick a handle. Make picks before kickoff. Win, lose, push — every result is graded
        automatically and locked forever. Follow other handicappers, see who's hot and who's cold.
        Lock Street's <strong>system picks</strong> still ship to subscribers — this is the public
        layer where everyone competes.
      </p>
      <SignInButton afterSignInUrl="/profile">
        <button className="btn-gold">Sign in to claim your handle</button>
      </SignInButton>
    </div>
  );
}

function ProfileSignedIn() {
  const { profile, loading, needsOnboarding, reload } = useMyProfile();
  const { user } = useUser();
  const { userId } = useAuth?.() || {};

  if (loading) {
    return <div className="pf-loading">Loading…</div>;
  }

  if (needsOnboarding) {
    const seed = user?.fullName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || '';
    return <OnboardingProfileModal defaultDisplayName={seed} onDone={reload} />;
  }

  if (!profile) {
    return <div className="empty">Couldn't load your profile. Try refreshing.</div>;
  }

  return <ProfileBody profile={profile} ownerUserId={userId} isOwn onProfileUpdated={reload} />;
}

/**
 * Shared body used by both the owner view (/profile) and the public
 * view (/u/:handle). `isOwn` toggles the follow CTA / settings link.
 */
export function ProfileBody({ profile, ownerUserId, isOwn = false, onProfileUpdated }) {
  const [window, setWindow] = useState('season');
  const [pickFlowOpen, setPickFlowOpen] = useState(false);
  const { picks, loading: picksLoading, reload: reloadPicks } = useUserPicks(ownerUserId);
  const { following, followers, loading: followsLoading, reload: reloadFollows } = useFollows(ownerUserId);

  return (
    <>
      <ProfileHeader
        profile={profile}
        followingCount={following.length}
        followersCount={followers.length}
        isOwn={isOwn}
        rightSlot={isOwn
          ? <EditProfileButton profile={profile} onUpdated={onProfileUpdated} inline />
          : <FollowButton targetUserId={profile.userId} onChange={reloadFollows} />}
      />

      <PicksSection
        picks={picks}
        loading={picksLoading}
        isOwn={isOwn}
        onMakePick={isOwn ? () => setPickFlowOpen(true) : undefined}
      />

      {pickFlowOpen && (
        <MakePickFlow
          defaultLeague={profile.favTeamLeague || 'nfl'}
          onClose={() => setPickFlowOpen(false)}
          onSubmitted={() => reloadPicks?.()}
        />
      )}
      {isOwn && <PrivacyBanner profile={profile} />}
      {isOwn && <FollowFeedRail />}

      <div className="pf-window-tabs tabs" role="tablist" aria-label="Stats window">
        {[
          { k: 'week',   label: 'This Week' },
          { k: 'month',  label: 'This Month' },
          { k: 'season', label: 'Season' },
        ].map((t) => (
          <button
            key={t.k}
            type="button"
            className={'tab' + (window === t.k ? ' active' : '')}
            onClick={() => setWindow(t.k)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <StatsStrip picks={picks} window={window} />
    </>
  );
}

function ProfileHeader({ profile, followingCount, followersCount, isOwn, rightSlot = null }) {
  const initials = (profile.displayName || profile.handle || '?')
    .split(/\s+|@/)[0].slice(0, 2).toUpperCase();
  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    : '';

  // Avatar priority: explicit avatarUrl (when uploads ship) > fav-team logo > initials.
  const avatarTitle = profile.favTeamName || profile.favTeam || '';
  const useTeamLogo = !profile.avatarUrl && !!profile.favTeamLogo;

  // Pull team primary color from the catalog so the avatar ring + glow
  // match the team's actual identity (not Lock Street's purple).
  const [teamColors, setTeamColors] = useState(null);
  useEffect(() => {
    if (!useTeamLogo || !profile.favTeam || !profile.favTeamLeague) {
      setTeamColors(null);
      return;
    }
    let cancel = false;
    lookupTeam(profile.favTeam, profile.favTeamLeague).then((t) => {
      if (cancel) return;
      setTeamColors({ primary: t?.color || null, alt: t?.altColor || null });
    });
    return () => { cancel = true; };
  }, [useTeamLogo, profile.favTeam, profile.favTeamLeague]);

  const avatarStyle = useTeamLogo && teamColors?.primary
    ? {
        borderColor: teamColors.primary,
        boxShadow: `0 0 0 1px ${teamColors.primary}, 0 0 18px ${hexWithAlpha(teamColors.primary, 0.35)}`,
      }
    : undefined;

  return (
    <div className="pf-header">
      <div
        className={'pf-avatar' + (useTeamLogo ? ' is-team-logo' : '')}
        style={avatarStyle}
        title={avatarTitle}
        aria-label={avatarTitle ? `Favorite team: ${avatarTitle}` : undefined}
      >
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" />
        ) : profile.favTeamLogo ? (
          <img src={profile.favTeamLogo} alt="" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="pf-id">
        <div className="pf-display-name">{profile.displayName}</div>
        <div className="pf-handle-row">
          <span className="pf-handle">@{profile.handle}</span>
          {profile.isSystem ? <span className="pf-system-badge">OFFICIAL</span> : null}
        </div>
        {profile.bio ? <div className="pf-bio">{profile.bio}</div> : null}
        <div className="pf-meta">
          <Link to="/follow" className="pf-meta-link">
            <strong>{followingCount}</strong> Following
          </Link>
          <span className="pf-meta-link">
            <strong>{followersCount}</strong> {followersCount === 1 ? 'Follower' : 'Followers'}
          </span>
          {memberSince ? <span className="pf-meta-link" style={{ color: 'var(--ink-faint)' }}>Member since {memberSince}</span> : null}
        </div>
      </div>
      {rightSlot}
    </div>
  );
}

function PicksSection({ picks, loading, isOwn, onMakePick }) {
  const [tab, setTab] = useState('live');

  const grouped = useMemo(() => {
    const live = (picks || []).filter((p) => p.result === 'pending');
    const day = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - 30 * day;
    const recent = (picks || []).filter((p) => {
      if (p.result === 'pending' || p.result === 'void') return false;
      const t = p.gradedAt ? new Date(p.gradedAt).getTime() : 0;
      return t >= cutoff;
    });
    const all = (picks || []).filter((p) => p.result !== 'void');
    return { live, recent, all };
  }, [picks]);

  const list =
    tab === 'live'   ? grouped.live :
    tab === 'recent' ? grouped.recent :
                       grouped.all;

  return (
    <div className="about-block">
      {isOwn && onMakePick && (
        <button type="button" className="btn-gold pf-picks-make-pick" onClick={onMakePick}>
          + Make a Pick
        </button>
      )}
      <div className="pf-picks-head">
        <h3>Picks</h3>
        <div className="tabs pf-picks-tabs" role="tablist" aria-label="Picks filter">
          <button type="button" className={'tab' + (tab === 'live'   ? ' active' : '')} onClick={() => setTab('live')}>
            Live today <span className="count">{grouped.live.length}</span>
          </button>
          <button type="button" className={'tab' + (tab === 'recent' ? ' active' : '')} onClick={() => setTab('recent')}>
            Recent <span className="count">{grouped.recent.length}</span>
          </button>
          <button type="button" className={'tab' + (tab === 'all'    ? ' active' : '')} onClick={() => setTab('all')}>
            All <span className="count">{grouped.all.length}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>
      ) : list.length === 0 ? (
        <PicksEmpty tab={tab} isOwn={isOwn} onMakePick={onMakePick} />
      ) : (
        <div className="bk-table">
          {list.map((p) => <UserPickCard key={p.id} pick={p} />)}
        </div>
      )}
    </div>
  );
}

function PicksEmpty({ tab, isOwn, onMakePick }) {
  const lines = {
    live:   isOwn ? 'No locked picks today.' : 'No live picks today.',
    recent: 'No graded picks in the last 30 days.',
    all:    isOwn ? 'No picks yet. Make your first pick — locked at kickoff, graded automatically.' : 'No picks yet.',
  };
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-dim)' }}>
      <p style={{ marginBottom: isOwn ? 14 : 0 }}>{lines[tab]}</p>
      {isOwn && onMakePick ? (
        <button type="button" className="btn-gold" onClick={onMakePick}>+ Make a Pick</button>
      ) : null}
    </div>
  );
}

function EditProfileButton({ profile, onUpdated, inline = false }) {
  const [open, setOpen] = useState(false);
  const btn = (
    <button type="button" className="btn-ghost pf-edit-profile-btn" onClick={() => setOpen(true)}>
      Edit profile
    </button>
  );
  return (
    <>
      {inline ? btn : <div className="pf-edit-row">{btn}</div>}
      {open && (
        <OnboardingProfileModal
          existingProfile={profile}
          onCancel={() => setOpen(false)}
          onDone={() => { setOpen(false); onUpdated?.(); }}
        />
      )}
    </>
  );
}

function PrivacyBanner({ profile }) {
  const toast = useToast();
  const [isPrivate, setIsPrivate] = useState(!!profile.isPrivate);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const fresh = await setMyPrivacy(!isPrivate);
      setIsPrivate(!!fresh.isPrivate);
      toast(fresh.isPrivate ? 'Profile is now private' : 'Profile is now public', { type: 'success' });
    } catch (e) {
      toast(e?.message || 'Could not update', { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'pf-privacy-row' + (isPrivate ? ' is-private' : '')}>
      <span className="pf-privacy-icon">{isPrivate ? '🔒' : '🔓'}</span>
      <div className="pf-privacy-text">
        <strong>{isPrivate ? 'Private profile' : 'Public profile'}</strong>
        <span>
          {isPrivate
            ? 'Only you can see your picks. You\'re hidden from the leaderboard.'
            : 'Your picks and record are visible to everyone. Hot/Not eligible.'}
        </span>
      </div>
      <button
        type="button"
        className={isPrivate ? 'btn-gold pf-privacy-btn' : 'btn-ghost pf-privacy-btn'}
        onClick={toggle}
        disabled={busy}
      >
        {busy ? '…' : isPrivate ? 'Make public' : 'Make private'}
      </button>
    </div>
  );
}

/** "#aabbcc" + 0.35 → "rgba(170,187,204,0.35)". Lets us reuse a hex
 *  team color in a glow/shadow with custom alpha. */
function hexWithAlpha(hex, alpha) {
  if (!hex || typeof hex !== 'string') return null;
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function FollowFeedRail() {
  const { feed } = useRealtimeFollowFeed();
  if (!feed.length) return null;
  return (
    <div className="pf-feed-rail">
      <div className="pf-feed-head">
        <span className="trc-eyebrow">Live from people you follow</span>
        <span className="pf-feed-count">{feed.length} new</span>
      </div>
      <div className="bk-table">
        {feed.slice(0, 5).map((p) => (
          <UserPickCard key={p.id} pick={p} showAuthor />
        ))}
      </div>
    </div>
  );
}
