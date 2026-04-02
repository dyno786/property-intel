// api/insolvency.js
// The Gazette Linked Data API - designed for automated access
// No RSS - uses their JSON/XML data service endpoints
// https://www.thegazette.co.uk/data/formats

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const REGION_CONFIG = {
  leeds:        { text: 'leeds',        place: 'Leeds' },
  bradford:     { text: 'bradford',     place: 'Bradford' },
  wakefield:    { text: 'wakefield',    place: 'Wakefield' },
  sheffield:    { text: 'sheffield',    place: 'Sheffield' },
  huddersfield: { text: 'huddersfield', place: 'Huddersfield' },
  yorkshire:    { text: 'yorkshire',    place: 'Yorkshire' },
  national:     { text: '',             place: '' }
};

const AREA_KEYWORDS = {
  leeds:        ['leeds','chapeltown','harehills','armley','beeston','roundhay','headingley'],
  bradford:     ['bradford','shipley','keighley','bingley'],
  wakefield:    ['wakefield','castleford','pontefract'],
  sheffield:    ['sheffield','rotherham'],
  huddersfield: ['huddersfield','kirklees','halifax']
};

function detectArea(text) {
  const lower = (text||'').toLowerCase();
  for (const [area, kws] of Object.entries(AREA_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return area;
  }
  return 'other';
}

function getDateRange(months) {
  const now  = new Date();
  const from = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const pad  = (n) => String(n).padStart(2,'0');
  const iso  = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const disp = (d) => d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  return { from, to: now, isoFrom: iso(from), isoTo: iso(now), dispFrom: disp(from), dispTo: disp(now) };
}

async function tryFetch(url, headers) {
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return { ok: false, status: r.status, body: '' };
    const body = await r.text();
    return { ok: true, body };
  } catch(e) {
    return { ok: false, status: 0, body: '', error: e.message };
  }
}

function parseAtom(xml) {
  const items = [];
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  for (const entry of entries) {
    const get = (tag) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim() : '';
    };
    const getLinkHref = () => {
      const m = entry.match(/<link[^>]+href=["']([^"']+)["']/i);
      return m ? m[1] : '';
    };
    const title   = get('title');
    const summary = get('summary') || get('content');
    const updated = get('updated') || get('published');
    const link    = getLinkHref();
    const cat     = entry.match(/<category[^>]+term=["']([^"']+)["']/i)?.[1] || '';
    if (title) items.push({ title, description: summary.substring(0,400), pubDate: updated, link, category: cat });
  }
  return items;
}

function parseRSS(xml) {
  const items = [];
  const parts = xml.split(/<item[\s>]/i).slice(1);
  for (const part of parts) {
    const get = (tag) => {
      const m = part.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim() : '';
    };
    const getLinkHref = () => {
      const m = part.match(/<link[^>]*>([^<]+)</i) || part.match(/<link[^>]+href=["']([^"']+)["']/i);
      return m ? m[1].trim() : '';
    };
    const title = get('title');
    if (title) items.push({
      title,
      description: get('description').substring(0,400),
      pubDate:     get('pubDate') || get('dc:date'),
      link:        getLinkHref() || get('guid'),
      category:    get('category')
    });
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const region    = (req.query.region || 'leeds').toLowerCase();
  const months    = Math.min(parseInt(req.query.months || '3'), 6);
  const breakdown = req.query.breakdown === 'true';
  const cfg       = REGION_CONFIG[region] || REGION_CONFIG.leeds;
  const { from, to, isoFrom, isoTo, dispFrom, dispTo } = getDateRange(months);

  const txt = encodeURIComponent(cfg.text || '');
  const debug = { tried: [], working: null };

  // Headers that mimic a real browser request
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none'
  };

  // Gazette Linked Data endpoints - designed for automated access
  // See: https://www.thegazette.co.uk/data/formats
  const endpoints = [
    // Linked Data API - Atom format
    cfg.text
      ? `${GAZETTE_BASE}/all-notices/data.feed?text=${txt}&category=insolvency&format=atom&results-page=1`
      : `${GAZETTE_BASE}/all-notices/data.feed?category=insolvency&format=atom&results-page=1`,
    // With date filter
    cfg.text
      ? `${GAZETTE_BASE}/all-notices/data.feed?text=${txt}&category=insolvency&start-publish-date=${isoFrom}&end-publish-date=${isoTo}&format=atom`
      : `${GAZETTE_BASE}/all-notices/data.feed?category=insolvency&start-publish-date=${isoFrom}&end-publish-date=${isoTo}&format=atom`,
    // Insolvency-specific feed
    cfg.text
      ? `${GAZETTE_BASE}/insolvency/data.feed?text=${txt}&format=atom&results-page=1`
      : `${GAZETTE_BASE}/insolvency/data.feed?format=atom&results-page=1`,
    // RSS format
    cfg.text
      ? `${GAZETTE_BASE}/insolvency/data.feed?text=${txt}&format=rss&results-page=1`
      : `${GAZETTE_BASE}/insolvency/data.feed?format=rss&results-page=1`,
    // Notice type specific - Winding Up
    cfg.text
      ? `${GAZETTE_BASE}/all-notices/data.feed?text=${txt}&notice-type=2100&format=atom`
      : `${GAZETTE_BASE}/all-notices/data.feed?notice-type=2100&format=atom`,
    // Notice type - Administration
    cfg.text
      ? `${GAZETTE_BASE}/all-notices/data.feed?text=${txt}&notice-type=2150&format=atom`
      : `${GAZETTE_BASE}/all-notices/data.feed?notice-type=2150&format=atom`,
  ];

  let allItems = [];

  for (const url of endpoints) {
    const { ok, body, status } = await tryFetch(url, browserHeaders);
    const hasEntries = body.includes('<entry') || body.includes('<item');
    debug.tried.push({ url: url.substring(url.indexOf('?')), status: ok ? 200 : status, hasData: hasEntries });

    if (ok && hasEntries) {
      debug.working = url;
      const items = body.includes('<entry') ? parseAtom(body) : parseRSS(body);
      allItems.push(...items);

      // Fetch pages 2-3 if we got results
      if (items.length >= 10) {
        for (const page of [2, 3]) {
          const pageUrl = url.includes('results-page') 
            ? url.replace(/results-page=\d+/, `results-page=${page}`)
            : url + `&results-page=${page}`;
          const { ok: ok2, body: body2 } = await tryFetch(pageUrl, browserHeaders);
          if (ok2 && body2.includes('<entry') || body2?.includes('<item')) {
            const items2 = body2.includes('<entry') ? parseAtom(body2) : parseRSS(body2);
            allItems.push(...items2);
          }
        }
      }
      break;
    }
  }

  // Deduplicate
  const seen = new Set();
  allItems = allItems.filter(item => {
    const key = item.link || `${item.title}|${item.pubDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Format
  const formatted = allItems.map(item => {
    const area = (region === 'national' || region === 'yorkshire')
      ? detectArea(item.title + ' ' + item.description)
      : region;
    let parsedDate = '—';
    try { if (item.pubDate) parsedDate = new Date(item.pubDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); } catch(e){}
    return {
      title:       item.title,
      description: item.description,
      area,
      category:    item.category || 'Corporate Insolvency',
      date:        parsedDate,
      rawDate:     item.pubDate || '',
      link:        item.link || `${GAZETTE_BASE}/insolvency`,
      source:      'The Gazette'
    };
  }).sort((a,b) => new Date(b.rawDate||0) - new Date(a.rawDate||0));

  // Breakdowns
  const areaBreakdown = {};
  const categoryBreakdown = {};
  if (breakdown) {
    for (const item of formatted) {
      if (!areaBreakdown[item.area]) areaBreakdown[item.area] = [];
      areaBreakdown[item.area].push(item);
      categoryBreakdown[item.category] = (categoryBreakdown[item.category]||0) + 1;
    }
  }

  res.status(200).json({
    success: true,
    region,
    months,
    dateRange: { from: dispFrom, to: dispTo },
    count: formatted.length,
    data: formatted,
    areaBreakdown,
    categoryBreakdown,
    debug,
    gazetteLinks: {
      search:  `${GAZETTE_BASE}/insolvency${cfg.text ? '?text='+txt : ''}`,
      winding: `${GAZETTE_BASE}/insolvency?text=${txt}&notice-type=2100`,
      admin:   `${GAZETTE_BASE}/insolvency?text=${txt}&notice-type=2150`
    },
    source: 'The Gazette',
    fetchedAt: new Date().toISOString()
  });
}
