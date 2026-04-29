import { useState } from 'react';
import { upsertMyProfile, validateHandle } from '../hooks/useProfile.js';
import { useToast } from '../lib/toast.jsx';
import TeamPicker from './TeamPicker.jsx';

/**
 * First-time profile setup modal. Shown when the signed-in user has no
 * row in the profiles table. Captures handle (immutable post-create),
 * display name, optional fav team + league, optional bio.
 *
 * Renders directly inside ProfileRoute when needsOnboarding is true.
 * On success calls onDone() which the parent uses to refetch.
 */
export default function OnboardingProfileModal({ defaultDisplayName = '', existingProfile = null, onDone, onCancel }) {
  const toast = useToast();
  const editMode = !!existingProfile;
  const [handle, setHandle] = useState(existingProfile?.handle || '');
  const [displayName, setDisplayName] = useState(existingProfile?.displayName || defaultDisplayName || '');
  const [team, setTeam] = useState(
    existingProfile?.favTeam ? {
      abbr: existingProfile.favTeam,
      name: existingProfile.favTeamName || existingProfile.favTeam,
      league: existingProfile.favTeamLeague,
      logo: existingProfile.favTeamLogo,
    } : null,
  );
  const [bio, setBio] = useState(existingProfile?.bio || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault?.();
    setErr('');
    if (!editMode) {
      const v = validateHandle(handle);
      if (!v.ok) { setErr(v.reason); return; }
    }
    if (!displayName.trim()) { setErr('Display name required.'); return; }
    setBusy(true);
    try {
      await upsertMyProfile({
        handle: editMode ? existingProfile.handle : validateHandle(handle).handle,
        displayName: displayName.trim(),
        favTeam: team?.abbr ?? null,
        favTeamLeague: team?.league ?? null,
        favTeamName: team?.name ?? null,
        favTeamLogo: team?.logo ?? null,
        bio: bio.trim() || null,
      });
      toast(editMode ? 'Profile updated' : 'Profile created', { type: 'success' });
      onDone?.();
    } catch (e) {
      const msg = e?.message || '';
      if (/duplicate key|profiles_handle_key/i.test(msg)) setErr('That handle is taken.');
      else if (/Handle ".*" is reserved/.test(msg)) setErr('That handle is reserved.');
      else setErr(msg || 'Could not create profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-modal-overlay" role="dialog" aria-modal="true" aria-label={editMode ? 'Edit your profile' : 'Set up your profile'}>
      <form className="pf-modal-card" onSubmit={submit}>
        {editMode && onCancel ? (
          <button type="button" className="pm-close" onClick={onCancel} aria-label="Close">×</button>
        ) : null}
        <div className="pf-modal-eyebrow">{editMode ? 'Edit profile' : 'One-time setup'}</div>
        <h2 className="pf-modal-title">{editMode ? 'Edit your profile' : 'Welcome to Lock Street.'}</h2>
        <p className="pf-modal-body">
          {editMode ? (
            <>Update your display name, fav team, or bio. <strong>Your handle is locked</strong> — that's permanent by design.</>
          ) : (
            <>Pick a handle, a display name, and (optionally) your team. Your handle becomes the URL for your profile and <strong>cannot be changed later</strong> — pick one you're happy with.</>
          )}
        </p>

        <div className="pf-form">
          {editMode ? (
            <div className="pf-edit-handle">
              <span className="pf-edit-handle-label">Handle</span>
              <span className="pf-edit-handle-value">@{existingProfile.handle}</span>
              <span className="pf-edit-handle-locked">locked</span>
            </div>
          ) : (
            <label>
              <span>Handle</span>
              <div className="pf-handle-input">
                <span className="pf-handle-prefix">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  placeholder="3-20 chars, letters / numbers / underscore"
                  maxLength={20}
                  autoComplete="off"
                  required
                />
              </div>
            </label>
          )}

          <label>
            <span>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What people see — can be changed later"
              maxLength={40}
              required
            />
          </label>

          <label>
            <span>Fav team (optional)</span>
            <TeamPicker value={team} onChange={setTeam} placeholder="Search any NFL / CFB / NBA / MLB / NHL / CBB team…" />
          </label>

          <label>
            <span>Bio (optional)</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A line about how you bet."
              maxLength={280}
              rows={2}
            />
          </label>

          {err ? <div className="pf-form-err">{err}</div> : null}

          <button type="submit" className="btn-gold pf-form-submit" disabled={busy}>
            {busy ? (editMode ? 'Saving…' : 'Creating…') : (editMode ? 'Save changes' : 'Create my profile')}
          </button>
        </div>
      </form>
    </div>
  );
}
