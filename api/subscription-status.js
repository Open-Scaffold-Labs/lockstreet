import { getUserIdFromRequest, bearer, userClient } from './_utils.js';

export default async function handler(req, res) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return res.status(200).json({ active: false });
  try {
    const supa = userClient(bearer(req));
    if (!supa) return res.status(200).json({ active: false });
    const { data, error } = await supa
      .from('subscriptions')
      .select('tier, status, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return res.status(200).json({ active: false });
    const active =
      (data.status === 'active' || data.status === 'trialing')
      && (!data.current_period_end || new Date(data.current_period_end) > new Date());
    res.status(200).json({
      active,
      tier:     data.tier || null,
      renewsAt: data.current_period_end ? new Date(data.current_period_end).getTime() : null,
      status:   data.status || null,
      cancelAtPeriodEnd: !!data.cancel_at_period_end,
    });
  } catch (e) {
    console.error('[subscription-status]', e);
    res.status(200).json({ active: false });
  }
}
