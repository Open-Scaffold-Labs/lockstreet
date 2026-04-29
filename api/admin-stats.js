/**
 * Admin user stats endpoint. Returns counts + recent signups + sub breakdown.
 * Gated on isAdmin (JWT role=admin or x-admin-password header). Uses
 * service-role client to read auth.users (anon role can't see that schema).
 */
import { isAdmin, forbidden, serverError, adminClient } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!(await isAdmin(req))) return forbidden(res);
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY not set'));

  try {
    // Read users via a SECURITY DEFINER RPC (admin_list_users) instead
    // of GoTrue's admin endpoint. GoTrue's listUsers deserializes every
    // row through its own User struct and chokes ("Database error
    // finding user") on the synthetic @lockstreet auth.users row,
    // which is missing fields newer GoTrue versions require. The RPC
    // also already filters that synthetic row out and PostgREST
    // doesn't need the auth schema exposed.
    //
    // RPC defined in supabase/migrations/20260429_admin_list_users.sql.
    const { data: rawUsers, error: usersErr } = await supa.rpc('admin_list_users');
    if (usersErr) throw usersErr;
    const users = rawUsers || [];
    const totalUsers = users.length;
    const confirmedUsers = users.filter((u) => u.email_confirmed_at).length;
    const unconfirmedUsers = totalUsers - confirmedUsers;

    // Recent signups (last 10) — already sorted desc by created_at.
    const recentSignups = users.slice(0, 10).map((u) => ({
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      confirmed: !!u.email_confirmed_at,
    }));

    // Active subs breakdown by tier
    const { data: subs } = await supa
      .from('subscriptions')
      .select('user_id, tier, status, current_period_end')
      .eq('status', 'active');
    const tierCounts = { weekly: 0, monthly: 0, season: 0 };
    (subs || []).forEach((s) => { if (tierCounts[s.tier] != null) tierCounts[s.tier] += 1; });
    const totalActiveSubs = subs?.length || 0;

    // Push devices
    const { data: devices } = await supa
      .from('push_subscriptions')
      .select('id, user_id');
    const pushDevices = devices?.length || 0;
    const pushUsers = new Set((devices || []).map((d) => d.user_id)).size;

    res.status(200).json({
      totalUsers, confirmedUsers, unconfirmedUsers,
      totalActiveSubs, tierCounts,
      pushDevices, pushUsers,
      recentSignups,
    });
  } catch (e) { serverError(res, e); }
}
