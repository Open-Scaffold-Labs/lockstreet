import { kv } from '@vercel/kv';
import { getUserIdFromRequest } from './_utils.js';

export default async function handler(req, res) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return res.status(200).json({ active: false });
  try {
    const rec = await kv.get(`sub:${userId}`);
    if (!rec) return res.status(200).json({ active: false });
    res.status(200).json({
      active: !!rec.active,
      tier: rec.tier || null,
      renewsAt: rec.renewsAt || null,
      status: rec.status || null,
    });
  } catch (e) {
    console.error('[subscription-status]', e);
    res.status(200).json({ active: false });
  }
}
