/**
 * Team news proxy. Fetches the league-wide RSS feed (ESPN.com publishes
 * RSS feeds explicitly for aggregator consumption — fully legal under
 * standard syndication norms), then filters items by team-name keyword.
 *
 * Optional fallback: if NEWSDATA_API_KEY is set in env and RSS yields
 * fewer than 3 hits, augment from NewsData.io's free tier (200 req/day,
 * proper licensing — they sign deals with publishers so we don't need to).
 *
 *   GET /api/team-news?league=nba&teamName=Celtics&teamCity=Boston
 *
 * Response: { items: [{ title, link, source, publishedAt, image, description }] }
 *
 * Cached 30 min in-memory per (league, teamName).
 */

const CACHE = new Map(); // key -> { at, payload }
const CACHE_MS = 30 * 60 * 1000;

const RSS_URL = {
  nfl: 'https://www.espn.com/espn/rss/nfl/news',
  cfb: 'https://www.espn.com/espn/rss/ncf/news',
  nba: 'https://www.espn.com/espn/rss/nba/news',
  mlb: 'https://www.espn.com/espn/rss/mlb/news',
  nhl: 'https://www.espn.com/espn/rss/nhl/news',
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept':     'application/rss+xml, application/xml, text/xml',
};

export default async function handler(req, res) {
  const { league, teamName, teamCity } = req.query || {};
  if (!league || !RSS_URL[league]) return res.status(400).json({ error: 'invalid league' });

  const key = `${league}:${(teamName || '').toLowerCase()}:${(teamCity || '').toLowerCase()}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return res.status(200).json(hit.payload);
  }

  let items = [];
  // 1) Pull league-wide RSS, filter by team name/city
  try {
    const r = await fetch(RSS_URL[league], { headers: BROWSER_HEADERS });
    if (r.ok) {
      const xml = await r.text();
      const parsed = parseRss(xml);
      const needles = [teamName, teamCity].filter(Boolean).map((s) => s.toLowerCase());
      items = parsed.filter((it) => {
        if (!needles.length) return true;
        const blob = (it.title + ' ' + (it.description || '')).toLowerCase();
        return needles.some((n) => blob.includes(n));
      }).map((it) => ({ ...it, source: 'ESPN' }));
    }
  } catch {}

  // 2) Optionally augment from NewsData.io if we have <3 RSS hits and the
  //    API key is configured. NewsData.io has explicit redistribution rights
  //    in their ToS — safer than scraping ESPN's news endpoint directly.
  if (items.length < 3 && process.env.NEWSDATA_API_KEY && teamName) {
    try {
      const q = encodeURIComponent(`"${teamName}" ${teamCity || ''} ${league.toUpperCase()}`.trim());
      const url = `https://newsdata.io/api/1/news?apikey=${process.env.NEWSDATA_API_KEY}&q=${q}&language=en&category=sports`;
      const r2 = await fetch(url);
      if (r2.ok) {
        const j = await r2.json();
        const extra = (j?.results || []).slice(0, 8).map((it) => ({
          title: it.title,
          link: it.link,
          publishedAt: it.pubDate,
          image: it.image_url,
          description: it.description,
          source: it.source_id || 'NewsData.io',
        }));
        // de-dup by URL
        const seen = new Set(items.map((i) => i.link));
        for (const e of extra) {
          if (!seen.has(e.link)) items.push(e);
        }
      }
    } catch {}
  }

  // Newest first, cap at 12
  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  items = items.slice(0, 12);

  const payload = { items, source: items[0]?.source || 'ESPN' };
  CACHE.set(key, { at: Date.now(), payload });
  res.status(200).json(payload);
}

/**
 * Tiny RSS parser. Pulls <item> blocks and extracts title/link/pubDate/
 * description/media:thumbnail. RSS is forgiving enough that regex is fine
 * for a single trusted source like ESPN — no need to add an XML lib dep.
 */
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = decode(extract(block, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/));
    const link  = decode(extract(block, /<link>([\s\S]*?)<\/link>/));
    const pub   = decode(extract(block, /<pubDate>([\s\S]*?)<\/pubDate>/));
    const desc  = decode(extract(block, /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/));
    const img   = decode(extract(block, /<media:thumbnail[^>]*url="([^"]+)"/) || extract(block, /<media:content[^>]*url="([^"]+)"/));
    if (!title) continue;
    items.push({ title, link, publishedAt: pub, description: desc, image: img });
  }
  return items;
}
function extract(block, re) {
  const m = block.match(re);
  return m ? m[1].trim() : null;
}
function decode(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}
