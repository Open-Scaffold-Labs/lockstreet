import { isAdmin, readJson, forbidden, serverError, adminClient } from './_utils.js';
import { sendEmail, emailLayout } from './_email.js';

/**
 * Admin endpoint: broadcast the weekly preview email to ACTIVE subscribers only.
 * Body: { subject, headlineHtml, bodyHtml, ctaUrl?, ctaLabel? }
 *
 * Subscriber-gated: only users with subscriptions.status='active' are emailed.
 * Free users are intentionally NOT emailed (subscription-based resource per spec).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await isAdmin(req))) return forbidden(res);
  const supa = adminClient();
  if (!supa) return serverError(res, new Error('SUPABASE_SERVICE_ROLE_KEY not set'));

  try {
    const { subject, headline, body, ctaUrl, ctaLabel } = await readJson(req);
    if (!subject || !body) return res.status(400).json({ error: 'subject + body required' });

    // Pull active subscribers' emails
    const { data: subs, error: subsErr } = await supa
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'active');
    if (subsErr) return serverError(res, subsErr);
    const userIds = (subs || []).map((s) => s.user_id);
    if (!userIds.length) return res.status(200).json({ sent: 0, total: 0, note: 'No active subscribers' });

    // Fetch email addresses from auth.users via admin API
    const emails = [];
    for (const uid of userIds) {
      const { data, error } = await supa.auth.admin.getUserById(uid);
      if (!error && data?.user?.email) emails.push(data.user.email);
    }
    if (!emails.length) return res.status(200).json({ sent: 0, total: 0, note: 'No subscriber emails resolved' });

    const html = emailLayout({
      heading: headline || subject,
      body,
      ctaUrl: ctaUrl || `${process.env.APP_URL || ''}/picks`,
      ctaLabel: ctaLabel || 'See this week\'s picks',
      footnote: 'You are receiving this because you have an active Lock Street subscription. Reply to this email if you want to cancel anytime.',
    });

    const results = await Promise.allSettled(emails.map((to) => sendEmail({ to, subject, html })));
    const sent = results.filter((r) => r.value?.ok).length;
    res.status(200).json({ sent, total: emails.length });
  } catch (e) { serverError(res, e); }
}
