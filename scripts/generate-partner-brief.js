// Generates Lock_Street_Partner_Brief.docx for Matt to send to Dale.
// Run from the repo root:  node scripts/generate-partner-brief.js
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
} = require('docx');

const PURPLE = '7E22CE';   // brand purple
const PURPLE_LIGHT = 'EFE6FA';
const INK = '111111';
const GRAY = '666666';
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120 },
    children: [new TextRun({ text, ...opts })],
    alignment: opts.align,
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 30, color: PURPLE })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: INK })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 60 },
    children: [new TextRun({ text })],
  });
}

function bulletBoldLead(lead, rest) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: lead, bold: true }),
      new TextRun({ text: rest }),
    ],
  });
}

function tableCell(text, opts = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, color: opts.color })],
      }),
    ],
  });
}

// ============== content ==============
const children = [];

// Cover
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 400, after: 80 },
  children: [new TextRun({ text: 'LOCK STREET', bold: true, size: 56, color: PURPLE })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 60 },
  children: [new TextRun({ text: 'Product & Capabilities Brief', size: 28, color: INK })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 240 },
  children: [new TextRun({ text: 'For: Dale  •  From: Matt  •  As of April 30, 2026', size: 20, color: GRAY })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 360 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PURPLE, space: 4 } },
  children: [new TextRun({ text: '' })],
}));

// What Lock Street Is
children.push(h1('What Lock Street is'));
children.push(p(
  'Lock Street is a mobile-first live sports app built for the betting fan. The free, open core is the daily-use surface — ' +
  'real-time scores and box scores across NFL, college football, NBA, NHL, and MLB; public betting splits with sharp-money ' +
  'signals; a live Heat Check leaderboard of teams currently covering ATS; per-game intel including last-10 ATS, off / def ' +
  'rank, injuries, and live fantasy leaders. Anyone can use it. It is designed to be the app a sports bettor opens before, ' +
  'during, and after every game — not a niche picks site, but the everyday companion.'
));
children.push(p(
  'Sitting on top of the fan app is the social network — Twitter for sports bettors. Every user has a permanent handle, a ' +
  'public profile at /u/handle, a Following / Followers graph, and a feed. Users post their own picks (locked at kickoff, ' +
  'immutable forever), comment on each other’s plays, and tail or fade in real time. Hot Capper rankings show who is ' +
  'actually winning over time. Picks and posts can never be deleted, so the receipts are real and so is the leaderboard.'
));
children.push(h2('How the business makes money'));
children.push(p(
  'The platform runs on two revenue streams.'
));
children.push(bulletBoldLead(
  'Stream 1 — Lock Street’s own picks subscription. ',
  'Matt and Shawn’s NFL + college plays at $100/week, $250/month, or $500/year. This is direct revenue and, just as ' +
  'importantly, it’s the anchor brand that establishes on the platform what a winning operator looks like.'
));
children.push(bulletBoldLead(
  'Stream 2 — the creator marketplace (the scale play). ',
  'Independent handicappers will be able to launch their own paid subscription tiers for their picks on Lock Street, and ' +
  'the platform takes a percentage of every dollar they collect. The free fan app drives the audience; the social network ' +
  'lets handicappers build a public following with real public receipts; the marketplace turns any successful capper into ' +
  'recurring revenue, with Lock Street as the rev-share platform underneath. This is where the company scales — not from ' +
  'one operator’s subscriber base, but from a network of operators each running their own.'
));
children.push(p(
  'The brand is a father and son operation — Matt operates the platform, Shawn developed the handicapping system that ' +
  'produced three independent #1 pool finishes. Those wins are the credibility anchor that pulls in both subscribers and the ' +
  'handicappers who will eventually run their own subscriptions on the marketplace.'
));

// Pricing
children.push(h1('Pricing — Lock Street’s own picks subscription (revenue stream 1)'));
children.push(p(
  'These tiers are how Matt and Shawn’s own picks monetize. Independent handicappers running their own tiers on the ' +
  'marketplace will set their own pricing; the platform’s rev-share applies regardless.'
));
const priceWidths = [2200, 1400, 5760];
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: priceWidths,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        tableCell('Tier', { width: priceWidths[0], bold: true, fill: PURPLE_LIGHT }),
        tableCell('Price', { width: priceWidths[1], bold: true, fill: PURPLE_LIGHT }),
        tableCell('What’s included', { width: priceWidths[2], bold: true, fill: PURPLE_LIGHT }),
      ],
    }),
    new TableRow({ children: [
      tableCell('Weekly', { width: priceWidths[0] }),
      tableCell('$100 / week', { width: priceWidths[1] }),
      tableCell('4 NFL + 4 CFB ATS picks every week. Unit sizing on every play. Push notification at pick drop. Locked until kickoff, private to subs.', { width: priceWidths[2] }),
    ]}),
    new TableRow({ children: [
      tableCell('Monthly (popular)', { width: priceWidths[0] }),
      tableCell('$250 / month', { width: priceWidths[1] }),
      tableCell('Everything in Weekly. Early-week previews. Bankroll tracker. Pick reasoning before each drop. $58 / week effective — saves 42%.', { width: priceWidths[2] }),
    ]}),
    new TableRow({ children: [
      tableCell('Annual (best value)', { width: priceWidths[0] }),
      tableCell('$500 / year', { width: priceWidths[1] }),
      tableCell('Everything in Monthly. Playoffs and bowls included. Private Discord access. Direct DMs for line questions. $9.60 / week effective.', { width: priceWidths[2] }),
    ]}),
  ],
}));

// Core Product
children.push(h1('The core product'));
children.push(p('Every paid pick on the platform carries:'));
children.push(bullet('Side (team and spread, total over/under, or moneyline) and the line locked at the moment we posted.'));
children.push(bullet('Unit sizing from 1u to 5u so subscribers know exactly how much to risk.'));
children.push(bullet('Written reasoning explaining the angle.'));
children.push(bullet('A kickoff lock — once the game starts the pick is permanent, the line stops moving on our record, and the result auto-grades from the final score.'));
children.push(p(
  'Free pick: one pick per week is published publicly to drive sign-ups. It carries the same lock-at-kickoff rule and lands on the ' +
  'live scoreboard with a "Lock Street Free Pick" badge.'
));

// Live site walkthrough
children.push(h1('What every visitor sees'));

children.push(h2('Public marketing pages'));
children.push(bulletBoldLead('Home (/) — ', 'hero quote, three credibility stats (3× #1 pool finishes, 65% ATS in the most recent 144-pick season, 250+ combined entrants finished ahead of), pricing tiers, and a track-record CTA.'));
children.push(bulletBoldLead('Pro (/subscribe) — ', 'the credibility anchor. Cumulative-units chart for the most recent ATS season, the three #1 finishes with detail on each pool, what subscribers get, how the picks are made, and pricing.'));
children.push(bulletBoldLead('Weekly (/weekly) — ', 'free Wednesday preview every week. The matchups we’re watching, line moves, and one free pick.'));
children.push(bulletBoldLead('Scores (/scores) — ', 'live + upcoming games for NBA, NHL, MLB, NFL, and CFB grouped by sport. Each card shows team logos, records, status (live clock or kickoff time), spread / O-U / moneyline pills, and any free pick badge that applies.'));

children.push(h2('Subscriber-only / signed-in pages'));
children.push(bulletBoldLead('Picks (/picks) — ', 'Open and Closed tabs. Open shows live picks pending kickoff. Closed shows graded picks from the last 6 days with W / L / Push badges.'));
children.push(bulletBoldLead('Lines (/lines) — ', 'public betting splits per game (bets % vs money %), with a SHARP indicator when handle and ticket counts diverge. Helps subscribers identify where the smart money is going.'));
children.push(bulletBoldLead('Heat Check (/heat-check) — ', 'leaderboard of teams covering 7-of-10 or more recently. Refreshes daily.'));
children.push(bulletBoldLead('Leaders (/leaderboard) — ', 'two views. Hot Capper ranks individual handicappers by net units (with sample-size minimums). Weekly Contest shows the standings of the open weekly contest.'));
children.push(bulletBoldLead('Game detail (/game/:league/:gameId) — ', 'click any game card. Shows the score live, a play-by-play tracker, both teams’ last-10 ATS, off / def rank with raw stats, injuries, and live fantasy leaders. Polls every 30 seconds for live games.'));
children.push(bulletBoldLead('Team detail (/team/:league/:teamId) — ', 'team-page shell that surfaces the same intel via the team intel proxy.'));

// Account & Social
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('The user account & social layer — Twitter for sports bettors'));
children.push(new Paragraph({
  spacing: { after: 120 },
  children: [new TextRun({
    text: 'Showcase your picks, follow other handicappers, talk over every play.',
    italics: true,
    color: GRAY,
    size: 22,
  })],
}));
children.push(p('Lock Street is more than a one-way picks pipe. Every signed-in user has a permanent record they can build on the platform.'));

children.push(h2('Profile & identity'));
children.push(bulletBoldLead('Handle and display name — ', 'pickable on first sign-in. Each handle is a permanent URL: /u/your-handle.'));
children.push(bulletBoldLead('Favorite team avatar — ', 'logo from the team’s catalog with the team’s real primary color as the avatar ring.'));
children.push(bulletBoldLead('Public or private profile — ', 'each user can flip privacy. Private profiles hide picks and posts from non-followers. Hot/Not eligibility kicks in for public profiles only.'));
children.push(bulletBoldLead('Bio + edit modal — ', 'inline edit on your own profile.'));

children.push(h2('Personal picks'));
children.push(bullet('Any signed-in user can hit "+ Make a Pick" from /scores or their profile. They pick a side, set units (0.5u to 5u), optionally buy half-points (with juice penalty applied automatically), and lock it before kickoff.'));
children.push(bullet('Picks are immutable after submission. Server enforces this at the database level via a trigger that rejects any non-admin update or delete.'));
children.push(bullet('Three views on the profile picks card: Live today (pending), Recent (graded in the last 30 days), and All.'));
children.push(bullet('Stats strip aggregates ATS%, units net, and per-sport breakdowns over This Week / This Month / Season windows.'));

children.push(h2('Follow graph'));
children.push(bulletBoldLead('Follow / unfollow — ', 'one click on any user’s public profile. The Lock Street creator account is auto-followed by every new sign-up so they immediately see Matt’s posts.'));
children.push(bulletBoldLead('Following + Followers counts — ', 'visible on every profile.'));
children.push(bulletBoldLead('/follow page — ', 'manage who you follow, search by handle.'));

children.push(h2('Feed (/feed)'));
children.push(p(
  'A merged stream of community posts and standalone picks, newest first. Two tabs: Following (people you follow) and All (everyone public). ' +
  'Composer at the top lets any verified signed-in user post a take, attach a pick to it, or both. ' +
  'Posts are permanent like picks — the brand promise is "never deleted, locked at kickoff, graded automatically."'
));

children.push(h2('Comments + Tail/Fade (shipped this week)'));
children.push(bulletBoldLead('Comments — ', 'every post and every personal pick has an inline comment thread. Flat threading (no nested replies). 500-character limit. Authors can soft-delete their own comments; deleted rows show as "(deleted)" so the conversation order is preserved. Real-time — new comments appear live for everyone viewing the thread.'));
children.push(bulletBoldLead('Tail / Fade buttons — ', 'the betting-native replacement for like/dislike. Tail = "I’d take the same side." Fade = "I’d take the other side." One click to register; click the same button again to clear; click the opposite to flip. Counts update live across all viewers. Locks at kickoff so users can’t pile on after the result is known.'));

children.push(h2('Notifications'));
children.push(bulletBoldLead('Push (one-time prompt) — ', 'first time you sign in we ask once whether to enable browser push. After that you get a push every time someone follows you, comments on your post or pick, or tails / fades your pick. Anti-spoof: the server verifies the underlying database row matches the claim before persisting.'));
children.push(bulletBoldLead('Inbox (on /profile) — ', 'every push is also persisted as an inbox row, so you have a history even if push wasn’t enabled at the time. Each row is clickable to navigate to the source post or pick. Inbox auto-collapses when 6 or more events of the same type land on the same target (for example, "12 new tails on your CLE pick"); 5 or fewer render individually.'));
children.push(bulletBoldLead('Self-actions skipped — ', 'commenting on your own post or tailing your own pick does not generate a notification.'));

children.push(h2('Search + discovery'));
children.push(bullet('Magnifying-glass icon in the header opens a live search of all profiles by handle or display name.'));
children.push(bullet('Public profiles surface in the leaderboard and in the All feed.'));
children.push(bullet('Pull-to-refresh: iOS-style overlay on every page so installed-PWA users get the same refresh affordance the browser provides.'));

// Track record
children.push(h1('The track record we lead with'));
children.push(p('Three independent #1 pool finishes form the marketing case for the system:'));
const trWidths = [3000, 1400, 4960];
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: trWidths,
  rows: [
    new TableRow({ tableHeader: true, children: [
      tableCell('Pool', { width: trWidths[0], bold: true, fill: PURPLE_LIGHT }),
      tableCell('Result', { width: trWidths[1], bold: true, fill: PURPLE_LIGHT }),
      tableCell('Detail', { width: trWidths[2], bold: true, fill: PURPLE_LIGHT }),
    ]}),
    new TableRow({ children: [
      tableCell('Karen’s NFL Pool', { width: trWidths[0] }),
      tableCell('#1 of 84', { width: trWidths[1] }),
      tableCell('Matt 1st (165-107). Shawn 2nd (155-117). Two independent entries from the same framework finishing 1-2 — the strongest system-validation result we have.', { width: trWidths[2] }),
    ]}),
    new TableRow({ children: [
      tableCell('W3P1 ATS Pool (most recent season)', { width: trWidths[0] }),
      tableCell('#1 of 100', { width: trWidths[1] }),
      tableCell('Joint father-son entry. 4 picks each per week, against the spread. 18 weeks. Combined: 94 / 144 — 65% ATS. Same exact format subscribers receive.', { width: trWidths[2] }),
    ]}),
    new TableRow({ children: [
      tableCell('Office Football Pool', { width: trWidths[0] }),
      tableCell('#1 of 66', { width: trWidths[1] }),
      tableCell('Matt solo. 67-44-3 record. 23 key wins (confidence-weighted picks). 3.5 points clear of 2nd place. The "key picks" mechanic is unit-sizing in disguise — same skill that decides whether a Lock Street pick goes 1u, 2u, or 3u.', { width: trWidths[2] }),
    ]}),
  ],
}));

// Admin tools
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('What Matt sees on the operator side'));
children.push(p('The /admin route is gated to the admin role and exposes the operating dashboard:'));
children.push(bulletBoldLead('Pick board — ', 'view every posted pick, live and closed, with status, units, week, game ID, and posting time. Post a new pick via "+ POST PICK" with the side / units / reasoning / visibility (public free pick or paid).'));
children.push(bulletBoldLead('Email subscribers — ', 'one-click trigger of the weekly email blast to active paid subscribers only.'));
children.push(bulletBoldLead('Push test panel — ', 'enable push on the current device, then send a test broadcast to every push-subscribed device on the platform.'));
children.push(bulletBoldLead('User stats — ', 'total users, verified vs. unverified counts, active subscribers by tier (W/M/Y), push device count + unique users with push, conversion rate (active subs / total users), and a recent-signups list.'));
children.push(bulletBoldLead('Contest admin — ', 'create and grade weekly pick’em contests with MNF tiebreakers.'));

// Tech stack
children.push(h1('Tech stack (short version)'));
children.push(bulletBoldLead('Frontend — ', 'React 18 SPA built with Vite. Mobile-first, neon purple + green palette on pure black. Installable as a Progressive Web App on iPhone and Android home screens.'));
children.push(bulletBoldLead('Backend — ', 'Vercel serverless functions in Node, currently 12 endpoints (we’re at the free-tier function cap, multiplexing new ops into existing endpoints).'));
children.push(bulletBoldLead('Database — ', 'Supabase Postgres with Row Level Security. Tables include picks, user_picks, posts, comments, pick_actions, follows, notifications, profiles, subscriptions, push_subscriptions, contests.'));
children.push(bulletBoldLead('Auth — ', 'Supabase Auth (email + password). Roles in the JWT.'));
children.push(bulletBoldLead('Live data — ', 'ESPN public APIs for scores / box scores / play-by-play, the-odds-api for lines, ScoresAndOdds scrape for public betting splits.'));
children.push(bulletBoldLead('Push — ', 'Web Push with VAPID keys. iOS supports it via the installed PWA.'));
children.push(bulletBoldLead('Hosting — ', 'Vercel Hobby (free tier). Lives at lockstreet.vercel.app today; we’ll move to a custom domain pre-launch.'));
children.push(bulletBoldLead('Payments — ', 'Stripe (subscription billing). Webhook syncs Stripe state to our subscriptions table so paywalls work in real time.'));

// What's open
children.push(h1('What’s left before launch'));
children.push(bulletBoldLead('Stripe wiring — ', 'biggest single open piece. Need real Stripe keys + 3 Price IDs (Weekly / Monthly / Annual) + the webhook secret in Vercel env. About 30 minutes of work once the keys are in hand.'));
children.push(bulletBoldLead('Email confirmation — ', 'currently disabled in Supabase to make dev sign-ups frictionless. Re-enable before launch and the comment / post / verified gates kick in automatically.'));
children.push(bulletBoldLead('Discord invite delivery — ', 'set up a private Discord, drop the static invite URL into the env, and the Stripe webhook will auto-email it on every Annual sign-up.'));
children.push(bulletBoldLead('Custom domain — ', 'point lockstreet.com (or chosen domain) at the Vercel deployment.'));
children.push(bulletBoldLead('Native mobile app — ', 'pre-NFL season, wrap the React app in Expo / React Native to get true app-store distribution alongside the PWA.'));

// Roadmap
children.push(h1('Things on deck after launch'));
children.push(h2('The headline build — creator marketplace (revenue stream 2)'));
children.push(p(
  'The largest product investment after launch. Lets independent handicappers run their own paid subscription tiers on Lock ' +
  'Street, with the platform taking a percentage of every dollar collected. Pieces required:'
));
children.push(bulletBoldLead('Creator onboarding — ', 'application flow, identity verification, payout details. Not every signed-in user becomes a creator; gated to operators with a public record on the platform.'));
children.push(bulletBoldLead('Per-creator subscription tiers — ', 'each creator sets their own pricing, features, and pick cadence. Stripe Connect (or equivalent) routes payments through Lock Street’s account so the platform takes its cut before the rest is paid out to the creator.'));
children.push(bulletBoldLead('Per-creator paywalled feed — ', 'each creator’s paid picks visible only to their subscribers, gated by RLS on the picks table.'));
children.push(bulletBoldLead('Creator analytics dashboard — ', 'subscriber count, MRR, churn, ATS record, units net. The data the operator needs to grow.'));
children.push(bulletBoldLead('Discovery + leaderboard ranking — ', 'Hot Capper rankings double as a top-of-funnel for new subscriber acquisition. Higher-ATS creators surface higher.'));
children.push(bulletBoldLead('Platform rev-share contract + 1099 reporting — ', 'standard creator-platform legal + tax plumbing. Required before opening to outside operators.'));

children.push(h2('Smaller features on deck'));
children.push(bulletBoldLead('Bankroll tracker — ', 'promised in the Monthly tier; gives subscribers a sandbox to track their own ROI from the picks they tail.'));
children.push(bulletBoldLead('Pick-graded push — ', 'fire a push when a pick grades W / L / Push so subscribers see the result immediately.'));
children.push(bulletBoldLead('Closing-line capture — ', 'snapshot the closing line per game so we can compute true Last-10 ATS for game-detail preview cards.'));
children.push(bulletBoldLead('Mention notifications in comments — ', '@handle a friend in a thread, they get a notification.'));
children.push(bulletBoldLead('Admin moderation panel — ', 'soft-delete inappropriate comments and ban users without dropping into the database.'));
children.push(bulletBoldLead('Closed-pick final scores — ', 'show the final score and cover margin on every closed pick card so the user doesn’t need to do mental math.'));

// Footer
children.push(new Paragraph({
  spacing: { before: 360 },
  alignment: AlignmentType.CENTER,
  border: { top: { style: BorderStyle.SINGLE, size: 6, color: PURPLE, space: 4 } },
  children: [new TextRun({ text: '' })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 80 },
  children: [new TextRun({ text: 'Lock Street — lockstreet.vercel.app', size: 18, color: GRAY })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0 },
  children: [new TextRun({ text: 'Two generations. One system.', size: 18, italics: true, color: PURPLE })],
}));

// ============== build doc ==============
const doc = new Document({
  creator: 'Matt Lavin',
  title: 'Lock Street — Product & Capabilities Brief',
  description: 'Partner brief for Dale.',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Calibri', color: PURPLE },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Calibri', color: INK },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
        ],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'Lock Street  —  Product Brief', size: 16, color: GRAY })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Page ', size: 16, color: GRAY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GRAY }),
          new TextRun({ text: ' of ', size: 16, color: GRAY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GRAY }),
        ],
      })] }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync('Lock_Street_Partner_Brief.docx', buf);
  console.log('OK: Lock_Street_Partner_Brief.docx written (' + buf.length + ' bytes)');
});
