/**
 * News handler — folded out of api/team-intel.js. RSS-first (legal,
 * designed for aggregator consumption); optional NewsData.io fallback
 * when NEWSDATA_API_KEY is set in env. Filters by team name/city when
 * provided. 30-min cache.
 */

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const NEWS_CACHE = new Map();
const NEWS_CACHE_MS = 30 * 60 * 1000;
const RSS_URL = {
  nfl: 'https://www.espn.com/espn/rss/nfl/news',
  cfb: 'https://www.espn.com/espn/rss/ncf/news',
  nba: 'https://www.espn.com/espn/rss/nba/news',
  mlb: 'https://www.espn.com/espn/rss/mlb/news',
  nhl: 'https://www.espn.com/espn/rss/nhl/news',
};

function extractTag(b, re) { const m = b.match(re); return m ? m[1].trim() : null; }
function decodeXml(s) {
  if (!s) return s;
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = decodeXml(extractTag(block, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/));
    const link  = decodeXml(extractTag(block, /<link>([\s\S]*?)<\/link>/));
    const pub   = decodeXml(extractTag(block, /<pubDate>([\s\S]*?)<\/pubDate>/));
    const desc  = decodeXml(extractTag(block, /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/));
    const img   = decodeXml(extractTag(block, /<media:thumbnail[^>]*url="([^"]+)"/) || extractTag(block, /<media:content[^>]*url="([^"]+)"/));
    if (!title) continue;
    items.push({ title, link, publishedAt: pub, description: desc, image: img });
  }
  return items;
}

export async function handleNews(req, res) {
  const { league, teamName, teamCity } = req.query || {};
  if (!league || !RSS_URL[league]) return res.status(400).json({ error: 'invalid league' });

  const key = `news:${league}:${(teamName || '').toLowerCase()}:${(teamCity || '').toLowerCase()}`;
  const hit = NEWS_CACHE.get(key);
  if (hit && Date.now() - hit.at < NEWS_CACHE_MS) return res.status(200).json(hit.payload);

  let items = [];
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

  if (items.length < 3 && process.env.NEWSDATA_API_KEY && teamName) {
    try {
      const q = encodeURIComponent(`"${teamName}" ${teamCity || ''} ${league.toUpperCase()}`.trim());
      const url = `https://newsdata.io/api/1/news?apikey=${process.env.NEWSDATA_API_KEY}&q=${q}&language=en&category=sports`;
      const r2 = await fetch(url);
      if (r2.ok) {
        const j = await r2.json();
        const extra = (j?.results || []).slice(0, 8).map((it) => ({
          title: it.title, link: it.link, publishedAt: it.pubDate,
          image: it.image_url, description: it.description,
          source: it.source_id || 'NewsData.io',
        }));
        const seen = new Set(items.map((i) => i.link));
        for (const e of extra) if (!seen.has(e.link)) items.push(e);
      }
    } catch {}
  }
  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  items = items.slice(0, 12);
  const payload = { items, source: items[0]?.source || 'ESPN' };
  NEWS_CACHE.set(key, { at: Date.now(), payload });
  res.status(200).json(payload);
}
