import { useParams, Link } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile.js';
import { ProfileBody } from './ProfileRoute.jsx';

/**
 * /u/:handle — another user's public profile. Same body as the
 * owner's /profile, minus the "manage follows" CTA: ProfileBody
 * picks up the Follow button automatically when isOwn=false.
 */
export default function PublicProfileRoute() {
  const { handle } = useParams();
  const { profile, loading, error } = useProfile({ handle });

  if (loading) {
    return <section><div className="pf-loading">Loading profile…</div></section>;
  }

  if (error || !profile) {
    return (
      <section>
        <div className="empty">
          <div className="trc-eyebrow">Not found</div>
          <h2 style={{ marginTop: 6, marginBottom: 8, fontSize: 24 }}>No user @{handle}</h2>
          <p style={{ color: 'var(--ink-dim)', marginBottom: 18 }}>
            That handle doesn't exist (or may have been banned).
          </p>
          <Link to="/leaderboard" className="btn-gold">Browse the leaderboard</Link>
        </div>
      </section>
    );
  }

  if (profile.banned) {
    return (
      <section>
        <div className="empty">
          <div className="trc-eyebrow">Hidden</div>
          <p style={{ color: 'var(--ink-dim)' }}>This profile has been hidden.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <ProfileBody profile={profile} ownerUserId={profile.userId} isOwn={false} />
    </section>
  );
}
