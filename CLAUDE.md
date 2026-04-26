# Lock Street — Claude Session Brief

> Read this first. It's the working memory for any Claude (or developer) picking up the LockStreet project. Update it as facts change so the next session doesn't repeat work or rediscover gotchas.

---

## What this is

**Lock Street** is a premium NFL + CFB betting picks subscription app. A subscriber gets **4 NFL + 4 college picks against the spread per week**, with reasoning and unit sizing, locked until kickoff, **never made public**.

- **Pricing:** $100 / week · $250 / month · $500 / year (Annual is the headline value at \~$9.60/wk effective).
- **Free tier:** one weekly free pick on a chosen game, posted publicly. Used as the funnel.
- **Paid picks are permanently private** to active subscribers — even after the game ends, non-subs never see them.

## Who runs it

Father-son operation. Brand around lineage / shared system.

- **Matt** — son, day-to-day operator, posts the picks. Online handle: `Mlav1114`.
- **Shawn** — father, developed the handicapping system. Online handle: `Lucky Shawn`.

### Verifiable track record (used on /about page)

PoolFieldResultNotesW3P1 ATS Pool (most recent season)100#**1** — 94/144 (\~65% ATS)Joint entry, 4 picks each. Same format as paid product.Office Football Pool66#**1** — Matt solo, 67-44-3, 23 key winsConfidence-weighted, simulates unit sizing.Karen's NFL Pool84#**1 (Matt) and #2 (Shawn**)Both top-2 — strongest system-validation signal.

---

## Tech stack

LayerChoiceNotesFrontend**React 18 + Vite 5**Pure SPA, file-based routes via react-router-domAuth**Supabase Auth**Was Clerk originally; migrated. Custom `src/lib/auth.jsx` mirrors Clerk's `useAuth/useUser/SignedIn/SignedOut/SignInButton/UserButton` API for minimal component churn.DB**Supabase Postgres**RLS-gated. Schema in `supabase/migrations/20260425_initial_schema.sql`.Payments**Stripe** (subscriptions)Webhook at `api/stripe-webhook.js`. Not yet wired with real keys.Push**Web Push**VAPID keys generated. SW at `public/sw.js`.API**Vercel serverless** in `/api/*`Run with `vercel dev` locally; unused under plain Vite.Deploy**Vercel Hobby** (planned)Not yet deployed. Code on GitHub only.PWAmanifest + icons + swMobile-first. Installable on iOS via Add-to-Home-Screen, native on Android.

### Database schema (`supabase/migrations/20260425_initial_schema.sql`)

Three tables, all RLS-enabled:

- `picks` — `game_id`, `league` (nfl|cfb), `season`, `week`, `side`, `units` (0.5–5.0), `reasoning`, `visibility` (public|paid), `result` (win|loss|push|pending), `posted_at`, `locks_at`, `graded_at`, `created_by`. Unique on `game_id`.
- `subscriptions` — keyed by `user_id`, mirrors Stripe state. Tiers: weekly|monthly|season. Statuses: active|inactive|past_due|canceled|trialing.
- `push_subscriptions` — Web Push endpoints, keyed by `user_id` (cascade delete).

### RLS policies

- Anyone can `SELECT` picks where `visibility='public'`.
- Authenticated users with an active subscription can `SELECT` picks where `visibility='paid'`.
- Only users with `auth.jwt()->'app_metadata'->>'role' = 'admin'` can write picks.
- Users see their own subscriptions and own push subscriptions only.
- Service role (server) bypasses RLS — used by Stripe webhook + push broadcast.

### Auth model details

- `src/lib/auth.jsx` is the abstraction layer. Components import `useAuth`, `useUser`, `SignedIn`, `SignedOut`, `SignInButton`, `UserButton` from there.
- The hooks return memoized objects to avoid the infinite render loop bug we hit during the Clerk migration.
- Admin role: stored in `auth.users.raw_app_meta_data.role = 'admin'`. Set via SQL:

  ```sql
  update auth.users
  set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"')
  where email = 'YOUR_EMAIL';
  ```

---

## Repo layout

```
lockstreet/
├── api/                          # Vercel serverless routes (Supabase-backed)
│   ├── _utils.js                 # bearer/userClient/anonClient/adminClient/getUserIdFromRequest/isAdmin
│   ├── picks.js                  # GET (RLS-gated read) / POST / DELETE (admin-gated write)
│   ├── subscription-status.js    # reads subscriptions row
│   ├── notify-subscribe.js       # writes push_subscriptions row
│   ├── send-notifications.js     # admin: broadcast push to active subscribers
│   ├── create-checkout-session.js# Stripe checkout flow
│   └── stripe-webhook.js         # Stripe → subscriptions table sync (uses service_role)
├── public/
│   ├── favicon.svg, favicon-32.png, apple-touch-icon.png
│   ├── icon-192.png, icon-512.png, icon-maskable-512.png
│   ├── manifest.webmanifest
│   └── sw.js                     # Web Push handler
├── scripts/
│   └── generate-icons.mjs        # one-shot PNG generation from favicon.svg via sharp
├── src/
│   ├── App.jsx                   # routes
│   ├── main.jsx                  # AuthProvider + BrowserRouter mount
│   ├── lib/
│   │   ├── supabase.js           # createClient(URL, ANON_KEY)
│   │   ├── auth.jsx              # AuthProvider + Clerk-shaped hooks/components
│   │   └── pricing.js            # 3 tiers ($100/$250/$500)
│   ├── hooks/
│   │   ├── useEspnScoreboard.js
│   │   ├── usePicks.js
│   │   ├── useSubscription.js    # depends on auth.userId only (NOT on the auth object — would loop)
│   │   └── usePushNotifications.js
│   ├── routes/
│   │   ├── HomeRoute.jsx         # / — landing (hero, stats, how-it-works, pricing, CTA)
│   │   ├── ScoresRoute.jsx       # /scores — ESPN scoreboard with off-season banner
│   │   ├── PicksRoute.jsx        # /picks — paid picks (or marketing empty state when none)
│   │   ├── AboutRoute.jsx        # /about — credentials/Track Record (3 pool wins)
│   │   ├── SubscribeRoute.jsx    # /subscribe — 3 tiers
│   │   ├── SignInRoute.jsx       # /sign-in — custom Supabase email/password form
│   │   ├── AdminRoute.jsx        # /admin — admin-only pick CRUD
│   │   └── SuccessRoute.jsx      # /success — Stripe redirect target
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── GameCard.jsx
│   │   └── InstallPrompt.jsx     # mobile bottom banner; per-platform install UX
│   └── styles/
│       ├── index.css             # base, dark theme, gold accent
│       └── mobile.css            # <=600px overrides
├── supabase/migrations/
│   └── 20260425_initial_schema.sql
├── .env.example                  # all required env vars (no secrets)
├── .env.local                    # local secrets (gitignored)
├── package.json
└── vercel.json
```

---

## Environment variables

`.env.local` should match `.env.example`. Currently set:

- `VITE_SUPABASE_URL` / `SUPABASE_URL` — `https://chwijzlynfnxvzfeydtf.supabase.co`
- `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` — set
- `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — generated 2026-04-25
- `VAPID_SUBJECT` — `mailto:mlav1114@aol.com`
- `VITE_APP_URL` / `APP_URL` — `http://localhost:5174`
- `ADMIN_PASSWORD` — temp dev password

**Still missing (need to add when ready):**

- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Settings → API → "service_role" key. **Server-only, never commit.** Required for Stripe webhook, push broadcast, weekly email send.
- `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_WEEKLY/MONTHLY/SEASON`, `STRIPE_WEBHOOK_SECRET` — from Stripe Dashboard. Use test mode keys until launch.
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — sign up at https://resend.com (3,000/mo free, no card). Powers Discord invite delivery + weekly email blast.
- `DISCORD_INVITE_URL` — static invite link from your private Discord server. Auto-emailed to Annual subs via Stripe webhook.
- `ODDS_API_KEY` — sign up at https://the-odds-api.com (500/mo free, no card). Powers /lines and /props with live data. Server-only (never prefix with `VITE_`). When unset, both pages fall back to sample data.

### Odds API (the-odds-api.com)

- `api/odds.js` proxies game odds (spreads/totals/h2h) for `?sport=nfl|cfb|nba|mlb|nhl`. **5-min in-memory cache** keyed by sport.
- `api/odds-props.js` proxies player props per event (markets default `player_pass_yds,player_rush_yds,player_reception_yds,player_anytime_td`). **10-min cache** per event+market.
- Free tier is **500 requests/month** — each `/api/odds` hit = 1 call; each `/api/odds-props` hit = 1 call **per event** (so 6 events = 6 calls). `PropsRoute` caps to first 6 events to conserve quota.
- Both endpoints return 503 with a `hint` when the key is missing, so the client falls back to mock data without breaking.
- `LinesRoute` matches ESPN games to Odds API events by `away|home|kickoff-day` keys; `PropsRoute` does a 2-step fetch (odds → event IDs → props).

### Email model

- **Free users only get Supabase auth emails** (sign-up confirmation, password reset).
- **Active subscribers get:** Discord invite (Annual tier only) + admin-triggered weekly email blast.
- Weekly email is admin-triggered from `/admin → Email subs` button — calls `/api/send-weekly`, which queries `subscriptions.status='active'` and only emails those users. Free users are never included.
- Re-enable Supabase email confirmation in Auth → Providers → Email **before launch** (we disabled for dev).

---

## Critical user rules (DO NOT VIOLATE)

1. **NEVER spend money without explicit per-action user authorization.** This includes creating Supabase Pro projects (the existing `OpenScaffoldLabs` org is on Pro — every new project there costs \~$10/mo). Only use the free `mlav-personal` org for Lock Street. Don't invoke Stripe charges. Don't deploy to paid Vercel.
2. **The** `lockstreet` **Supabase project (ref** `chwijzlynfnxvzfeydtf`**)** lives in the `mlav-personal` **free org** — DO NOT touch projects in `OpenScaffoldLabs`.
3. **Confirm cost before any action that could bill.** Mistakes here have happened and the user is rightly sensitive about it.

---

## How to run locally

```bash
# Once
npm install --include=dev   # NOTE: NODE_ENV may be set to production globally on Windows;
                            # if dev deps aren't installed, force `set NODE_ENV=development`
                            # in cmd before running.

# Dev server
npx vite --host             # http://localhost:5173 (or 5174 if 5173 stuck)

# Re-generate icons (after editing public/favicon.svg)
node scripts/generate-icons.mjs

# Build / preview
npm run build && npm run preview
```

To run `/api/*` routes locally you need `vercel dev` (Vercel CLI). Plain Vite proxies `/api/*` to nothing → expect ECONNREFUSED noise in the terminal until then. Harmless.

---

## Windows-specific gotchas (this machine)

- **OneDrive sync interferes with git locks** (`.git/packed-refs.lock` "File exists" warning on push). Harmless — push usually completes anyway. Clean with: `del /q .git\packed-refs.lock`.
- `NODE_ENV=production` **is set globally** somewhere on this PC. `npm install` skips devDependencies unless you `set NODE_ENV=development` first.
- **PowerShell vs cmd vs DC quoting** — `git commit -m "..."` from the agent's shell tools strips quotes. Use `git commit -F path/to/msg.txt` instead.
- `bash` **is not on PATH** by default; Git for Windows is at `C:\Program Files\Git\cmd\git.exe`. GitHub Desktop has its own minimal git at `C:\Users\Mlav1\AppData\Local\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`.
- **Desktop Commander's** `write_file` **corrupts** `.svg` **files** (writes binary garbage when the extension hints "image"). Workaround: write SVG content via PowerShell `[System.IO.File]::WriteAllText(...)`.
- **Sharp reads SVG from a *path* fine, but rejects in-memory SVG buffers** in some configs. The icon generator script reads from disk for the master SVG.

---

## Cowork-specific gotchas

- **Local MCPs configured via** `claude_desktop_config.json` **are NOT available in Cowork** by default. Desktop Commander needed to be re-added via Claude Code CLI (`claude mcp add --scope user desktop-commander -- npx -y @wonderwhy-er/desktop-commander@latest`) AND requires git-bash on PATH (Git for Windows install).
- **The connected Supabase MCP is scoped to the** `OpenScaffoldLabs` **Pro org**, not the `mlav-personal` free org where Lock Street lives. So MCP-driven SQL/migrations on Lock Street's project won't work — use the dashboard SQL editor (driven via Chrome MCP if needed).
- **Chrome MCP** `resize_window` **resizes the outer Chrome window but not the actual viewport** — can't reliably test mobile breakpoints from inside the agent. Trust the CSS or use real device.
- `form_input` **doesn't always trigger React onChange handlers reliably**. Use `computer.type` after a `left_click` to focus the field; press Enter to submit forms.
- **Supabase requires a real-looking email** for sign-up. `@example.com` is rejected as `email_address_invalid`. `@gmail.com` etc. work. Free-tier Supabase has email-send rate limits (2/hour) which may have been hit during testing — check `over_email_send_rate_limit` errors.

---

## Current state (as of 2026-04-25)

### ✅ Working / done

- Frontend: landing page, /scores (ESPN data + off-season banner), /picks (marketing empty state when no picks), /about (Track Record), /subscribe (3 tiers), /sign-in (custom form), /admin scaffolded.
- Backend (code only — not running until `vercel dev` or deploy): all `/api/*` routes migrated from `@vercel/kv` to Supabase tables.
- Database: 3 tables created in Supabase with RLS.
- Auth: confirmed working via direct API. Email confirmation **disabled** in Auth settings for dev convenience — re-enable before launch.
- PWA: manifest, all icons, iOS meta tags, mobile.css overrides, InstallPrompt component.
- Test admin user: `lockstreet.matt.test@gmail.com` (password `TestLockMatt2026!`) — promoted to admin via SQL.
- VAPID push keys: generated and stored in `.env.local`.
- Odds infra: `api/odds.js` + `api/odds-props.js` server proxies, `/lines` and `/props` consume live data with mock fallback. Needs `ODDS_API_KEY` to go live.
- GitHub: pushed to `main` branch. Latest commit: see `git log`.

### ⚠ Open / next-up

- **Stripe wiring** — need real keys + 3 Price IDs. Subscription flow won't work without them.
- **Odds API key** — sign up at https://the-odds-api.com (free), drop into `ODDS_API_KEY` in Vercel env + `.env.local` for `vercel dev`. Until then `/lines` and `/props` show sample data.
- `SUPABASE_SERVICE_ROLE_KEY` — needed in `.env.local` for `api/stripe-webhook.js` and `api/send-notifications.js` to bypass RLS for server work.
- `vercel dev` — set up to run /api/\* locally (or just deploy and test against deployed URL).
- **Real admin user** — Matt should sign up via the form with his real email; promote that user to admin via the same SQL pattern, then we can delete the test user.
- **First real picks** — once admin can post via /admin, add a test pick to validate the full pipeline.
- **Real on-device PWA test** — `http://192.168.1.119:5174` from an iPhone on the same wifi to confirm install + look. Push notifications need HTTPS so won't work locally — wait for deploy.
- **Mobile app (Step 2 of plan)** — pre-season (July/Aug 2026), build React Native via Expo using "reader app" pattern (subscriptions on web, content viewer on native).

### 📦 Cleanup pending (not urgent)

- \~10 GB locked Claude VM bundle files at `C:\Users\Mlav1\AppData\Roaming\Claude\vm_bundles\claudevm.bundle` — `cleanup_after_quit.ps1` in the Cowork outputs folder removes them after Cowork is fully quit.
- \~10 GB `C:\Windows.old` — user can delete via Disk Cleanup → "Previous Windows installation(s)" (admin required).

---

## Conventions

- Dark theme. Gold accent (`--gold: #fbbf24`). Display font Syne, mono JetBrains Mono.
- All money/cost mentions link to the corresponding pricing tier or webhook event for traceability.
- Disclaimers always include "1-800-GAMBLER" line.
- About page is the credibility anchor — when in doubt about voice, match its tone (concrete, receipt-driven, no overclaiming).
- Pool aliases footnoted on /about so the verifiable receipts (Mlav1114, Lucky Shawn) tie back to the names (Matt, Shawn).
