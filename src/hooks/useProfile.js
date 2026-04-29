import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * Fetch a profile by EITHER user_id OR handle.
 *   useProfile({ userId: '...' })  -> own profile
 *   useProfile({ handle: 'matt' }) -> public profile
 *
 * Returns { profile, loading, error, reload }.
 *
 * Profile shape (camelCase):
 *   userId, handle, displayName, favTeam, favTeamLeague, avatarUrl,
 *   bio, isSystem, banned, createdAt
 */
export function useProfile({ userId, handle } = {}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    if (!userId && !handle) { setLoading(false); setProfile(null); return; }
    setLoading(true);
    try {
      let q = supabase.from('profiles').select(
        'user_id, handle, display_name, fav_team, fav_team_league, fav_team_name, fav_team_logo, avatar_url, bio, is_system, banned, is_private, created_at'
      );
      if (userId) q = q.eq('user_id', userId);
      else        q = q.eq('handle', String(handle).toLowerCase());
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      setProfile(data ? mapProfile(data) : null);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId, handle]);

  useEffect(() => { load(); }, [load]);

  return { profile, loading, error, reload: load };
}

/**
 * Hook for the *current* signed-in user's profile. Convenience wrapper
 * around useProfile that pulls userId from auth and exposes the
 * "needs onboarding" flag (loaded but no row).
 */
export function useMyProfile() {
  const { userId, isLoaded, isSignedIn } = useAuth?.() || {};
  const { profile, loading, error, reload } = useProfile({ userId: isSignedIn ? userId : null });

  return useMemo(() => ({
    profile,
    loading: loading || !isLoaded,
    error,
    reload,
    needsOnboarding: isLoaded && isSignedIn && !loading && !profile && !error,
  }), [profile, loading, error, reload, isLoaded, isSignedIn]);
}

/** Create-or-update the current user's profile. Returns the new row. */
export async function upsertMyProfile(fields) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess?.user?.id;
  if (!uid) throw new Error('Not signed in');

  const payload = {
    user_id: uid,
    handle: String(fields.handle || '').toLowerCase().trim(),
    display_name: String(fields.displayName || fields.display_name || '').trim(),
    fav_team: fields.favTeam ?? fields.fav_team ?? null,
    fav_team_league: fields.favTeamLeague ?? fields.fav_team_league ?? null,
    fav_team_name: fields.favTeamName ?? fields.fav_team_name ?? null,
    fav_team_logo: fields.favTeamLogo ?? fields.fav_team_logo ?? null,
    avatar_url: fields.avatarUrl ?? fields.avatar_url ?? null,
    bio: fields.bio ?? null,
  };
  // First try insert; if row already exists, update everything except handle.
  const { data: existing } = await supabase
    .from('profiles')
    .select('user_id, handle')
    .eq('user_id', uid)
    .maybeSingle();

  if (existing) {
    const { handle, user_id, ...updateFields } = payload;
    const { data, error } = await supabase
      .from('profiles')
      .update(updateFields)
      .eq('user_id', uid)
      .select()
      .single();
    if (error) throw error;
    return mapProfile(data);
  }

  const { data, error } = await supabase.from('profiles').insert(payload).select().single();
  if (error) throw error;
  return mapProfile(data);
}

/** Search profiles by handle / display name. Used by /follow. */
export async function searchProfiles(query, { limit = 20 } = {}) {
  if (!supabase) return [];
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, handle, display_name, fav_team, fav_team_league, avatar_url, is_system, banned')
    .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
    .eq('banned', false)
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapProfile);
}

/** Reserved + format-validating handle check. Mirrors DB triggers. */
export function validateHandle(raw) {
  const h = String(raw || '').toLowerCase().trim();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) {
    return { ok: false, reason: '3-20 chars: letters, numbers, underscore.' };
  }
  const reserved = new Set([
    'lockstreet','admin','support','api','help','about','picks','scores',
    'lines','props','bankroll','profile','leaderboard','contest','weekly',
    'sign-in','sign-up','signup','login','logout','reset','reset-password',
    'matt','shawn','mlav1114','luckyshawn','anthropic','claude','staff','official',
  ]);
  if (reserved.has(h)) return { ok: false, reason: 'That handle is reserved.' };
  return { ok: true, handle: h };
}

function mapProfile(p) {
  if (!p) return null;
  return {
    userId: p.user_id,
    handle: p.handle,
    displayName: p.display_name,
    favTeam: p.fav_team,
    favTeamLeague: p.fav_team_league,
    favTeamName: p.fav_team_name,
    favTeamLogo: p.fav_team_logo,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    isSystem: !!p.is_system,
    banned: !!p.banned,
    isPrivate: !!p.is_private,
    createdAt: p.created_at,
  };
}

/**
 * Update the privacy flag on the current user's profile. Returns the
 * fresh profile row.
 */
export async function setMyPrivacy(isPrivate) {
  if (!supabase) throw new Error('Supabase client not configured');
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess?.user?.id;
  if (!uid) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_private: !!isPrivate })
    .eq('user_id', uid)
    .select()
    .single();
  if (error) throw error;
  return mapProfile(data);
}
