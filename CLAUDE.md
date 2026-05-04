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
│   │   ├── FeedRoute.jsx         # /feed — community feed (posts + bare picks, Following / All tabs)
│   │   ├── ProfileRoute.jsx      # /profile — own profile + EditProfile modal
│   │   ├── PublicProfileRoute.jsx # /u/:handle — public view of any profile
│   │   ├── FollowRoute.jsx       # /follow — manage following
│   │   ├── LeaderboardRoute.jsx  # /leaderboard — handicapper rankings
│   │   ├── SubscribeRoute.jsx    # /subscribe — Pro page (merged credentials + tiers)
│   │   ├── SignInRoute.jsx       # /sign-in — custom Supabase email/password form
│   │   ├── ResetPasswordRoute.jsx # /reset-password — Supabase recovery flow
│   │   ├── AdminRoute.jsx        # /admin — admin-only pick CRUD + user stats panel
│   │   └── SuccessRoute.jsx      # /success — Stripe redirect target
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── BottomNav.jsx         # mobile-only iOS-style tab bar
│   │   ├── GameCard.jsx
│   │   ├── PostComposer.jsx      # /feed composer (textarea + Include pick + Post)
│   │   ├── PostCard.jsx          # /feed: text post with optional embedded pick
│   │   ├── UserPickCard.jsx      # bare pick row (used in profile + feed)
│   │   ├── MakePickFlow.jsx      # game picker → PickModal flow
│   │   ├── PickModal.jsx         # side / units / read-only line / buy-points
│   │   ├── TeamPicker.jsx        # search-as-you-type team picker (onPointerDown)
│   │   ├── OnboardingProfileModal.jsx # first-time profile setup
│   │   └── InstallPrompt.jsx     # mobile bottom banner; per-platform install UX
│   └── styles/
│       ├── index.css             # base, dark theme, gold accent
│       └── mobile.css            # <=600px overrides
├── supabase/migrations/
│   ├── 20260425_initial_schema.sql
│   ├── 20260428_profiles_and_user_picks.sql
│   ├── 20260428_profile_extras.sql
│   ├── 20260429_admin_list_users.sql       # SECURITY DEFINER RPC bypassing GoTrue
│   ├── 20260429_user_picks_no_delete.sql   # BEFORE DELETE trigger (immutability)
│   └── 20260429_posts.sql                  # /feed composer posts table + RLS
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

- `api/odds.js` proxies game odds (spreads/totals/h2h) for `?sport=nfl|cfb|nba|mlb|nhl`. **24-hour in-memory cache** keyed by sport (off-season + free-tier conservation; bump back to 5-15min once subscribers exist and the season starts).
- `api/odds-props.js` proxies player props per event (markets default `player_pass_yds,player_rush_yds,player_reception_yds,player_anytime_td`). **24-hour cache** per event+market.
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
4. **The project is in test mode. Test data stays.** Test posts, test picks, "Database Test" reasoning text, dummy bets, throwaway notifications, the @lavinlocks "Lock Street Test" posts on /feed — none of it gets cleaned up until Matt explicitly says "we're going live, clean it up." Even when test data looks obviously throwaway (e.g., reasoning text literally says "not real pick"), do NOT delete. Mention it in an audit punch list so Matt knows it's there, but never package it as a "fix" to apply. If you find yourself writing a `delete from public.picks`, `delete from public.user_picks`, `delete from public.posts`, or `delete from public.bets` in any cleanup script — STOP. Reread this rule. The data is real to Matt even when it looks like noise.

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

- **Repo lives at `C:\dev\lockstreet`.** Was previously at `C:\Users\Mlav1\OneDrive\Documents\GitHub\lockstreet` until 2026-04-27 when OneDrive sync corrupted file writes mid-session (see lessons-learned). NEVER move it back under any OneDrive folder. If a future session shows the repo at an OneDrive path, the user has been re-trapped — pause and ask before doing any git work.
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

## Current state (as of 2026-05-03 — end of day)

### May-3 session adds (most recent first, latest commit on main)

- **Header search now finds teams too.** `HeaderUserSearch.jsx` lazily loads `teamsCatalog.js` on first panel-open and filters client-side; results render in two labeled sections (`TEAMS` then `PEOPLE`). Match priority for teams: exact abbr > abbr-starts-with > name-contains > shortName-contains. Click → `/team/<league>/<id>` (the existing TeamRoute). Enter key picks the first result regardless of section. Placeholder updated to "Search teams or handles…".

- **Notification fan-out actually works now.** Pre-existing duplicate `const body` in `notifyFollower` (api/send-notifications.js) was a SyntaxError that took down ALL ops on the endpoint at module-load time — Vercel returned `FUNCTION_INVOCATION_FAILED` (text/plain), the frontend's best-effort .catch swallowed it, and **no comment / tail / fade / follower notifications had ever fired** since the comments + tail/fade ship the day before. Renamed the request-body variable to `reqBody` (commit `dd3bab4`); verified end-to-end via live Chrome MCP probe — all four ops now return clean JSON.

- **Auth + seeding live walkthrough completed.** Verified sign-in / session persistence / token refresh setup / admin role gating / sanitizeNext open-redirect defense (3-of-3 attack vectors blocked: `https://evil.example`, `//evil.example`, `javascript:`, with legitimate `/picks` allowed) / picks API gating (POST returns 403 to non-admin) / bearer() bouncing junk + empty tokens. The notify-endpoint failure was the only real bug surfaced.

- **Partner brief deliverable.** `Lock_Street_Partner_Brief.docx` at the repo root, generated via `scripts/generate-partner-brief.js` (docx-js). Frames Lock Street as a free fan app + Twitter-for-bettors social network, with two revenue streams: Matt + Shawn's own picks subscription (stream 1) and the creator marketplace where independent handicappers run their own paid tiers and Lock Street takes a rev-share (stream 2 — the scale play). Re-run the generator any time copy changes:
  ```
  cmd /c gen-brief.bat       # or: node scripts/generate-partner-brief.cjs
  ```

---

## Current state (as of 2026-04-30 — end of day)

### Apr-30 session adds (most recent first, latest commit on main)

- **Comments + tail/fade — full social engagement layer.**
  - New tables: `public.comments` (flat, polymorphic post_id/pick_id, soft-delete only, immutability trigger mirroring posts/user_picks pattern) and `public.pick_actions` (one row per user+pick, action ∈ {tail,fade}, locked at kickoff via trigger). Both realtime-enabled.
  - Hooks: `useComments({postId|pickId})` with realtime subscription + softDelete; `usePickActions(pickId, viewerUserId)` with toggle/clear.
  - Components: `CommentThread.jsx` (collapse/expand, composer with Cmd-Enter, soft-delete by author); `TailFadeButtons.jsx` (pill buttons with live counts, locks visibly at kickoff). Wired into `PostCard` (thread on the post itself; embedded UserPickCard suppresses its own thread to avoid duplicate conversations) and `UserPickCard` (thread + tail/fade rendered everywhere it appears).
  - Notifications fan-out: `?op=notify-comment` and `?op=notify-pick-action` multiplexed into existing `api/send-notifications.js`. Author-only delivery, self-action skipped server-side, anti-spoof verifies the action row matches before persisting. Per-event push (no batching at delivery).
  - Inbox grouping in `NotificationsSection.jsx`: same-(type, target) runs of >5 collapse into a single grouped row that expands inline. ≤5 still render individually.
  - Migration files: `20260430_comments_and_pick_actions.sql` + `20260430_notifications_extend_types.sql`. Production paste-ready: `COMMENTS_PICK_ACTIONS_2026-04-30.sql`. Plus a separate `notifications` table create block (the original `20260429_notifications.sql` had never been applied to production — discovered 2026-04-30 evening when @lavinlocks tail/comment notifications weren't reaching followers).

- **CLAUDE.md rule #4 — test data stays.** Added after the BOS -7.5 near-miss where the audit recommended deleting it for having "Database Test, not real pick" reasoning text — that pick is real, the reasoning was just throwaway dev typing. Lock Street is in test mode; nothing in `picks` / `user_picks` / `posts` / `bets` gets deleted until Matt explicitly says we're going live.

- **Fixed iPhone profile rendering.** Two separate bugs: (1) the global `.tabs { display: none }` on mobile hid `.pf-picks-tabs`, `.pf-window-tabs`, `.pf-sport-tabs`, and `.pm-bet-tabs` — added explicit `display: flex` overrides matching the existing `.feed-tabs.tabs` pattern. (2) Earlier in the day I shipped a naive `prefers-reduced-motion` rule that overrode `animation-duration: 0.01ms !important` — on iPhones with Reduce Motion enabled this stuck `.about-block` and other entrance-animated elements at `opacity: 0`. Reverted the media query AND removed the `opacity: 0; animation: fadeup forwards` initial state from `.about-block` so the resting visible state isn't gated on animation completion. Lesson: never make content's visible state depend on an entrance animation firing — too fragile across iOS settings.

- **Bottom-nav legibility.** Inactive items swapped from `--ink-faint` (#5a4f6f, dim gray-purple, hard to read in daylight) to `--ink` (near-white). Active state still differentiates via `--gold` + the purple drop-shadow.

- **Audit + 60-minute quick-wins shipped (commit `d3939eb`).**
  - User-visible: stripped `~` from headline stats / pricing copy (Syne renders the tilde as a hyphen so "~65%" looked like "-65%"); stripped Warren Buffett attribution from index.html meta description; refactored `/weekly` body to render proper `<ul>` bullets instead of inline dashes; surgical Supabase error suppression on `/contest` so the schema-cache string doesn't leak; `/leaderboard` "/scores" empty-state turned into a real Link.
  - Hardening: root `<ErrorBoundary>` wrapping `<Routes>`; `vite.config.js` gates `sourcemap` on `NODE_ENV`; `aria-label="Lock Street home"` on the header brand; `/game/:league/:gameId` polling caps at 5 consecutive failures; `/sign-in?next=` validates same-origin (closes open-redirect); `bearer()` rejects empty / malformed tokens at `api/_utils.js`; `create-checkout-session` looks up the customer email server-side from `auth.users` instead of trusting `body.email`.
  - Hook fixes: `useSubscription` deps include `getToken`; `PushPromptModal` swallowed enable() errors → now toast on failure; `PostCard` pin button stops propagation.

- **Audit deliverable.** `AUDIT_2026-04-29.md` at the repo root — full 343-line punch list grouped Critical / High / Medium / Polish / Improvement-suggestions. Many items still open (Stripe wiring, profile bio fix, C2 `##1` rank badge, C3 closed-pick final scores, etc.) — see file for the prioritized list.

### Apr-30 deferred / known-open

- **Stripe wiring.** Still the single biggest open gap. Need real keys + 3 Price IDs from Stripe Dashboard + webhook secret in Vercel env. ~30 min once started.
- **Profile bio.** @lavinlocks bio still reads "Sub-creator of the lavinlock, CEO of Lock Street." — fix via `/profile → Edit Profile`.
- **Push delivery for tail/fade + comments.** Server-side fan-out is wired. Verified with friend's account that no push arrives unless the recipient has a row in `public.push_subscriptions` (i.e., they've granted browser notification permission on at least one device). If a future user reports "no push" check `push_subscriptions` first before debugging server-side.
- **Email verification gate.** The `verified` check in `CommentThread.jsx → Composer` is intentionally permissive client-side because Supabase email confirmation is disabled in dev. Re-enable confirmation in Supabase Auth before launch and the gate kicks in automatically.
- **Known scratch-files mess at repo root.** ~250 `.bat` / `.vbs` / `.commit-*.txt` files from this session's commit-via-Desktop-Commander pattern. Added matching globs to `.gitignore` so they stop showing as untracked.

---

## Current state (as of 2026-04-29 — late session)

### Late Apr-29 session adds (most recent first, latest commit `b021d4c`)

- **Game detail series banner above header** + **inline series tally removed from inside `.gd-status`**. The banner is now the single source of truth for "Series tied 2-2" / "TOR leads 3-1" on a playoff game. `/scores` GameCard intentionally untouched — series tally still renders inside the card per Matt's instruction.
- **Spread/O-U/ML pills** render below the team header on `/game/:league/:gameId` with router-state fallback (`useLocation().state.game`) so pills are instant when arriving from `/scores`. ESPN summary odds extraction now reads `json.pickcenter[0]` first (where summary actually puts them), falls back to `comp.odds[0]`.
- **ESPN summary series array unwrap**: ESPN returns multiple series objects per matchup (regular-season head-to-head + active playoff). Extractor in `src/lib/espnSummary.js` now prefers `type === 'playoff'`, falls back to incomplete series, then to `[0]`. Naive `[0]` was picking the regular-season tally and showing wrong "TOR wins series 3-0" on a playoff game.
- **PullToRefresh** iOS-style overlay component at `src/components/PullToRefresh.jsx` — wraps the app shell so PWA users get native-feeling refresh in iOS standalone mode (where browser PTR is disabled).
- **HeaderUserSearch** (`src/components/HeaderUserSearch.jsx`) — magnifying glass icon in header opens a dropdown that searches profiles by handle/display_name. Mobile font bumped to 16px to dodge iOS auto-zoom.
- **Notifications inbox** (`src/components/NotificationsSection.jsx`) — table `notifications` (migration `20260429_notifications.sql`), persisted via `/api/send-notifications?op=notify-follower`. Inbox shows new-follower events with a "Follow Back" inline button. Push fan-out wraps the same call.
- **Creator account (@lavinlocks)** (migration `20260429_creator_and_pinned.sql`):
  - Auto-follow on signup (trigger fires on `auth.users` insert; backfilled for existing users).
  - Unfollow blocked at the RLS layer for the creator only.
  - Pinned posts — `posts.is_pinned bool` + `pinned_at`. Only Matt's user_id can flip the flag (RLS check). Pinned posts float to top of `/feed`. Pin button + PINNED badge in `PostCard.jsx`.
- **BottomNav order** (`src/components/BottomNav.jsx`): Profile · Feed · Scores · Lines · Picks · Heat Check · Pro. Profile is leftmost as the user's home base; Feed sits next to keep the social loop near home.
- **Follows hook** (`src/hooks/useFollows.js`) — replaced PostgREST embed across the auth schema (which silently returns 0 rows because PostgREST can't traverse `auth.*`) with a two-step query: fetch follows → fetch profiles → join in JS. This is the canonical fix; if any future feature wants to embed across `auth`, do the two-step.
- **TeamPicker iOS fix** (`src/components/TeamPicker.jsx`) — `onPointerDown` instead of `onClick` for row taps (iOS Safari was canceling synthesized clicks under scroll-disambiguation). Also `position: static` on mobile so the dropdown floats above the keyboard.
- **Profile auto-follow on insert** (`src/hooks/useProfile.js`) — newly-created profiles auto-follow @lavinlocks via the trigger above; the hook also exposes `isCreator` and `setMyPrivacy`.
- **Renamed leaderboard column** `window` → `win_period` (Postgres reserved word).

### Deferred (next session)

- Wire admin auto-mirror for free picks.
- Pick-graded notification type + free-pick-drop notification fan-out.
- Last 10 ATS for game-detail preview cards (still `—`; needs DB-side closing-line capture before computing).

---

## Current state (earlier-Apr-29 baseline)

### ✅ Working / done

- **Deployed live: https://lockstreet.vercel.app** (Vercel Hobby, free).
- Frontend routes: `/` (Buffett hero landing), `/scores`, `/picks`, `/feed`, `/profile`, `/u/:handle`, `/follow`, `/subscribe` (Pro page — merged credentials + pricing), `/sign-in`, `/admin`, `/lines`, `/props`, `/contest`, `/leaderboard`, `/weekly`, `/game/:league/:gameId`, `/team/:league/:teamId`. `/about` and `/record` redirect to `/subscribe`. `/bankroll` redirects to `/profile`.
- Year-round support: ESPN integration covers NFL/CFB/MLB/NBA/NHL. `/scores` filters for all 5. GamePicker supports date-driven sports.
- **Brand & typography (Apr 27 update):**
  - Pure black background, neon purple primary `#c084fc` (kept as `--gold` token for backward compat), neon **green** `#4ade80` (variable still named `--orange` so existing rules unchanged).
  - Display font Inter app-wide, **Syne reserved** for `.hdr`, `/` (home), `/about`, `/subscribe` via `.route-syne` wrapper class.
  - Custom `@font-face` `InterNum` with `unicode-range` for digits + math symbols overrides Syne in those scopes — numbers always render Inter for clean alignment.
  - Team abbreviations (`.tabbr`, `.orb`) explicitly use `var(--syne-stack)` so "BOS" / "NYK" stays Syne even on Inter pages.
  - JetBrains Mono removed entirely. `--mono` aliased to Inter.
  - Header simplified: no 61% ATS badge, no Buffett tagline, no Admin button (admin reaches `/admin` via direct URL or bottom nav). Brand is uppercase, weight 900, 44px desktop / 22px mobile.
- Database tables (Supabase + RLS): picks, subscriptions, push_subscriptions, bets, contests, contest_entries, contest_picks, consensus_picks.
  - Picks table now has matchup snapshot columns: `home_abbr`, `away_abbr`, `home_logo`, `away_logo`, `spread_home`, `total_taken`, `ml_home`, `ml_away`, plus `graded_at` (used by Closed-tab 6-day TTL). Migration `20260427_picks_team_and_lines.sql`.
- Auth: real admin (`mlav1114@aol.com`) promoted, test admin retired. Email confirmation re-enabled. Site URL set to `https://lockstreet.vercel.app`.
- PWA: manifest, regenerated icons (L white / S purple / purple border, pure black bg). Push notifications **end-to-end verified** (admin → /api/send-notifications → device).
- Push test panel on `/admin`: enable push on this device + send test broadcast to all devices.
- All env vars set in Vercel.
- GitHub Actions cron `refresh-consensus.yml` runs daily 8am ET → `consensus_picks` table → `/lines` row.
- **Game detail page (`/game/:league/:gameId`):**
  - Team logos in header (with purple drop-shadow).
  - Live status box shows clock (`Q3 · 5:24` for NBA/NFL/CFB, `P2 · 5:24` for NHL, `Top 7th` for MLB) — never the date when game is live.
  - Side-by-side team preview cards (Last 10 SU, Off Rank, Def Rank with stat value sub-line, Injuries list).
  - Last 5 ATS still placeholder `—` (no free historical-odds source).
  - Live Play Tracker section sits between header and team preview when `status === 'live'`. Renders last 15 plays with scoring-play green highlight. Powered by `data.recentPlays` from ESPN summary; works for NBA/NHL/MLB and football (drives → plays).
  - Top Fantasy Performers + per-team player tables below (live or final).
  - 30s polling for live games.
- **`/api/team-intel` proxy** — sport-specific free APIs, server-side cache 6h:
  - **NBA**: ESPN bulk fetch — pulls all 30 teams' completed regular + postseason schedules, computes off rank (PPG), def rank (Opp PPG), Last 10 SU. `stats.nba.com` blocks Vercel/AWS data centers, hence the bulk-via-ESPN approach.
  - **MLB**: `statsapi.mlb.com` (official). Standings → last 10 + record. `/teams/stats?stats=season&group=hitting&sportIds=1` for league-wide rank computation.
  - **NHL**: `api-web.nhle.com/v1/standings/now` (single call returns all 32 teams, l10Wins/Losses/OtLosses, GF/GA/games for ranks).
  - **NFL/CFB**: ESPN team-stats + schedule. Last 10 from completed events.
  - Score values come back as `{value, displayValue}` objects on schedule events — extractor pulls `.value`. ESPN summary's `header.status.type.state` can be empty on MLB; falls back to `competitions[0].status` and `completed`.
- **`/picks` page (Apr 27):**
  - Search bar + filter button rows replaced with **Open / Closed tabs** + counts.
  - Open = `result === 'pending'`. Closed = graded picks within last 6 days (`Date.now() - graded_at < 6d`); after that they auto-drop.
  - Win/Loss/Push badges on closed pick cards.
  - Pick block hides entirely when no pick on a game (no "No pick on this game" placeholder).
  - "Lock Street **Free** Pick" label on `visibility === 'public'` picks.
  - Cards self-contained: render team logos and SPREAD/O/U/ML pills from snapshot columns even after ESPN scoreboard rolls past the game.
  - SystemInfoBanner at top: "NFL, College Football, College Basketball" + "We don't post picks we aren't taking ourselves." Football off-season countdown shown when applicable.
- **`/scores` All view groups by sport** with single league badge per group. Order: NBA → NHL → MLB → NFL → CFB. Empty leagues hidden. Per-card league badge suppressed when grouped via `hideLeagueBadge` prop on `GameCard`.
- Date tab on `/scores`: ◀ / ▶ ±7 days. Today/Tomorrow/Yesterday inline labels (no separate pills). Sits flush below the header.
- Centered ambient halo via `.bg-halo` fixed-position div (z-index 1, below header z-50). Visible on every page. Corner accent gradients still on body.
- Mobile-only fix: `.hdr` is `position: fixed` (sticky was failing on iOS Safari w/ safe-area-inset). Header swallows the notch via its own `padding-top: env(safe-area-inset-top)`. `.wrap` top-padding compensates. Desktop keeps `position: sticky`.
- Removed: `/parlay`.
- **Profile / public profile (Apr 29):** `/profile` (own) + `/u/:handle` (public). Edit Profile modal, fav-team picker. TeamPicker uses `onPointerDown` (not `onClick`) to dodge iOS Safari click-cancellation — taps on team rows kept being canceled even with `touch-action: manipulation`. Pointer events fire synchronously and aren't subject to iOS's gesture disambiguation.
- **Admin User Stats panel (Apr 29):** `/admin` shows total users, verified/unverified, active subs by tier, push device count, recent signups. Reads via SECURITY DEFINER RPC `public.admin_list_users()` instead of `supabase.auth.admin.listUsers()` — GoTrue's deserializer chokes on the synthetic `@lockstreet` row in `auth.users` because that row was manually inserted by the profiles migration without all fields newer GoTrue versions require. Migration `20260429_admin_list_users.sql`.
- **Pro page (`/subscribe`)** is now the merged Pro+Record page: hero → track-record chart → three #1 finishes → what you get → how we make picks → pricing tiers. Old `/about` and `/record` URLs redirect here. `AboutRoute.jsx` and `RecordRoute.jsx` deleted.
- **Feed page (`/feed`)** with Following / All tabs:
  - Tagline: "Live picks from the community. Locked at kickoff, graded automatically, never deleted."
  - Composer at top — textarea (280-char) + "+ Include pick" button + Post button. Signed-out shows a sign-in CTA instead.
  - "Include pick" opens existing `MakePickFlow`; the locked pick gets attached. Submit cases:
    - Body empty + pick attached → no posts row, just the bare pick (already in user_picks).
    - Body present (any pick) → posts row inserted with `pick_id` if attached.
    - Body present, no pick → text-only post.
  - Feed merges latest 50 posts (with embedded pick joined inline) + latest 50 user_picks NOT referenced by any post (dedup), sorted by `created_at` desc. Subscribes to realtime INSERTs on both tables.
  - **CRITICAL:** PostComposer wrapper is `<div>` + onClick submit, NOT `<form>` + onSubmit. PickModal is itself a `<form>`, so wrapping the composer in a `<form>` causes the inner pick-submit event to bubble up the DOM and race-trigger the composer's submit. That race ate every post-with-pick attempt — silently. See lessons learned.
- **`posts` table (Apr 29):** `id, user_id, body (1..280), pick_id (nullable FK), created_at`. RLS: public reads non-private (mirrors picks privacy), authenticated users insert their own, no UPDATE/DELETE policies. BEFORE UPDATE + BEFORE DELETE triggers reject every non-`service_role` mutation. Same immutability model as `user_picks` — receipts are permanent. Migration `20260429_posts.sql`.
- **`user_picks` immutability hardened (Apr 29):** added BEFORE DELETE trigger `user_picks_no_client_delete` mirroring the existing BEFORE UPDATE trigger. RLS already blocks deletes (no policy), this is defense-in-depth in case a future migration accidentally adds one. Migration `20260429_user_picks_no_delete.sql`. Service role can still delete (admin cleanup carve-out).
- **Line lock on PickModal (Apr 29):** "Line you took" input replaced with read-only consensus display. Users can't fudge a softer line — only sanctioned way to shift it is the buy-half-points stepper (with proper juice penalty). Keeps the leaderboard honest.
- **Consensus line auto-fetch in PickModal (Apr 29):** if caller doesn't supply `game.consensus`, PickModal hits `/api/team-intel?op=public-betting&league=<league>` and matches by team abbrs as a fallback. **Primary path** is `MakePickFlow` parsing ESPN's `odds.details` ("DET -10.5", "EVEN", "PK") into a home-perspective spread number — ESPN returns lines on basically every upcoming game with no extra fetch.
- **Header desktop nav (Apr 29):** dropped "Track Record" tab, renamed "Subscribe" → "Pro", added "Feed". BottomNav: dropped Record, added Feed.
- **Admin can't delete picks via API (Apr 29):** the BEFORE DELETE trigger on user_picks rejects all non-service-role deletes. The composer's nested-form fix kept this from being a real concern, but it's also now structurally enforced.

### ⚠ Open / next-up

- **Stripe wiring** — biggest gap. Need real keys + 3 Price IDs from Stripe Dashboard, plus webhook secret. Subscribe button currently does nothing without them. ~30 min once started.
- **Last 10 ATS** for game-detail preview cards — currently `—` everywhere. Only free path is DIY: persist closing lines per game in our DB (we already pull from the-odds-api in season), then compute ATS from final scores at view time. Half-day project.
- **PWA cache invalidation** — iOS aggressively caches PWA bundles. After any code change Matt must remove + re-add the home-screen icon (or hard-refresh in Safari first). Discovered the hard way Apr 27.
- **NBA Stats API blocked from Vercel** — `stats.nba.com` times out from data-center IPs. We compute NBA ranks/last-10 by bulk-fetching all 30 teams' ESPN schedules instead. If we ever upgrade to a paid sports data API (SportsDataIO, etc.), this gets simpler.
- **Mobile app (Step 2)** — pre-season (Jul/Aug 2026), build React Native via Expo using reader-app pattern.

### 📦 Cleanup pending (not urgent)

- \~10 GB locked Claude VM bundle files at `C:\Users\Mlav1\AppData\Roaming\Claude\vm_bundles\claudevm.bundle` — `cleanup_after_quit.ps1` in the Cowork outputs folder removes them after Cowork is fully quit.
- \~10 GB `C:\Windows.old` — user can delete via Disk Cleanup → "Previous Windows installation(s)" (admin required).

---

## Conventions

- Pure black background (`--bg: #000000`). Neon purple primary (`--gold: #c084fc` — variable kept as `--gold` for backward compat, value is purple). Neon **green** secondary accent (`--orange: #4ade80` — variable kept as `--orange` for backward compat, value is green) for stat numbers / eyebrows / hero / league badges. Display font Inter app-wide; Syne reserved for header + home + about + subscribe via `.route-syne`. Custom `InterNum` `@font-face` overrides digits to Inter inside Syne scopes. Team abbreviations (`.tabbr`, `.orb`) explicitly opt back into Syne. All borders purple. Scrollbars hidden globally.
- **Slogan:** "Be fearful when others are greedy. Be greedy when others are fearful." — appears on home hero only (no attribution; quotation marks alone suffice). Removed from header + footer.
- "Two generations. One system." opens the `/subscribe` Pro page — that's the Matt+Shawn brand narrative line.
- **Sports we post picks for: NFL, College Football, College Basketball.** Other sports tracked via `/scores`/`/lines`/etc. but no official picks. Reinforced via SystemInfoBanner on `/picks`.
- All money/cost mentions link to the corresponding pricing tier or webhook event for traceability.
- Disclaimers always include "1-800-GAMBLER" line.
- `/subscribe` (Pro page) is the credibility anchor — when in doubt about voice, match its tone (concrete, receipt-driven, no overclaiming). The track-record cards still reference Matt and Shawn by first name; the hero establishes the father/son frame.
- Pool aliases (Mlav1114, Lucky Shawn) tie back to the names in `/subscribe`'s track-record block.
- **Posts and picks are permanent.** UI promises "never deleted"; DB enforces via missing UPDATE/DELETE RLS policies + BEFORE UPDATE/DELETE triggers on both `user_picks` and `posts`. Service role is the only thing that can ever modify a row — used by the grading job to write `result` and `graded_at` on picks. If you ever need to add admin-side deletion (banned-user cleanup, etc.), do it via `service_role` from a server endpoint, never expose a delete policy to `authenticated`.

## Lessons learned (don't repeat these mistakes)

- **Vercel SILENTLY drops functions over an undocumented per-function source-size threshold (May 2026 incident).** Vercel Hobby has a documented 12-function cap, but ALSO an undocumented per-function size threshold that can change without notice. The May 3 incident: deploys went from "All (12)" functions to "All (10)" with no build error, no warning, no platform changelog — Vercel's build status stayed "Ready" but `team-intel.js` (807 lines) and `refresh-public-betting.js` (519 lines) were silently omitted from the routing table. /lines and /heat-check both 404'd. The GitHub Actions cron pounded a 404 endpoint for 18+ hours, returning curl exit 0 (because 404 is a valid HTTP response, not a network error). **Mitigations now in place:** (a) split the two large files into multiple `_*.js` helpers via imports — main router files now ~90-180 lines each; (b) `.github/workflows/health-probe.yml` runs every 10 min, probes every `api/*.js` source file against production, fails red if any returns 404 — this would have caught the original incident in 10 minutes instead of days; (c) workflow can optionally trigger Vercel redeploy via deploy-hook secret + push notification via existing send-notifications. **Rule for the next session:** if you add a new file to `api/`, keep it under ~400 lines; if a router endpoint grows, extract handlers into `_*.js` siblings. After every deploy, the health-probe workflow MUST go green before declaring shipped.
- **Vercel deployment "Ready" status does not mean all functions deployed.** The Functions panel can show fewer entries than `api/*.js` source count and the build will still succeed. Always verify by counting on Deployments → [latest] → Deployment Summary → Functions.
- **GitHub Actions cron returns success on a 404.** Workflows using `curl` exit 0 on any HTTP response, including 404s. If you want a workflow to fail when an endpoint is missing, you must explicitly check the status code: `status=$(curl -s -o /dev/null -w "%{http_code}" $URL)` then `[ "$status" = "404" ] && exit 1`. The pattern is in `.github/workflows/health-probe.yml`.
- **PowerShell `Out-File` / `Add-Content` can write null bytes when handling certain unicode chars.** This breaks Vercel function bundling silently. Symptom: deploy is "Ready", function 404s. Fix: use `[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)`. The May 4 `f7ed29c` "fix: strip null bytes" commit was a real session burner — investigate file encoding via `head -c 8 file | xxd` if a freshly-pushed function is unexpectedly 404.
- **Public-facing `/lines` empty-state copy must not mention "scraper" or any data source.** The original copy said "No games scraped... The scraper runs every ~10 min during peak windows." That violated the existing rule against exposing source-attribution to users. Fixed in `510c7b1`. Audit before shipping any new empty-state, error message, or footnote: it must read like neutral product copy, never like internal architecture.
- **PWA + Vercel cache compounds.** When iterating on UI, the deployed bundle can be live but the user's PWA / browser still serves the old one for hours. ALWAYS verify via Chrome DevTools `read_page`/`javascript_tool` against `lockstreet.vercel.app` before assuming a styling issue is real — half a session got eaten chasing a "wrap to second line" bug that was actually stale cache showing the old 61% badge + tagline.
- **Cowork dedupes user-scope MCP servers by `serverInfo.name`.** Adding a second Supabase MCP via `claude mcp add` won't surface its tools because the built-in connector already claims `"supabase"`. Workaround: hit Supabase Management API directly via `Invoke-RestMethod` with the PAT stored in `~/.claude.json`.
- **Score values on ESPN schedule events come back as `{value, displayValue}` objects**, not plain numbers. `Number(comp.score)` returns NaN. Use `Number(comp.score?.value ?? comp.score?.displayValue ?? comp.score)`.
- **`stats.nba.com` blocks Vercel/AWS.** The User-Agent dance won't save you — data-center IPs are blocked at network level. Compute NBA ranks via ESPN bulk fetch instead.
- **iOS Safari `position: sticky` breaks under `safe-area-inset-top` body padding.** Switch to `position: fixed` on mobile and route the safe-area handling through the header itself.
- **Vite-bundled deferred tools take time to surface.** The `/api/team-intel` proxy needs a fresh function cold-start to load; subsequent requests hit the 6h in-memory cache and are fast.
- **Vercel Hobby 12-function cap — count BEFORE you `Write` a new endpoint.** Files in `api/` whose names DON'T start with `_` count as serverless functions; helpers like `_utils.js` / `_email.js` don't. As of Apr 27 we're at the cap (12 functions). Before creating a new file, run `ls api/*.js | grep -v "/_"` and count. If you're at 12, **multiplex** into an existing endpoint via `?op=` query switch. Pattern already used: `team-intel.js?op=intel|news|schedule`, `refresh-public-betting.js?job=public-betting|consensus`. The `team-intel` endpoint is the natural home for any other lightweight read-only sports data; the `refresh-public-betting` endpoint is the natural home for any new cron job. Don't ship a new file without checking.
- **Desktop Commander's `start_process` kills any spawned process at ~2.85 seconds REGARDLESS of `timeout_ms`.** This silently truncates anything longer — git pushes, multi-step PowerShell scripts, network calls. Symptom: `runtime: 2.79s` and 0 lines of output even though the script was clearly going to take longer. Workaround: write a `.bat` file that does the work + writes a `done.txt` flag at the end, kick it off with `cmd.exe /c path\to\file.bat`, then `sleep` in a workspace bash call and read the output files. The .bat detaches from the parent and survives.
- **Workspace bash CAN'T `git push` (no GitHub creds in the Linux mount).** Push fails with `could not read Username for 'https://github.com': No such device or address`. Pattern: stage + commit from workspace bash (faster), then push via Windows .bat through Desktop Commander. Or just do everything via .bat if you need OS-level reliability.
- **OneDrive disaster (RESOLVED 2026-04-27 by moving repo to `C:\dev\lockstreet`).** Historical context — what to watch for if the user ever clones into OneDrive again: the repo USED to live at `C:\Users\Mlav1\OneDrive\Documents\GitHub\lockstreet` (Microsoft auto-folded `Documents` under OneDrive without asking). Symptoms accumulated: (1) `.git/HEAD.lock` and `.git/index.lock` "Operation not permitted" warnings on every commit; (2) ~8 unrelated source files showed as `M` in `git status` due to OneDrive flipping CRLF↔LF on resync; (3) Cowork's Linux mount lagged the Windows view by 4+ minutes — `wc -l` from workspace bash showed `1274 lines truncated mid-rule` while the Windows-side Read tool showed the full `1308 lines`; (4) `sed -i 's/\r$//'` on the OneDrive-mounted file silently truncated 4 lines off the end mid-write because OneDrive held the file open during the rewrite, breaking PostCSS at build time on Vercel and forcing an emergency restore commit. The combined effect ate ~30 min of session time chasing phantom bugs. Move-out cure: `mkdir C:\dev && cd C:\dev && git clone <url>` outside any synced folder. **Future detection rule:** if you see "Operation not permitted" on `.git/*.lock` files, OR `git status` shows files modified that you never touched, OR `wc -l` from workspace bash disagrees with the Windows-side Read tool — STOP, alert the user, and verify the repo isn't back inside an OneDrive/Dropbox/iCloud root before continuing.
- **`sed -i` on a synced-folder file truncates silently when the sync watcher holds the file open mid-write.** Even outside OneDrive this can bite if a Dropbox/iCloud watcher is on the path. Always `wc -l` BEFORE and AFTER any `sed -i` and abort if the line count moved unexpectedly. Or pipe through a temp: `sed ... > /tmp/x && cp /tmp/x file`.
- **Trust the Windows-side `Read` tool over the Linux mount when in doubt.** When working on a Windows-OneDrive repo, the Windows view is canonical; the Linux mount can be 1-5 minutes behind. Verify file tails via `Read` with an explicit line range before staging anything for commit. Even better: avoid the situation by keeping the repo OUT of any cloud-synced folder.
- **PowerShell `Out-File` defaults to UTF-16 LE.** Reading those files later shows characters with spaces between every letter (`R o w s   i n`). Always pass `-Encoding utf8`. Also applies to `Add-Content`. If you forget on a one-off probe script and see garbled output, that's the cause.
- **ScoresAndOdds slugs are NOT a reliable home/away indicator.** Slug like `blue-jays-vs-red-sox` doesn't always mean Blue Jays away — SAO sometimes inverts. Trust the page's `trend-graph-sides` left/right pair: SAO renders LEFT = away, RIGHT = home (verified for NBA/NHL/MLB by cross-checking ESPN schedules). The percentage-a/percentage-b alignment confirms (a=left=away, b=right=home).
- **SAO `home-current-trends` / `away-current-trends` is a decorator class, not a section wrapper.** It appears 4+ times each on a page (once per data-attribute hook). A regex like `class="main ${label}"...</table>` won't bound the team's trend table because the table doesn't end with `</table>` near the anchor. Correct approach: find the FIRST `indexOf(anchor)` and scan forward in the HTML for the next `<tr ...><td>Last 10 Games</td></tr>` row — that row belongs to that team. Verified on NHL/MLB/NBA: away anchor comes first on the page, home anchor second.
- **NEVER expose data-source attribution in user-visible UI.** Strings like "via ScoresAndOdds", "scraped from public sportsbook trend pages", "powered by VSiN", "live ScoresAndOdds data" — none of these belong on a customer-facing page. Subscribers paying $250/mo for picks shouldn't be told "we just scrape SAO." Use neutral phrasing: "public betting splits", "live lines", "publicly available data." Comments inside source files (`/** /lines — pure ScoresAndOdds data */`) are fine because they're invisible to users — but anything inside JSX, alt text, aria-label, footer disclaimer, header subtitle, stat box `sub` prop, or any other rendered string is OFF LIMITS for source attribution. **Audit rule: before shipping, grep `src/` for the names of any external services we hit (`ScoresAndOdds`, `VSiN`, `the-odds-api`, `ESPN`, `NewsData`, etc.) and verify every hit is inside a `/* */` or `//` comment, never inside a string literal that ends up rendered.**
- **Nested `<form>` tags cause submit-event races in React.** PostComposer was a `<form onSubmit={submit}>` and rendered MakePickFlow inside, which itself renders PickModal as another `<form onSubmit={submit}>`. When the user clicked "Lock pick" inside the inner form, the submit event bubbled up the DOM and fired the OUTER composer's submit handler too — but with stale state (pick was still `null` because React hadn't applied `setPick` from the inner success handler yet). That race silently ate every post-with-pick attempt: body got cleared, pick was lost, no row landed in `posts`, and the user saw "nothing happened." **Rule: if a child component might render its own `<form>`, the parent MUST be a `<div>`, with the submit button as `type="button" onClick={submit}`.** Browsers don't error on nested forms in JS-built DOM (HTML5 parser would strip them, but `document.createElement` doesn't), so this is the kind of bug that survives all the way to production.
- **iOS Safari cancels `onClick` on synthesized clicks under various gesture conditions.** TeamPicker's row buttons used `onClick`, and iOS would cancel the click whenever it interpreted the tap as a scroll-start or a "double tap to zoom" disambiguation. Symptoms: row visually highlights, dropdown closes, but selection never propagates to state. `touch-action: manipulation` helps but isn't sufficient. **Bulletproof fix: use `onPointerDown` with `e.preventDefault()` + `e.stopPropagation()`.** Pointer events fire synchronously and aren't subject to iOS's click-cancellation logic. Keep `onClick` as a fallback for keyboard/assistive-tech (`if (e.detail === 0) ...`). Same pattern works for any tappable list item where the dropdown closes on outside-click.
- **GoTrue's admin `listUsers()` chokes on auth.users rows missing fields newer GoTrue versions added.** Lock Street's profiles migration (`20260428_profiles_and_user_picks.sql`) manually inserts a synthetic `@lockstreet` user into `auth.users` so the public free pick can compete on the leaderboard. That insert specifies a subset of columns; over time GoTrue has added required fields like `is_anonymous`, `is_sso_user`, etc. that default to NULL on the synthetic row. When `supabase.auth.admin.listUsers()` iterates rows, it deserializes every one through GoTrue's User struct and bails on the synthetic row with the generic "Database error finding user." The Supabase Dashboard reads `auth.users` directly via SQL and works fine, so the bug only surfaces from the JS admin SDK. **Workaround: bypass GoTrue for any user-listing endpoint.** Define a `SECURITY DEFINER` Postgres function in `public` that selects from `auth.users` and exposes only the columns you need; call it via `supabase.rpc()`. Pattern in `supabase/migrations/20260429_admin_list_users.sql`. The same fix inoculates any future admin-surface code that would otherwise call `listUsers`.
- **Posts/picks privacy needs an owner-fallback in the SELECT RLS policy.** The user_picks SELECT policy correctly has `auth.uid() = user_id OR (not exists … is_private)` — owner always sees own. The first cut of the posts policy didn't, which would have hidden private users' own posts from themselves. Fixed before shipping but worth remembering: every policy that filters by `profiles.is_private` must include the owner-fallback OR the user's own data disappears from their own UI.
- **ESPN's scoreboard endpoint returns spread/total/ML on `competitions[0].odds[0]`** for basically every upcoming game in NBA/NFL/CFB/MLB/NHL. `details` is a string like `"DET -10.5"`, `"EVEN"`, or `"PK"` — favorite abbreviation followed by their (always-negative-or-zero) spread. To convert to a home-perspective number: parse the abbr + number, flip sign if the favorite is the away team. Implementation in `MakePickFlow.parseEspnSpreadToHome`. This lets every PickModal autofill a line without an extra network call. The `public_betting` scraper is the fallback when ESPN is missing data (rare).
- **The `posts` table needs an owner-fallback if you ever flip default privacy.** Currently the posts SELECT policy is `not exists (… profile.is_private = true)` only. That works because Lock Street's onboarding doesn't default profiles to private. If we ever flip the default OR add an "all profiles private until they opt in" mode, posts would disappear from authors' own feeds. The fix is to add `auth.uid() = user_id OR …` to the policy, mirroring `user_picks`. Migration `20260429_posts.sql` doesn't have it yet — leaving as a known follow-up so we don't have to migrate twice.
