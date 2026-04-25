// Shared server helpers used by Vercel serverless routes.

import { createClerkClient, verifyToken } from '@clerk/backend';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
export const clerk = CLERK_SECRET_KEY ? createClerkClient({ secretKey: CLERK_SECRET_KEY }) : null;

/** Verify a Clerk session JWT from the Authorization header. */
export async function getUserIdFromRequest(req) {
  const hdr = req.headers.authorization || req.headers.Authorization;
  if (!hdr || !hdr.startsWith('Bearer ') || !CLERK_SECRET_KEY) return null;
  const token = hdr.slice(7);
  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    return payload?.sub || null;
  } catch {
    return null;
  }
}

/** Is the request authorized to mutate admin data? */
export async function isAdmin(req) {
  // Path 1: Clerk user with publicMetadata.role === 'admin'
  const uid = await getUserIdFromRequest(req);
  if (uid && clerk) {
    try {
      const user = await clerk.users.getUser(uid);
      if (user?.publicMetadata?.role === 'admin') return true;
    } catch { /* fall through to password */ }
  }
  // Path 2: matching admin password header — MVP bootstrap
  const pw = req.headers['x-admin-password'] || req.headers['X-Admin-Password'];
  if (pw && process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD) return true;
  return false;
}

export function badRequest(res, msg = 'Bad Request') {
  res.status(400).json({ error: msg });
}
export function unauthorized(res, msg = 'Unauthorized') {
  res.status(401).json({ error: msg });
}
export function forbidden(res, msg = 'Forbidden') {
  res.status(403).json({ error: msg });
}
export function serverError(res, err) {
  console.error('[api error]', err);
  res.status(500).json({ error: err?.message || 'Internal Error' });
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  // Vercel Node runtime usually parses JSON; if not, do it manually.
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => { try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
