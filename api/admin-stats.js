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
    // Pull all users via the admin auth API (service role only).
    // Page size 1000 is fine for low-volume product; extend later if needed.
    const { data: usersData, error: usersErr } = await supa.auth.admin.listUsers({ perPage: 1000 });
    if (usersErr) throw usersErr;
    const users = usersData?.users || [];
    const totalUsers = users.length;
    const confirmedUsers = users.filter((u) => u.email_confirmed_at).length;
    const unconfirmedUsers = totalUsers - confirmedUsers;

    // Recent signups (last 10)
    const recentSignups = users
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map((u) => ({
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
