// api/insolvency.js - v7
// The Gazette Linked Data API - working endpoint confirmed
// Filters to corporate insolvency only, fetches multiple pages, proper area detection

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

// Corporate insolvency notice categories only
const INSOLVENCY_CATEGORIES = new Set([
  'appointment of liquidators',
  'appointment of administrators', 
  'appointment of receivers',
  'winding-up orders',
  'petitions to wind up',
  'petitions to wind up (companies)',
  'notices to creditors',
  'resolution for voluntary winding-up',
  'resolutions for winding-up',
  'administration orders',
  'receivership',
  'voluntary arrangement',
  'creditors voluntary liquidation',
  'members voluntary liquidation',
  'liquidation by the court',
  'winding up',
  'insolvency',
  'annual liquidation meetings',
  'final meetings',
  'meetings of creditors',
  'deemed consent',
  'notice of dividends',
  'notice of intended dividends'
]);

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
  leeds:        ['leeds','chapeltown','harehills','armley','beeston','roundhay','headingley','morley','pudsey','garforth'],
  bradford:     ['bradford','shipley','keighley','bingley','ilkley'],
  wakefield:    ['wakefield','castleford','pontefract','ossett','normanton'],
  sheffield:    ['sheffield','rotherham','darnall','hillsborough'],
  huddersfield: ['huddersfield','kirklees','halifax','brighouse','dewsbury']
};

function detectArea(text) {
  const lower = (text||'').toLowerCase();
  for (const [area, kws] of Object.entries(AREA_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return area;
  }
  return 'other';
}

function isInsolvencyNotice(category) {
  if (!category) return false;
  const lower = category.toLowerCase();
  return INSOLVENCY_CATEGORIES.has(lower) ||
    lower.includes('liquidat') ||
    lower.includes('administrat') ||
    lower.includes('insolven') ||
    lower.includes('wind') ||
    lower.includes('receiv') ||
    lower.includes('creditor') ||
    lower.includes('winding');
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
    const summary  = (get('summary') || get('content')).substring(0,500);
    const updated  = get('updated') || get('published');
    const link     = getLinkHref();
    const catMatch = entry.match(/<category[^>]+term=["']([^"']+)["']/gi) || [];
    const cats     = catMatch.map(c => { const m = c.match(/term=["']([^"']+)["']/i); return m ? m[1] : ''; }).filter(Boolean);
    const category = cats.find(c => isInsolvencyNotice(c)) || cats[0] || '';

    if (title) items.push({ title, description: summary, pubDate: updated, link, category, allCategories: cats });
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

  // Build base URL - confirmed working endpoint
  const baseUrl = cfg.text
    ? `${GAZETTE_BASE}/all-notices/data.feed?text=${encodeURIComponent(cfg.text)}&category=insolvency&format=atom`
    : `${GAZETTE_BASE}/all-notices/data.feed?category=insolvency&format=atom`;

  // Fetch up to 5 pages (50 results per page = up to 250 results)
  for (let page = 1; page <= 5; page++) {
    const url   = `${baseUrl}&results-page=${page}`;
    const items = await fetchPage(url);
    if (!items || items.length === 0) break;

    for (const item of items) {
      const key = item.link || `${item.title}|${item.pubDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allItems.push(item);
    }

    // If less than 10 results, no more pages
    if (items.length < 10) break;
  }

  // Filter to insolvency-relevant notices only
  const insolvencyItems = allItems.filter(item =>
    isInsolvencyNotice(item.category) ||
    item.allCategories?.some(c => isInsolvencyNotice(c))
  );

  // Format
  const formatted = insolvencyItems.map(item => {
    const searchText = item.title + ' ' + item.description;
    const area = (region === 'national' || region === 'yorkshire')
      ? detectArea(searchText)
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
  for (const item of formatted) {
    if (breakdown) {
      if (!areaBreakdown[item.area]) areaBreakdown[item.area] = [];
      areaBreakdown[item.area].push(item);
    }
    categoryBreakdown[item.category] = (categoryBreakdown[item.category]||0) + 1;
  }

  res.status(200).json({
    success: true,
    region,
    months,
    dateRange: { from: dispFrom, to: dispTo },
    count:    formatted.length,
    total:    allItems.length,
    filtered: allItems.length - formatted.length,
    data:     formatted,
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
