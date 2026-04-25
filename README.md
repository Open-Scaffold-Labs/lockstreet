# Lock Street

> **Follow the smart money.**
> Sports betting picks app — NFL + CFB. 61% ATS over 6 seasons.

React + Vite on the frontend, Vercel serverless functions on the backend, Clerk for auth, Stripe for subscriptions, Vercel KV for pick storage, Web Push for drop notifications.

---

## What's in the box

| Tab | Who sees what |
| --- | --- |
| **Scores** | All NFL + CFB games, live + upcoming + final, with ATS records, spread, O/U, line movement |
| **Picks** | Only games with a Lock Street pick. Free users see the game + lines, the pick side is locked until they subscribe |
| **Record** | 61.1% win rate, 187-119 ATS, +24.3% ROI, weekly performance chart |
| **Subscribe** | Weekly $19, Monthly $59 (POPULAR), Season $199 |
| **Admin** (gated) | Post / edit / delete picks per game, push a notification to subscribers |

Live data comes from ESPN's unofficial scoreboard API — no key required, works fine from the browser in production on Vercel.

---

## Local dev

```bash
npm install
cp .env.example .env.local
# Fill in the keys (see the checklist below)

# Run Vite + the serverless functions together:
npx vercel dev
# Or, if you don't need the /api routes yet:
npm run dev
```

App runs at http://localhost:5173 (Vite) or http://localhost:3000 (Vercel dev).

---

## Keys you have to provide

Nothing here has keys baked in. Copy `.env.example` to `.env.local` and fill in:

### Clerk — auth
1. Create an application at https://dashboard.clerk.com
2. Copy the publishable + secret keys:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. To make yourself admin: in Clerk Dashboard → Users → (you) → Metadata → Public, add `{"role": "admin"}`. That unlocks the `/admin` route without needing the fallback password.

### Stripe — subscriptions
1. https://dashboard.stripe.com/apikeys → copy `STRIPE_SECRET_KEY` + `VITE_STRIPE_PUBLISHABLE_KEY`.
2. Products → create three recurring prices:
   - Weekly $19/week → `STRIPE_PRICE_WEEKLY`
   - Monthly $59/month → `STRIPE_PRICE_MONTHLY`
   - Season $199/6 months (or yearly) → `STRIPE_PRICE_SEASON`
3. Set up the webhook:
   - **Local**: `stripe listen --forward-to localhost:3000/api/stripe-webhook` — the CLI prints a `whsec_…` value, paste that into `STRIPE_WEBHOOK_SECRET`.
   - **Prod**: Dashboard → Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe-webhook`. Subscribe to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret into Vercel env.

### Vercel KV — pick storage
1. Vercel Dashboard → Storage → Create → KV database
2. Connect it to this project. The `KV_*` env vars are injected automatically.

### Web Push — notifications
```bash
npx web-push generate-vapid-keys
```
Paste the public key into `VITE_VAPID_PUBLIC_KEY` and the private into `VAPID_PRIVATE_KEY`.

### Admin
Set `ADMIN_PASSWORD` to a long random string. This is the fallback gate for write actions on `/admin` if you haven't assigned the Clerk admin role yet.

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel            # first-run: link to OpenScaffold Labs / lockstreet project
vercel --prod
```

Post-deploy checklist:
- [ ] All env vars copied into Vercel → Project Settings → Environment Variables
- [ ] Stripe webhook endpoint added and secret pasted
- [ ] Clerk allowed origins updated to include the prod domain
- [ ] A Clerk user has `publicMetadata.role = "admin"`
- [ ] `/api/picks` returns `{"picks":[]}` (KV reachable)
- [ ] Sign in, hit `/subscribe`, run a checkout in Stripe test mode — you land on `/success` and the GO PRO button flips green

---

## File layout

```
lockstreet/
├── api/                        Vercel serverless functions
│   ├── _utils.js               Clerk JWT verify + admin gate helpers
│   ├── create-checkout-session.js
│   ├── stripe-webhook.js
│   ├── subscription-status.js
│   ├── picks.js                GET public / POST+DELETE admin-only
│   ├── notify-subscribe.js     Save a browser's push subscription
│   └── send-notifications.js   Broadcast a pick drop (admin-only)
├── public/
│   ├── manifest.json
│   └── sw.js                   Service worker for Web Push
├── src/
│   ├── main.jsx                React root + ClerkProvider + SW registration
│   ├── App.jsx                 Route config
│   ├── components/             Header, GameCard, TeamOrb, PickLockOverlay
│   ├── routes/                 Scores, Picks, Record, Subscribe, Admin, Success, SignIn
│   ├── hooks/                  useEspnScoreboard, useSubscription, usePicks, usePushNotifications
│   ├── lib/                    teams (colors), pricing, espn (fetch + normalize)
│   └── styles/index.css        The dark + gold design system
├── index.html                  Vite entry, loads Syne + JetBrains Mono
├── vite.config.js              Dev proxy for /api
├── vercel.json                 SPA rewrites + function config
└── .env.example                Every env var documented
```

---

## What's NOT done yet

These are deliberate TODOs — file an issue or add a task:

- **Real ATS records from a paid feed.** ESPN's free scoreboard exposes straight-up records but not consistent ATS splits. The UI shows `—` in that case. Wire The Odds API or Sportradar for a proper feed.
- **Line movement.** Same — ESPN doesn't expose opening-line history. The `move` pill renders only when populated.
- **Past seasons on the Record tab.** Currently a hard-coded current-season array; switch to KV-backed `record:weekly:<season>` once there's a real results pipeline.
- **Scheduled pick drops.** The admin can post a pick now; there's no cron to flip a "scheduled" pick visible automatically. Add a Vercel Cron that hits `/api/send-notifications` N minutes before kickoff.
- **Bankroll tracker** on the Monthly tier — not built.
- **Discord invite** on Season Pass — not built.

---

## Tagline

**Lock Street — Follow the smart money.**
