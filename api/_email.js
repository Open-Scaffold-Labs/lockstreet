// Server-only email sender. Uses Resend (https://resend.com) which has a 3,000/mo
// free tier. Set RESEND_API_KEY + RESEND_FROM_EMAIL in env to enable.
//
// We use raw fetch instead of the Resend SDK so we don't add another dep.

const RESEND_URL = 'https://api.resend.com/emails';

export async function sendEmail({ to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.RESEND_FROM_EMAIL || 'Lock Street <picks@lockstreet.app>';
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY missing - skipping send to', to);
    return { ok: false, skipped: true };
  }
  const body = { from, to: Array.isArray(to) ? to : [to], subject };
  if (html) body.html = html;
  if (text) body.text = text;
  if (replyTo) body.reply_to = replyTo;

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[email] resend error', data);
      return { ok: false, status: res.status, error: data };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error('[email] fetch error', e);
    return { ok: false, error: e.message };
  }
}

export function emailLayout({ heading, body, ctaUrl, ctaLabel, footnote }) {
  return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0b0f1a;color:#e7ebf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-weight:800;font-size:24px;letter-spacing:-0.02em;margin-bottom:24px;">
      <span style="color:#fff;">Lock</span><span style="color:#fbbf24;"> Street</span>
    </div>
    ${heading ? `<h1 style="font-size:22px;margin:0 0 14px;color:#fff;">${heading}</h1>` : ''}
    <div style="color:#8a93a6;font-size:15px;line-height:1.6;">${body}</div>
    ${ctaUrl ? `<p style="margin:28px 0;"><a href="${ctaUrl}" style="display:inline-block;padding:12px 22px;background:#fbbf24;color:#0b0f1a;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:0.06em;text-transform:uppercase;">${ctaLabel || 'Open'}</a></p>` : ''}
    ${footnote ? `<p style="color:#525b6e;font-size:11px;margin-top:32px;border-top:1px solid #2a3042;padding-top:16px;">${footnote}</p>` : ''}
  </div>
</body></html>`;
}
