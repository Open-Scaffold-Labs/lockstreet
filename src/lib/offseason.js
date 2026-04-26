// Football off-season helpers, shared between /scores and /picks.

/** Return true when the football slate looks empty (no NFL/CFB games imminent). */
export function isFootballOffSeason(games) {
  const football = (games || []).filter((g) => g.league === 'nfl' || g.league === 'cfb');
  if (football.length === 0) return true;
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const soon = football.filter((g) => {
    const k = new Date(g.kickoff || 0).getTime();
    return k - now < sevenDays && k - now > -3 * 24 * 60 * 60 * 1000;
  });
  return soon.length < 3;
}

/** Hardcoded next-season kickoff dates — bump each summer. */
export function nextSeasonStart(league) {
  if (league === 'nfl') return new Date('2026-09-10T20:00:00-04:00');
  if (league === 'cfb') return new Date('2026-08-23T12:00:00-04:00');
  return null;
}

export function daysUntil(date) {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
