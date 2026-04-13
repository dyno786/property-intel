// api/insolvency.js — v9 FINAL
// Uses specific Gazette notice-type codes fetched in parallel
// No category filter — shows all real insolvency notices, sorted by priority

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const NOTICE_TYPES = [
  { code: '2100', label: 'Winding Up / Liquidation',      priority: 'high'   },
  { code: '2101', label: 'Petitions to Wind Up',           priority: 'high'   },
  { code: '2102', label: 'Winding Up Orders',              priority: 'high'   },
  { code: '2150', label: 'Administration',                 priority: 'high'   },
  { code: '2151', label: 'Appointment of Administrators',  priority: 'high'   },
  { code: '2160', label: 'Receivership',                   priority: 'high'   },
  { code: '2200', label: 'Voluntary Arrangement',          priority: 'medium' },
];

const REGION_CONFIG = {
  leeds:        { text: 'leeds'        },
  bradford:     { text: 'bradford'     },
  wakefield:    { text: 'wakefield'    },
  sheffield:    { text: 'sheffield'    },
  huddersfield: { text: 'huddersfield' },
  yorkshire:    { text: 'yorkshire'    },
  national:     { text: null           },
};

const AREA_KEYWORDS = {
  leeds:        ['leeds','chapeltown','harehills','armley','beeston','roundhay','headingley','morley','pudsey','garforth','ls1','ls2','ls3','ls6','ls7','ls8','ls9','ls11'],
  bradford:     ['bradford','shipley','keighley','bingley','ilkley','manningham'],
  wakefield:    ['wakefield','castleford','pontefract','ossett','normanton'],
  sheffield:    ['sheffield','rotherham','darnall','hillsborough'],
  huddersfield: ['huddersfield','kirklees','halifax','brighouse','dewsbury'],
};

function detectArea(text) {
  const lower = (text || '').toLowerCase();
  for (const [area, kws] of Object.entries(AREA_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return area;
  }
  return 'other';
}

function parseAtom(xml, label, priority) {
  const items = [];
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  for (const entry of entries) {
    const get = tag => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,' ').trim() : '';
    };
    const linkM = entry.match(/<link[^>]+href=["']([^"']+)["']/i);
    const link  = linkM ? linkM[1] : '';
    const title = get('title');
    if (!title || title.length < 3) continue;
    items.push({
      title,
      description: (get('summary') || get('content')).replace(/\s+/g,' ').substring(0, 500),
      pubDate:     get('updated') || get('published') || '',
      link,
      noticeType:  label,
      priority,
    });
  }
  return items;
}

async function fetchFeed(url) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; CCPropertyIntel/1.0)',
        'Accept':          'application/atom+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
    });
    if (!r.ok) return null;
    const text = await r.text();
    return text.includes('<entry') ? text : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const region    = (req.query.region || 'leeds').toLowerCase();
  const months    = Math.min(parseInt(req.query.months || '3'), 6);
  const breakdown = req.query.breakdown === 'true';
  const cfg       = REGION_CONFIG[region] || REGION_CONFIG.leeds;

  const seen     = new Set();
  const allItems = [];
  const debugFeeds = [];

  // Fetch all notice types in parallel
  await Promise.all(NOTICE_TYPES.map(async ({ code, label, priority }) => {
    const base = cfg.text
      ? `${GAZETTE_BASE}/all-notices/data.feed?notice-type=${code}&text=${encodeURIComponent(cfg.text)}&format=atom`
      : `${GAZETTE_BASE}/all-notices/data.feed?notice-type=${code}&format=atom`;

    const xml = await fetchFeed(`${base}&results-page=1`);
    const parsed = xml ? parseAtom(xml, label, priority) : [];
    debugFeeds.push({ code, label, count: parsed.length, ok: !!xml });

    for (const item of parsed) {
      const key = item.link || `${item.title}|${item.pubDate}`;
      if (seen.has(key)) continue;
      seen.add(key); allItems.push(item);
    }

    // Fetch page 2 if page 1 was full
    if (parsed.length >= 10) {
      const xml2 = await fetchFeed(`${base}&results-page=2`);
      if (xml2) {
        for (const item of parseAtom(xml2, label, priority)) {
          const key = item.link || `${item.title}|${item.pubDate}`;
          if (seen.has(key)) continue;
          seen.add(key); allItems.push(item);
        }
      }
    }
  }));

  const PORDER = { high: 0, medium: 1, low: 2 };

  const formatted = allItems.map(item => {
    const area = (region === 'national' || region === 'yorkshire')
      ? detectArea(item.title + ' ' + item.description)
      : region;
    let date = '—';
    try { if (item.pubDate) date = new Date(item.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch {}
    return { ...item, area, date };
  }).sort((a, b) => {
    const pd = (PORDER[a.priority] ?? 1) - (PORDER[b.priority] ?? 1);
    return pd !== 0 ? pd : new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
  });

  // Area breakdown
  const areaBreakdown = {};
  if (breakdown) {
    for (const item of formatted) {
      if (!areaBreakdown[item.area]) areaBreakdown[item.area] = [];
      areaBreakdown[item.area].push(item);
    }
  }

  // Category count
  const categoryBreakdown = {};
  for (const item of formatted) {
    categoryBreakdown[item.noticeType] = (categoryBreakdown[item.noticeType] || 0) + 1;
  }

  res.status(200).json({
    success:           true,
    region, months,
    count:             formatted.length,
    highPriority:      formatted.filter(i => i.priority === 'high').length,
    data:              formatted,
    areaBreakdown,
    categoryBreakdown,
    debug:             debugFeeds,
    gazetteLinks: {
      search:  `${GAZETTE_BASE}/insolvency${cfg.text ? '?text=' + encodeURIComponent(cfg.text) : ''}`,
      winding: `${GAZETTE_BASE}/all-notices/notice?notice-type=2100${cfg.text ? '&text=' + encodeURIComponent(cfg.text) : ''}`,
      admin:   `${GAZETTE_BASE}/all-notices/notice?notice-type=2150${cfg.text ? '&text=' + encodeURIComponent(cfg.text) : ''}`,
    },
    source:    'The Gazette',
    fetchedAt: new Date().toISOString(),
  });
}
