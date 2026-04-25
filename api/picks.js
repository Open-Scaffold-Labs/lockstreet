import {
  isAdmin, readJson, badRequest, forbidden, serverError,
  bearer, userClient, anonClient, adminClient,
} from './_utils.js';

/**
 * GET    /api/picks       - list visible picks (RLS handles gating)
 * POST   /api/picks       - admin only: upsert a pick
 * DELETE /api/picks?gameId=X - admin only: remove a pick
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const supa = userClient(bearer(req)) || anonClient();
      if (!supa) return serverError(res, new Error('Supabase env missing'));
      const { data, error } = await supa
        .from('picks')
        .select('id, game_id, league, season, week, side, units, reasoning, visibility, result, posted_at, locks_at')
        .order('posted_at', { ascending: false });
      if (error) return serverError(res, error);
      // Map snake_case -> camelCase for the front-end's existing shape.
      const picks = (data || []).map((p) => ({
        gameId: p.game_id, league: p.league, season: p.season, week: p.week,
        side: p.side, units: Number(p.units), reasoning: p.reasoning,
        visibility: p.visibility, result: p.result,
        postedAt: p.posted_at, locksAt: p.locks_at,
      }));
      return res.status(200).json({ picks });
    }

    // Write methods require admin
    if (!(await isAdmin(req))) return forbidden(res, 'Admin only');
    const supa = adminClient();
    if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY not set on server'));

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!body.gameId || !body.side) return badRequest(res, 'gameId and side are required');
      const row = {
        game_id:    String(body.gameId),
        league:     body.league === 'cfb' ? 'cfb' : 'nfl',
        season:     Number(body.season) || new Date().getFullYear(),
        week:       body.week != null ? Number(body.week) : null,
        side:       String(body.side),
        units:      Number(body.units) || 1,
        reasoning:  body.reasoning || null,
        visibility: body.visibility === 'public' ? 'public' : 'paid',
        locks_at:   body.locksAt || null,
      };
      const { data, error } = await supa
        .from('picks')
        .upsert(row, { onConflict: 'game_id' })
        .select()
        .single();
      if (error) return serverError(res, error);
      return res.status(200).json({ pick: data });
    }

    if (req.method === 'DELETE') {
      const gameId = req.query?.gameId
        || new URL(req.url, 'http://x').searchParams.get('gameId');
      if (!gameId) return badRequest(res, 'gameId required');
      const { error, count } = await supa
        .from('picks')
        .delete({ count: 'exact' })
        .eq('game_id', gameId);
      if (error) return serverError(res, error);
      return res.status(200).json({ ok: true, removed: count ?? 0 });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { serverError(res, e); }
}
