import { kv } from '@vercel/kv';
import { isAdmin, readJson, badRequest, forbidden, serverError } from './_utils.js';

const KEY = 'picks:all';

async function loadAll() {
  const list = await kv.get(KEY);
  return Array.isArray(list) ? list : [];
}
async function saveAll(list) { await kv.set(KEY, list); }

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const picks = await loadAll();
      return res.status(200).json({ picks });
    }

    // Write methods require admin
    if (!(await isAdmin(req))) return forbidden(res, 'Admin only');

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!body.gameId || !body.side) return badRequest(res, 'gameId and side are required');
      const list = await loadAll();
      const existing = list.findIndex((p) => p.gameId === body.gameId);
      const pick = {
        gameId: String(body.gameId),
        side:   String(body.side),
        units:  Number(body.units) || 1,
        scheduledFor: body.scheduledFor || null,
        postedAt: Date.now(),
      };
      if (existing >= 0) list[existing] = pick; else list.push(pick);
      await saveAll(list);
      return res.status(200).json({ pick });
    }

    if (req.method === 'DELETE') {
      const gameId = req.query?.gameId || new URL(req.url, 'http://x').searchParams.get('gameId');
      if (!gameId) return badRequest(res, 'gameId required');
      const list = await loadAll();
      const next = list.filter((p) => p.gameId !== gameId);
      await saveAll(next);
      return res.status(200).json({ ok: true, removed: list.length - next.length });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { serverError(res, e); }
}
