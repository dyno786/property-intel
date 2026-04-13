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

// BCIS / construction cost headlines (static quarterly data, updated manually)
const CONSTRUCTION_UPDATES = [
  { title: 'Timber & structural materials up 8% Q1 2026', category: 'Build Costs', sentiment: 'bad',
    summary: 'Timber and structural steel costs rose 8% this quarter. If you budgeted refurb costs from 2025 figures, add at least 8-10% on materials now. Labour costs more stable.' },
  { title: 'Yorkshire builder availability: 6-week lead time', category: 'Build Costs', sentiment: 'neutral',
    summary: 'Good tradespeople in Leeds and Bradford are booked 5-6 weeks ahead. Always secure your builder before you exchange — delays on a bridging loan cost real money.' },
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

async function summariseWithClaude(items) {
  if (!process.env.ANTHROPIC_API_KEY || items.length === 0) return items;
  try {
    const prompt = `You are a property investment analyst for CC Properties Leeds, a Yorkshire BTL and commercial property investor.

For each news headline below, write ONE plain-English sentence (max 20 words) explaining what it means specifically for a Leeds/Yorkshire property investor. Be practical and direct.

Also assign:
- sentiment: "good", "bad", or "neutral" (from investor perspective)
- impact: "high", "medium", or "low"

Return JSON array only — no markdown, no preamble:
[{"index":0,"summary":"...","sentiment":"good","impact":"high"}, ...]

Headlines:
${items.slice(0,12).map((item,i) => `${i}. ${item.title}`).join('\n')}`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) return items;
    const data = await resp.json();
    const raw  = data.content?.[0]?.text || '[]';
    const clean = raw.replace(/```json|```/g,'').trim();
    const summaries = JSON.parse(clean);
    return items.map((item, i) => {
      const s = summaries.find(x => x.index === i);
      return s ? { ...item, summary: s.summary, sentiment: s.sentiment, impact: s.impact } : item;
    });
  } catch { return items; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
  const summarised  = await summariseWithClaude(toSummarise);

  // Format dates
  const formatted = summarised.map(item => {
    let dateStr = '—';
    try { if (item.pubDate) dateStr = new Date(item.pubDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); } catch {}
    return { ...item, dateFormatted: dateStr };
  });

  // Add static construction updates
  const constructionItems = CONSTRUCTION_UPDATES.map(u => ({
    ...u, source: 'BCIS / FMB', dateFormatted: 'Q1 2026', impact: 'medium', link: '#'
  }));

  res.status(200).json({
    success:   true,
    count:     formatted.length,
    news:      formatted,
    construction: constructionItems,
    fetchedAt: new Date().toISOString(),
  });
}
