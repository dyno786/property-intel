import { withApi, fetchWithTimeout as fetch } from '../lib/http.js';
// api/news.js - Property News Feed
// Fetches RSS from multiple UK property sources, returns structured data
// Claude summarises each story in plain English for a Leeds investor

const FEEDS = [
  { name: 'Property Reporter',  url: 'https://propertyreporter.co.uk/feed/', category: 'Market' },
  { name: 'Landlord Today',     url: 'https://www.landlordtoday.co.uk/rss',  category: 'Landlord' },
  { name: 'Property118',        url: 'https://www.property118.com/feed/',     category: 'Investor' },
  { name: 'Estate Agent Today', url: 'https://www.estateagenttoday.co.uk/rss',category: 'Market' },
  { name: 'Property Industry Eye',url:'https://propertyindustryeye.com/feed/',category: 'Market' },
  { name: 'BBC Business',       url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'Economy' },
  { name: 'Yorkshire Post Biz', url: 'https://www.yorkshirepost.co.uk/business/rss',   category: 'Yorkshire' },
];

function parseRSS(xml, sourceName, category) {
  const items = [];
  // Try RSS <item> format
  const parts = xml.split(/<item[\s>]/i).slice(1);
  for (const part of parts.slice(0, 5)) {
    const get = tag => {
      const m = part.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,' ').trim() : '';
    };
    const linkM = part.match(/<link>([^<]+)<\/link>/i) || part.match(/<link[^>]+href=["']([^"']+)["']/i);
    const title = get('title');
    if (!title || title.length < 5) continue;
    items.push({
      title,
      description: (get('description') || get('summary') || '').substring(0, 400),
      pubDate:     get('pubDate') || get('updated') || get('dc:date') || '',
      link:        linkM ? linkM[1].trim() : '',
      source:      sourceName,
      category,
    });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CCPropertyIntel/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Encoding': 'identity',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const text = await r.text();
    return parseRSS(text, feed.name, feed.category);
  } catch { return []; }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate'); // cache 30min

  // Fetch all feeds in parallel
  const results = await Promise.all(FEEDS.map(fetchFeed));
  let allItems = results.flat();

  // Sort by date desc
  allItems.sort((a,b) => {
    try { return new Date(b.pubDate) - new Date(a.pubDate); } catch { return 0; }
  });

  // Deduplicate by title similarity
  const seen = new Set();
  allItems = allItems.filter(item => {
    const key = item.title.toLowerCase().substring(0,40);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  // Top 15 items for summarisation
  const toSummarise = allItems.slice(0, 15);
  const summarised = toSummarise; // Public news does not incur anonymous AI charges.

  // Format dates
  const formatted = summarised.map(item => {
    let dateStr = '—';
    try { if (item.pubDate) dateStr = new Date(item.pubDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); } catch {}
    return { ...item, dateFormatted: dateStr };
  });

  res.status(200).json({
    success:   true,
    count:     formatted.length,
    news:      formatted,
    construction: [], // Undated, unverified construction estimates are not current news.
    fetchedAt: new Date().toISOString(),
  });
}

export default withApi(handler, ['GET']);
