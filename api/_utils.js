// Shared server helpers used by Vercel serverless routes.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL              = process.env.SUPABASE_URL              || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY         = process.env.SUPABASE_ANON_KEY         || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Bearer token from Authorization header (or null).
 *  Rejects empty / malformed tokens at the boundary so downstream callers
 *  don't have to defend against `""` propagating into Supabase.auth.getUser. */
export function bearer(req) {
  const hdr = req.headers.authorization || req.headers.Authorization;
  if (!hdr || !hdr.startsWith('Bearer ')) return null;
  const tok = hdr.slice(7).trim();
  // JWTs are ≥ ~30 chars and use only [A-Za-z0-9._-]. Anything else is junk.
  if (!tok || tok.length < 16 || !/^[A-Za-z0-9._-]+$/.test(tok)) return null;
  return tok;
}

/** Per-request Supabase client scoped to the user's JWT (RLS applies). */
export function userClient(token) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous client - only sees rows readable to anon role (e.g. public picks). */
export function anonClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Admin client - bypasses RLS. Required for Stripe webhooks + broadcast endpoints. */
export function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verify a Supabase JWT and return the user id (sub), or null. */
export async function getUserIdFromRequest(req) {
  const token = bearer(req);
  if (!token) return null;
  const supa = userClient(token);
  if (!supa) return null;
  try {
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch { return null; }
}

/** Is the request authorized to mutate admin data? */
export async function isAdmin(req) {
  const token = bearer(req);
  if (token) {
    const supa = userClient(token);
    if (supa) {
      try {
        const { data } = await supa.auth.getUser(token);
        const role = data?.user?.app_metadata?.role || data?.user?.user_metadata?.role;
        if (role === 'admin') return true;
      } catch { /* fall through to password */ }
    }
  }
  const pw = req.headers['x-admin-password'] || req.headers['X-Admin-Password'];
  if (pw && process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD) return true;
  return false;
}

export function badRequest(res, msg = 'Bad Request') { res.status(400).json({ error: msg }); }
export function unauthorized(res, msg = 'Unauthorized') { res.status(401).json({ error: msg }); }
export function forbidden(res, msg = 'Forbidden') { res.status(403).json({ error: msg }); }
export function serverError(res, err) {
  console.error('[api error]', err);
  res.status(500).json({ error: err?.message || 'Internal Error' });
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => { try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
