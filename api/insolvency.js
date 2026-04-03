// api/insolvency.js - v8
// The Gazette - show all notices, remove strict category filter
// Let users see everything and filter themselves

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const REGION_CONFIG = {
  leeds:        { text: 'leeds' },
  bradford:     { text: 'bradford' },
  wakefield:    { text: 'wakefield' },
  sheffield:    { text: 'sheffield' },
  huddersfield: { text: 'huddersfield' },
  yorkshire:    { text: 'yorkshire' },
  national:     { text: null }
};

const AREA_KEYWORDS = {
  leeds:        ['leeds','chapeltown','harehills','armley','beeston','roundhay','headingley','morley','pudsey'],
  bradford:     ['bradford','shipley','keighley','bingley','ilkley'],
  wakefield:    ['wakefield','castleford','pontefract','ossett'],
  sheffield:    ['sheffield','rotherham','darnall'],
  huddersfield: ['huddersfield','kirklees','halifax','brighouse']
};

// Categories we want to highlight as high priority
const HIGH_PRIORITY = new Set([
  'appointment of liquidators','appointment of administrators',
  'appointment of receivers','winding-up orders',
  'petitions to wind up','petitions to wind up (companies)',
  'resolution for voluntary winding-up','resolutions for winding-up',
  'administration orders','creditors voluntary liquidation',
  'liquidation by the court','members voluntary liquidation',
  'meetings of creditors'
]);

function detectArea(text) {
  const lower = (text||'').toLowerCase();
  for (const [area, kws] of Object.entries(AREA_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return area;
  }
  return 'other';
}

function getPriority(category) {
  const lower = (category||'').toLowerCase();
  if (HIGH_PRIORITY.has(lower)) return 'high';
  if (lower.includes('liquidat') || lower.includes('wind') || lower.includes('administrat') || lower.includes('insolven') || lower.includes('receiv') || lower.includes('creditor')) return 'high';
  if (lower.includes('notice') || lower.includes('meeting') || lower.includes('dividend')) return 'medium';
  return 'low';
}

function parseAtom(xml) {
  const items = [];
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  for (const entry of entries) {
    const get = (tag) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,' ').trim() : '';
    };
    const getLinkHref = () => {
      const m = entry.match(/<link[^>]+href=["']([^"']+)["']/i);
      return m ? m[1] : '';
    };
    const title    = get('title');
    const summary  = (get('summary') || get('content')).replace(/\s+/g,' ').substring(0,500);
    const updated  = get('updated') || get('published');
    const link     = getLinkHref();
    const catMatch = [...entry.matchAll(/<category[^>]+term=["']([^"']+)["']/gi)];
    const cats     = catMatch.map(m => m[1]).filter(Boolean);
    const category = cats[0] || 'Corporate Notice';
    if (title && title.length > 2) {
      items.push({ title, description: summary, pubDate: updated, link, category, allCats: cats });
    }
  }
  return items;
}

async function fetchPage(url) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/atom+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-GB,en;q=0.9'
      }
    });
    if (!r.ok) return null;
    const body = await r.text();
    if (!body.includes('<entry')) return null;
    return parseAtom(body);
  } catch(e) { return null; }
}

function getDateRange(months) {
  const now  = new Date();
  const from = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const disp = (d) => d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  return { dispFrom: disp(from), dispTo: disp(now) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const region    = (req.query.region || 'leeds').toLowerCase();
  const months    = Math.min(parseInt(req.query.months || '3'), 6);
  const breakdown = req.query.breakdown === 'true';
  const cfg       = REGION_CONFIG[region] || REGION_CONFIG.leeds;
  const { dispFrom, dispTo } = getDateRange(months);

  const allItems = [];
  const seen     = new Set();

  // Confirmed working endpoint from last night
  const baseUrl = cfg.text
    ? `${GAZETTE_BASE}/all-notices/data.feed?text=${encodeURIComponent(cfg.text)}&category=insolvency&format=atom`
    : `${GAZETTE_BASE}/all-notices/data.feed?category=insolvency&format=atom`;

  // Fetch pages 1-5
  for (let page = 1; page <= 5; page++) {
    const items = await fetchPage(`${baseUrl}&results-page=${page}`);
    if (!items || items.length === 0) break;
    for (const item of items) {
      const key = item.link || `${item.title}|${item.pubDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allItems.push(item);
    }
    if (items.length < 5) break; // last page
  }

  // Format ALL items - no filtering, let users see everything
  const formatted = allItems.map(item => {
    const searchText = item.title + ' ' + item.description;
    const area = (region === 'national' || region === 'yorkshire')
      ? detectArea(searchText) : region;

    let parsedDate = '—';
    try { if (item.pubDate) parsedDate = new Date(item.pubDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); } catch(e){}

    const priority = getPriority(item.category);

    return {
      title:       item.title,
      description: item.description,
      area,
      category:    item.category,
      priority,    // high | medium | low
      date:        parsedDate,
      rawDate:     item.pubDate || '',
      link:        item.link || `${GAZETTE_BASE}/insolvency`,
      source:      'The Gazette'
    };
  }).sort((a,b) => {
    // Sort by priority first, then date
    const p = { high:0, medium:1, low:2 };
    if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
    return new Date(b.rawDate||0) - new Date(a.rawDate||0);
  });

  // Breakdowns
  const areaBreakdown = {};
  const categoryBreakdown = {};
  for (const item of formatted) {
    if (breakdown) {
      if (!areaBreakdown[item.area]) areaBreakdown[item.area] = [];
      areaBreakdown[item.area].push(item);
    }
    categoryBreakdown[item.category] = (categoryBreakdown[item.category]||0) + 1;
  }

  const highPriority = formatted.filter(i => i.priority === 'high');

  res.status(200).json({
    success:       true,
    region,
    months,
    dateRange:     { from: dispFrom, to: dispTo },
    count:         formatted.length,
    highPriority:  highPriority.length,
    data:          formatted,
    areaBreakdown,
    categoryBreakdown,
    gazetteLinks: {
      search:  `${GAZETTE_BASE}/insolvency${cfg.text ? '?text='+encodeURIComponent(cfg.text) : ''}`,
      winding: `${GAZETTE_BASE}/insolvency?text=${encodeURIComponent(cfg.text||'')}&notice-type=2100`,
      admin:   `${GAZETTE_BASE}/insolvency?text=${encodeURIComponent(cfg.text||'')}&notice-type=2150`
    },
    source:    'The Gazette',
    fetchedAt: new Date().toISOString()
  });
}
