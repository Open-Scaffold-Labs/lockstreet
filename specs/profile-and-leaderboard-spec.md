# Profile + Hot/Not Leaderboard — Spec

> Replaces `/bankroll`. New leftmost tab in primary navigation. Every Lock Street user gets a permanent, mechanically-locked, auto-graded record. Following another user's picks becomes the primary on-ramp for free users. The `/leaderboard` page becomes a sport- and window-tabbed Who's Hot / Who's Not board powered by the same data.

---

## 1. Goals

- Give every account (free or paid) an unforgeable W/L record. No edits, no deletes, no hiding losses.
- Expose juice paid and point-buying cost as first-class numbers next to win rate. Other products don't show this. Lock Street will.
- Make following another handicapper the default behavior — drives daily opens, and creates a network effect the paid product can't.
- Reinforce the paid product (Matt + Shawn picks stay paywalled), don't cannibalize it. Subscribers' picks are public on their profile, but the *system* picks under `lockstreet.vercel.app/picks` remain RLS-gated to subscribers.

## 2. Non-goals (v1)

- Comments, likes, replies, DMs, group chat.
- Push notifications when a followed user posts (v2).
- Bankroll/staking calculator. Old `/bankroll` route is removed; if anyone wants the calculator they can keep using it via git history or we add it back as a sub-section of `/profile` later.
- Pick recommendations / picks-against-the-public surfaced from user data.
- Avatar uploads (URL-only in v1, Supabase Storage in v2).

---

## 3. Routes and navigation

### New routes

| Route | Purpose | Auth |
|---|---|---|
| `/profile` | Your own profile (replaces `/bankroll`) | Required — redirect to `/sign-in` |
| `/u/:handle` | Another user's public profile | Public |
| `/leaderboard` | Who's Hot / Who's Not (existing route, redesigned) | Public |
| `/follow` | Manage follow graph (search users, list following/followers) | Required |

### Nav order

**Bottom nav (mobile, primary):** the existing **Bankroll** tab is reused — renamed to **Profile**, repointed at `/profile`, and moved to the **leftmost (far-left) slot** in `BottomNav.jsx`. No new tab is added; this is a rename + reposition + repoint of the existing button. Order left → right: `Profile` → `Scores` → `Picks` → `Lines` → `Props`.

**Header (desktop):** same logic, Profile is the leftmost link: `Profile` → `Scores` → `Picks` → `Lines` → `Props` → `About` → `Subscribe`.

`/bankroll` is removed from `App.jsx`; an inline `<Navigate to="/profile" replace />` catches any stale links / bookmarked URLs / old PWA-cached references.

---

## 4. Data model

Three new tables, all RLS-enabled. SQL migration file: `supabase/migrations/20260428_profiles_and_user_picks.sql`.

### 4.1 `profiles`

```sql
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null
    check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (length(display_name) between 1 and 40),
  fav_team text,                       -- abbreviation, e.g. 'NYJ', 'OSU'
  fav_team_league text check (fav_team_league in ('nfl','cfb','cbb','nba','mlb','nhl')),
  avatar_url text,
  bio text check (bio is null or length(bio) <= 280),
  is_system boolean default false,     -- true for the synthetic 'lockstreet' profile
  banned boolean default false,        -- soft-hide bad actors without losing record
  created_at timestamptz default now()
);

create index profiles_handle_lower_idx on profiles (lower(handle));
```

RLS:
- `select`: anyone (public) — but rows where `banned = true` are hidden from non-admin queries via a view.
- `insert`: `auth.uid() = user_id`; one row per user.
- `update`: `auth.uid() = user_id`; `handle`, `is_system`, `banned` are immutable from client (column-level RLS or a trigger).
- `delete`: nobody. Cascades only via auth.users delete.

### 4.2 `user_picks`

```sql
create table user_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  game_id text not null,
  league text not null check (league in ('nfl','cfb','cbb','nba','mlb','nhl')),
  season int not null,
  week int,                            -- nullable for non-weekly sports (NBA/MLB/NHL)
  bet_type text not null check (bet_type in ('spread','total','ml')),
  side text not null,                  -- e.g. 'NYJ', 'over', 'home'
  units numeric(3,1) not null check (units between 0.5 and 5.0),

  -- captured at insert, immutable. used for net-units and point-buying math.
  line_at_pick numeric(5,1),           -- e.g. -3.5 (null for moneyline)
  juice_at_pick int not null default -110,
  market_line numeric(5,1),            -- consensus line at insert time
  market_juice int default -110,

  locked_at timestamptz not null default now(),
  kickoff_at timestamptz not null,     -- copied from game record at insert

  result text not null default 'pending'
    check (result in ('pending','win','loss','push','void')),
  graded_at timestamptz,

  created_at timestamptz default now(),
  unique (user_id, game_id, bet_type)  -- one pick per user per game per market type
);

create index user_picks_user_idx on user_picks (user_id, created_at desc);
create index user_picks_grading_idx on user_picks (result, kickoff_at) where result = 'pending';
create index user_picks_window_idx on user_picks (league, graded_at desc) where result <> 'pending';
```

RLS:
- `select`: anyone.
- `insert`: `auth.uid() = user_id`. Trigger enforces `locked_at < kickoff_at`.
- `update`: blocked from client; service role only (used by grading job).
- `delete`: blocked from everyone (records are permanent). If we ever need to nuke spam picks, do it via service role.

### 4.3 `follows`

```sql
create table follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index follows_followed_idx on follows (followed_id);
create index follows_follower_idx on follows (follower_id);
```

RLS:
- `select`: anyone.
- `insert`: `auth.uid() = follower_id`.
- `delete`: `auth.uid() = follower_id`.

### 4.4 Triggers

```sql
-- 1. Lock window enforcement on insert
create or replace function enforce_pick_lock_window() returns trigger as $$
begin
  if new.locked_at >= new.kickoff_at then
    raise exception 'Pick locked too late: kickoff has already passed';
  end if;
  -- Always stamp server time, ignore client value
  new.locked_at := now();
  return new;
end;
$$ language plpgsql;

create trigger user_picks_lock_check
  before insert on user_picks
  for each row execute function enforce_pick_lock_window();

-- 2. Immutability on update (defense-in-depth on top of RLS)
create or replace function user_picks_no_client_update() returns trigger as $$
begin
  if current_setting('request.jwt.claims', true)::jsonb->>'role' <> 'service_role' then
    raise exception 'user_picks rows are immutable from client';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger user_picks_immutable
  before update on user_picks
  for each row execute function user_picks_no_client_update();
```

### 4.5 Leaderboard materialized view

```sql
create materialized view leaderboard_window as
with windowed as (
  select
    p.user_id,
    p.league,
    case
      when p.graded_at >= date_trunc('week', now()) then 'week'
      when p.graded_at >= date_trunc('month', now()) then 'month'
      when p.season = extract(year from now())::int then 'season'
    end as window,
    p.result,
    p.units,
    p.line_at_pick, p.juice_at_pick, p.market_line, p.market_juice
  from user_picks p
  where p.result in ('win','loss','push')
)
select
  user_id, league, window,
  count(*) as picks_count,
  count(*) filter (where result = 'win')  as wins,
  count(*) filter (where result = 'loss') as losses,
  count(*) filter (where result = 'push') as pushes,
  -- net units at posted line/juice (the user's actual P&L)
  sum(
    case result
      when 'win'  then units * (100.0 / abs(juice_at_pick))
      when 'loss' then -units
      else 0
    end
  ) as units_won_net,
  -- net units at market juice (counterfactual: didn't buy half-points)
  sum(
    case result
      when 'win'  then units * (100.0 / abs(coalesce(market_juice, juice_at_pick)))
      when 'loss' then -units
      else 0
    end
  ) as units_won_at_market
from windowed
where window is not null
group by user_id, league, window;

create unique index leaderboard_window_pk on leaderboard_window (user_id, league, window);
```

Refreshed via `refresh materialized view concurrently leaderboard_window` after each grading pass.

---

## 5. Lock-before-kickoff enforcement

Three layers. All three must hold for the spec to ship.

1. **DB trigger** (`enforce_pick_lock_window`) raises if `locked_at >= kickoff_at`. Stamps `locked_at := now()` server-side, so client clock manipulation is useless.
2. **RLS insert policy** restricts inserts to rows where `auth.uid() = user_id`.
3. **UI**: pick modal's submit button is disabled when `kickoff_at - now() < 30s` to avoid race conditions where the user starts the form while the game's about to kick.

QA test: programmatically attempt to insert a row with `kickoff_at = now() - interval '1 minute'`. Expect "Pick locked too late" exception.

---

## 6. Pick submission flow

1. User opens `/scores` or game detail page (`/game/:league/:gameId`).
2. New "Make Pick" button visible to authenticated users on any game with `kickoff > now()`.
3. Modal:
   - Bet type tabs: **Spread** / **Total** / **Moneyline**
   - Side selector (team A / team B / over / under)
   - Units slider (0.5 → 5.0, half-step)
   - Read-only "Current line: -3.5 (-110)" pulled from `/api/odds` (or fallback to consensus from `consensus_picks`)
   - **Buy half-point** checkbox — adds ±0.5 to the user's side, sets `juice_at_pick = -125` (configurable). The original consensus stays in `market_line` / `market_juice`.
4. On submit, client calls `supabase.from('user_picks').insert({...})`. Trigger sets `locked_at = now()`, validates against `kickoff_at`.
5. Pick appears immediately on the user's `/profile`. Followers see it on their `/profile` "Live picks from people you follow" rail in real time via Supabase realtime channel.

---

## 7. Auto-grading

Reuses ESPN scoreboard data already pulled by `useEspnScoreboard` and the existing `team-intel` proxy. New cron multiplexes into `api/refresh-public-betting.js` (Vercel Hobby is at the 12-function cap — see CLAUDE.md "Don't ship a new file without checking").

```
GET /api/refresh-public-betting?job=grade-user-picks
```

Job logic, every 30 minutes during game hours (06:00–02:00 ET):

```
for each user_pick where result='pending' and kickoff_at < now() - interval '4 hours':
  fetch game summary from ESPN by (league, game_id)
  if status != 'final': continue
  compute result based on bet_type:
    spread: away + line_at_pick vs home (sign depends on side)
    total : (away + home) vs line_at_pick (over/under)
    ml    : winning team vs side
  update user_picks set result = ?, graded_at = now() where id = ?
refresh materialized view concurrently leaderboard_window
```

Postponed / canceled games → `result = 'void'`, excluded from leaderboard math.

GitHub Actions cron (extend existing `.github/workflows/refresh-consensus.yml`):

```yaml
- cron: '*/30 * * * *'   # every 30 min
  run: curl https://lockstreet.vercel.app/api/refresh-public-betting?job=grade-user-picks
```

---

## 8. Hot/Not leaderboard — algorithm and UX

### Window tabs (top of `/leaderboard`)

`Weekly` · `Monthly` · `Season`

### Sport tabs (under window tabs)

`All` · `NFL` · `CFB` · `CBB` · `NBA` · `MLB` · `NHL`

(Same sport set everywhere else in the app — see CLAUDE.md "year-round support" and the SystemInfoBanner.)

### Minimum sample to qualify

| Window | Min graded picks |
|---|---|
| Weekly | 5 |
| Monthly | 15 |
| Season | 40 |

Below the minimum, the user still has a profile and a record, but doesn't appear on the ranked leaderboard. Their profile shows "12 more picks to qualify for monthly leaderboard" so they know what they're working toward.

### Sort key

`units_won_net DESC` — net units at the line/juice they actually took. Win % is informational only; volume + juice both matter and the net-units number captures both.

### Display columns

| User | Sport | Net Units | Record | Win% @ Line | Juice Paid | Pt-Buy Cost |
|---|---|---|---|---|---|---|
| @luckyshawn | NFL | **+18.4u** | 28-19-1 | 59.6% | -3.4u | -1.8u |

### Who's Hot vs Who's Not

- **Who's Hot** = top of `units_won_net` for the (sport, window) bucket, qualified users only.
- **Who's Not** = bottom of `units_won_net`, qualified users only, only showing users with `units_won_net < 0`. (No point shaming people who are barely above water.)

Both lists capped at 25 entries per (sport, window). Pagination v2.

---

## 9. Juice and point-buying math

### Convention

**1 unit = 1 unit of risk.** A unit at -110 wins `100/110 = 0.909u` on a hit and loses `1.0u` on a miss. A unit at -120 wins `0.833u` on a hit and loses `1.0u` on a miss.

This is the convention most handicappers use; the alternative (1 unit = 1 unit of *profit*) inverts loss math and confuses users.

### Display formula on every profile / leaderboard row

```
Net Units = Σ (units * win_payout_factor) for wins
          - Σ (units)                       for losses
          + 0                               for pushes / voids

where win_payout_factor = 100 / |juice_at_pick|
```

### Point-buying cost

```
Point-buy cost = Net Units (at market line/juice) − Net Units (at user's pick line/juice)
```

Always ≥ 0 if the user bought half-points (extra juice for free-roll insurance). Exposes the cappers who post -2.5 when the market is -3.

### Example

User picks NYJ +3.5 (-110), market is NYJ +3 (-110). NYJ loses by 3.
- At user's line (3.5): pick wins → +0.909u net
- At market line (3): would push → 0u net
- Point-buy cost on this pick: -0.909u (user actually *gained* by buying — they got lucky on the key number).

Same situation, different game lands NYJ losing by 4:
- At user's line (3.5): loss → -1.0u
- At market line (3): loss → -1.0u
- Point-buy cost: 0u (no benefit, no loss — the half-point didn't matter).

Now flip: NYJ -3 (-110) market, user takes NYJ -2.5 (-120). NYJ wins by 3.
- User's line: would push → 0u
- Market line: would win 0.909u, but at -120 user's win pays 0.833u
- Point-buy cost: -0.833u (capper paid juice for nothing — would've pushed instead of getting the free win).

Point-buy cost is computed pick-by-pick at grading time and summed into the leaderboard view.

---

## 10. Profile page layout

### Header band

- Avatar (or fav-team logo as fallback if no avatar uploaded)
- `@handle` + display name
- Fav-team logo + abbreviation (Syne `.tabbr` per existing convention)
- Follow / Following / Unfollow button (hidden on own profile)
- Followers count, Following count
- Member since `Apr 2026`

### Stats strip (sport-tabbed: All / NFL / CFB / CBB / NBA / MLB / NHL)

Big number layout, 5 cells:
- **Net Units** (the headline number, color-coded green if positive / red if negative)
- **Record** (W-L-P)
- **Win% at Line**
- **Juice Paid**
- **Point-Buy Cost**

Below: "Hot in October: +14.2u · Cold in March: -8.0u" — best/worst rolling month for the user. Quick context.

### Picks section

Three tabs:
- **Live today** — locked picks where game hasn't started, plus picks on in-progress games (status = 'live')
- **Recent** — graded picks, last 30 days, newest first
- **All** — full pick history, season-tabbed (2026, 2025, ...)

Each pick row renders like a `GameCard` lite: home/away logos + abbrs, final score if graded, the user's side / units / line@juice, and a Win/Loss/Push badge.

### "Live picks from people you follow" rail

Top of `/profile`, only shown if the viewer is logged in and has at least one follow with a pending pick today. Subscribed via Supabase realtime to inserts on `user_picks` filtered by `user_id IN (followed list)`.

---

## 11. Public profile (`/u/:handle`)

Same layout as `/profile`, minus:
- The "Make Pick" CTA
- The "Live picks from people you follow" rail
- Edit profile / change handle controls

Plus:
- Follow / Unfollow button in the header band

---

## 12. `/follow` management page

- Search box: type a handle, see matches.
- Two columns: **Following** (with Unfollow button per row) and **Followers** (read-only).
- Mobile: tabs instead of columns.

For v1 the search is a simple `ilike '%query%'` on `handle` and `display_name`. Replace with full-text search if it gets slow.

---

## 13. Onboarding

First time a user lands on `/profile` after signup, prompt with a one-screen modal:

```
Welcome to Lock Street.
Pick a handle (this is your profile URL — can't change it).
Your favorite team (optional).
A short bio (optional).
```

Submit creates the `profiles` row. No bypass — without a handle, the user can't see other profiles or use the rest of the social features. (They can still browse `/scores`, `/picks`, etc.)

The signup redirect changes from `/` to `/profile` for any user without an existing profile row.

---

## 14. System profile for Lock Street free picks

Insert a `profiles` row with `user_id = <synthetic uuid>`, `handle = 'lockstreet'`, `is_system = true`, fav team = N/A. The free pick of the week (already posted publicly under `picks.visibility = 'public'`) is also written as a `user_picks` row under this profile when the admin publishes it.

This means:
- The free pick competes on the leaderboard alongside subscribers' personal picks.
- Users can follow `@lockstreet` to see free picks land in their follow feed.
- Subscribers can compare their own record directly to the public Lock Street record.

`/admin → publish free pick` gets a one-click "Mirror to @lockstreet profile" toggle (default on).

---

## 15. API surface

Vercel Hobby cap: 12 functions. We're already at 12. **No new files in `api/`.** Multiplex into existing endpoints:

| Need | Endpoint | New flag |
|---|---|---|
| Submit user pick | client → Supabase direct (RLS-gated) | n/a |
| Read profile by handle | `api/team-intel.js` | `?op=profile&handle=...` |
| Grade user picks (cron) | `api/refresh-public-betting.js` | `?job=grade-user-picks` |
| Read leaderboard | client → Supabase view directly | n/a |
| Follow / unfollow | client → Supabase direct (RLS-gated) | n/a |

Anything that doesn't strictly require a server (write paths gated by RLS, read paths against public views) goes direct to Supabase. Endpoints are reserved for things that need service-role access (grading) or external API auth (ESPN, the-odds-api).

---

## 16. Frontend changes

### New files

- `src/routes/ProfileRoute.jsx` — own profile, gated by `SignedIn`
- `src/routes/PublicProfileRoute.jsx` — `/u/:handle`
- `src/routes/FollowRoute.jsx` — `/follow`
- `src/components/PickModal.jsx` — submit a pick on a game
- `src/components/StatsStrip.jsx` — sport-tabbed Net Units / Record / Win% / Juice / Pt-Buy
- `src/components/UserPickCard.jsx` — pick row inside profile
- `src/components/FollowButton.jsx`
- `src/hooks/useProfile.js` — fetch a profile row + stats
- `src/hooks/useUserPicks.js` — fetch user picks (filter by user_id, optionally by sport)
- `src/hooks/useFollows.js` — followers / following
- `src/hooks/useLeaderboard.js` — read `leaderboard_window` view, params (window, league)
- `src/hooks/useRealtimeFollowFeed.js` — subscribe to follow feed inserts

### Existing files touched

- `src/App.jsx` — drop `/bankroll`, add `/profile`, `/u/:handle`, `/follow`, plus a `<Navigate to="/profile" replace />` catch for `/bankroll`
- `src/components/BottomNav.jsx` — rename the Bankroll tab to **Profile**, change its icon, repoint `to="/profile"`, and reorder it to the **leftmost** slot. Same component, same button, just relabeled and moved.
- `src/components/Header.jsx` — reorder desktop nav so Profile is leftmost; swap "Bankroll" link text for "Profile"
- `src/routes/LeaderboardRoute.jsx` — full redesign (Hot/Not, window tabs, sport tabs)
- `src/routes/AdminRoute.jsx` — add "Mirror free pick to @lockstreet" toggle
- `src/routes/SignInRoute.jsx` — redirect logic: new users → `/profile` onboarding, existing → `/`
- Game detail page (`src/routes/GameRoute.jsx` or wherever `/game/:league/:gameId` lives) — embed `<MakePickButton />`

### Files removed

- `src/routes/BankrollRoute.jsx` — git-archived. Component code may be salvageable if we re-add a bankroll calculator later.

---

## 17. Migration plan

1. **Migration SQL** at `supabase/migrations/20260428_profiles_and_user_picks.sql`:
   - Tables, indexes, triggers, RLS policies, materialized view.
   - Seed: insert `lockstreet` system profile.
2. **Backfill**: for every user in `auth.users` without a `profiles` row, no-op (don't auto-create — onboarding modal does this so the user picks their handle).
3. **Frontend swap** in a single PR:
   - Add the new routes, components, hooks listed above.
   - Reorder header nav.
   - Delete `BankrollRoute.jsx` and its route.
   - Update sign-in redirect.
4. **Grading cron**: extend `api/refresh-public-betting.js`, add the GitHub Actions cron line.
5. **System profile + free-pick mirror**: light admin-side change, ship after the rest is verified.

Migration runs against the `lockstreet` Supabase project (`chwijzlynfnxvzfeydtf`, `mlav-personal` free org). **Per CLAUDE.md, do NOT touch projects in OpenScaffoldLabs.** The connected Supabase MCP is scoped to OpenScaffoldLabs, so SQL goes in via the dashboard SQL editor (Chrome MCP if needed) — not the MCP.

---

## 18. QA / acceptance tests

| Test | Expected |
|---|---|
| Insert a user pick with `kickoff_at = now() - 1m` | Trigger raises "Pick locked too late" |
| Update a graded pick from a user JWT | Trigger raises "user_picks rows are immutable from client" |
| Try to delete a user pick | RLS rejects |
| Try to insert with `user_id <> auth.uid()` | RLS rejects |
| Hand-calc net units for 5 graded picks (mix of -110 and -120) | Matches `leaderboard_window.units_won_net` |
| Submit a pick → see it on profile within 1s; another browser following you sees it within 5s | Realtime channel works |
| User with 4 graded picks this week | Profile shows record, leaderboard does NOT show them; "1 more pick to qualify" message shown |
| User with 50 graded picks, all losses | Appears on Who's Not, not on Who's Hot |
| Set `banned = true` on a profile | Profile and picks no longer appear on leaderboard or in search |

---

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Cannibalizes paid product | System picks stay paywalled. User picks public. Subscribers' picks public on their personal profile *only*; the system `/picks` page remains RLS-gated. |
| Clock manipulation to backdate picks | DB trigger stamps `locked_at = now()` server-side, ignores client value. |
| Grading drift (ESPN restates scores) | Wait `kickoff + 4h` before grading. Never re-grade an already-set row. |
| Materialized view stale if cron fails | Show "Last updated: HH:MM ago" on `/leaderboard`. Alert in admin if > 2h stale. |
| Handle squatting | Reserve list pre-launch: `lockstreet`, `matt`, `shawn`, `mlav1114`, `luckyshawn`, `admin`, `support`. Reject these in the create-profile validator. |
| Spam / fake accounts | `banned` flag soft-hides without dropping records. Keeps the leaderboard clean while preserving audit trail. |
| Free-pick gaming the leaderboard (only 1 pick/week → can't qualify) | System profile is acknowledged, ranks won't be inflated by it. |

---

## 20. v1 ship checklist

- [ ] Migration SQL written and applied to `chwijzlynfnxvzfeydtf` (mlav-personal free org)
- [ ] `lockstreet` system profile seeded
- [ ] `ProfileRoute`, `PublicProfileRoute`, `FollowRoute` shipped
- [ ] `LeaderboardRoute` redesigned (Hot/Not, sport tabs, window tabs, min-sample gating)
- [ ] `PickModal` on game detail page with line + buy-half-point + lock-window guard
- [ ] Grading cron in `refresh-public-betting.js?job=grade-user-picks` + GitHub Actions cron line
- [ ] Onboarding modal on first `/profile` visit (handle, fav team, bio)
- [ ] Header nav reorder: Profile leftmost, `/bankroll` removed, redirect added
- [ ] Realtime subscription for "Live picks from people you follow"
- [ ] Free-pick mirror toggle on `/admin`
- [ ] QA: all 9 acceptance tests above pass
- [ ] PWA cache busted post-deploy (per CLAUDE.md "iOS aggressively caches PWA bundles")

---

## 21. v2 backlog (post-ship)

- Push notifications when a followed user posts a pick.
- Comments and replies on picks.
- DMs.
- Streak badges (3+ winning weeks, 60%+ ATS over 50 picks, etc.).
- Capper-vs-capper head-to-head pages (`/h2h/matt-vs-shawn?season=2026`).
- Filtering follow feed by sport or by bet type.
- Closing-line value tracking (requires persisting closing lines — half-day project on its own per CLAUDE.md "Last 10 ATS").
- Avatar uploads via Supabase Storage.
- Paid handicapper marketplace (users sell access to their picks; Lock Street takes a cut).
- "Subs only" tab on `/leaderboard` showing only active-subscription handicappers.
- Public API (read-only) so trailers can pipe into their own tooling — adds defensibility.

---

## 22. Decisions (locked v1)

1. **Free pick posts to BOTH** `@lockstreet` and Matt's personal profile. On Matt's personal it renders with a **"Free Pick"** badge so it's clear it's the official Lock Street pick (not a private personal play). System mirror also keeps the official `@lockstreet` row.
2. **Profile privacy toggle.** Default public. Each user can flip their profile to private, which:
   - Removes them from the Hot/Not leaderboard
   - Hides their pick history from public profile / follow-feed views
   - Owner still sees their own profile and full pick history
   - Record continues to grade in the background; flipping back to public restores everything (no data loss)
   Enforced at the RLS layer on `user_picks` so direct API calls also respect privacy.
3. **Season uses sport-year.** NBA 2025–26 → `season = 2026`. NHL/CBB same (year the season ends). NFL/CFB use the year the season starts (2025 season runs Aug 2025 → Feb 2026, all rows tagged 2025). MLB uses calendar year. Implemented in `seasonForLeague(league, date)` in `lib/userPicks.js`.
4. **Min-sample qualification: 3 / 6 / 20.** Below the threshold, profile shows the record but the user is not eligible for the leaderboard ranking in that window.
5. **No cap on half-point buying.** Each half-point bought adds ~10 cents to the juice (-110 → -120 → -130 → ...). The full cost reflects automatically in the user's net units / unit ROI via the existing `juice_at_pick` snapshot. `user_picks.point_buys` stores the count so the profile row can render "bought 2 half-points" transparently.
