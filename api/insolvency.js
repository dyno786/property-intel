// api/insolvency.js
// The Gazette - correct feed URL discovered from their website
// Uses data.feed endpoint with location/text/date filters

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

// Leeds City Council local authority code in Gazette system
const REGION_CONFIG = {
  leeds:        { text: 'leeds',        localAuth: 'Leeds City Council' },
  bradford:     { text: 'bradford',     localAuth: 'Bradford Metropolitan District Council' },
  wakefield:    { text: 'wakefield',    localAuth: 'Wakefield Metropolitan District Council' },
  sheffield:    { text: 'sheffield',    localAuth: 'Sheffield City Council' },
  huddersfield: { text: 'huddersfield', localAuth: 'Kirklees Council' },
  yorkshire:    { text: 'yorkshire',    localAuth: null },
  national:     { text: '',             localAuth: null }
};

const AREA_KEYWORDS = {
  leeds:        ['leeds','chapeltown','harehills','armley','beeston','roundhay','headingley'],
  bradford:     ['bradford','shipley','keighley','bingley'],
  wakefield:    ['wakefield','castleford','pontefract','ossett'],
  sheffield:    ['sheffield','rotherham','darnall','hillsborough'],
  huddersfield: ['huddersfield','kirklees','halifax','brighouse']
};

function detectArea(text) {
  const lower = (text||'').toLowerCase();
  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return area;
  }
  return 'other';
}

function parseXML(xml) {
  const items = [];
  const parts = xml.split(/<item[\s>]/i).slice(1);
  for (const part of parts) {
    const get = (tag) => {
      const m = part.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,' ').trim() : '';
    };
    const title   = get('title');
    const desc    = get('description').replace(/\s+/g,' ').substring(0,400);
    const link    = get('link');
    const pubDate = get('pubDate');
    const cat     = get('category');
    const type    = get('notice-type') || get('noticeType') || '';
    if (title && title.length > 1) {
      items.push({ title, description: desc, link, pubDate, category: cat, noticeType: type });
    }
  }
  return items;
}

function getDateRange(months) {
  const now  = new Date();
  const from = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const fmt  = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  return { from, to: now, fromStr: fmt(from), toStr: fmt(now) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const region    = (req.query.region || 'leeds').toLowerCase();
  const months    = Math.min(parseInt(req.query.months || '3'), 6);
  const breakdown = req.query.breakdown === 'true';
  const cfg       = REGION_CONFIG[region] || REGION_CONFIG.leeds;
  const { from, to, fromStr, toStr } = getDateRange(months);

  const allItems = [];
  const errors   = [];
  let feedsChecked = 0;

  // Try multiple URL formats - Gazette has several feed endpoints
  const feedUrls = [];

  // Format 1: insolvency data.feed with text search (their own RSS link from the page)
  if (cfg.text) {
    feedUrls.push(`${GAZETTE_BASE}/insolvency/data.feed?text=${encodeURIComponent(cfg.text)}&start-publish-date=${encodeURIComponent(fromStr)}&end-publish-date=${encodeURIComponent(toStr)}&results-page=1`);
    feedUrls.push(`${GAZETTE_BASE}/insolvency/data.feed?text=${encodeURIComponent(cfg.text)}&results-page=1`);
  } else {
    // National - no text filter
    feedUrls.push(`${GAZETTE_BASE}/insolvency/data.feed?start-publish-date=${encodeURIComponent(fromStr)}&end-publish-date=${encodeURIComponent(toStr)}&results-page=1`);
    feedUrls.push(`${GAZETTE_BASE}/insolvency/data.feed?results-page=1`);
  }

  // Format 2: all-notices with notice-type codes
  const noticeCodes = ['2100','2150','2160','2200'];
  for (const code of noticeCodes) {
    if (cfg.text) {
      feedUrls.push(`${GAZETTE_BASE}/all-notices/notice?notice-type=${code}&text=${encodeURIComponent(cfg.text)}&format=rss&start-publish-date=${encodeURIComponent(fromStr)}&end-publish-date=${encodeURIComponent(toStr)}`);
    } else {
      feedUrls.push(`${GAZETTE_BASE}/all-notices/notice?notice-type=${code}&format=rss`);
    }
  }

  // Format 3: data service feed
  if (cfg.text) {
    feedUrls.push(`${GAZETTE_BASE}/all-notices/data.feed?text=${encodeURIComponent(cfg.text)}&category=insolvency`);
  }

  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Referer': 'https://www.thegazette.co.uk/insolvency'
  };

  for (const url of feedUrls) {
    feedsChecked++;
    try {
      const r = await fetch(url, { headers: fetchHeaders });
      if (!r.ok) {
        errors.push(`HTTP ${r.status}: ${url.substring(50,100)}`);
        continue;
      }
      const contentType = r.headers.get('content-type') || '';
      const text = await r.text();

      // Check if it's actually XML/RSS
      if (!text.includes('<item') && !text.includes('<entry')) {
        errors.push(`Not RSS (${contentType.substring(0,30)}): ${url.substring(50,90)}`);
        continue;
      }

      const items = parseXML(text);
      if (items.length > 0) {
        for (const item of items) allItems.push({ ...item, sourceUrl: url });
        // If we found items, try next page too
        if (items.length >= 10) {
          try {
            const url2 = url.replace('results-page=1','results-page=2').replace(/&results-page=\d+/,'') + (url.includes('results-page') ? '' : '&results-page=2');
            const r2 = await fetch(url2, { headers: fetchHeaders });
            if (r2.ok) {
              const text2 = await r2.text();
              const items2 = parseXML(text2);
              for (const item of items2) allItems.push({ ...item, sourceUrl: url2 });
            }
          } catch(e) {}
        }
        break; // Found working URL format, use it
      }
    } catch(e) {
      errors.push(`Error: ${e.message.substring(0,50)}`);
    }
  }

  // Deduplicate
  const seen   = new Set();
  const unique = allItems.filter(item => {
    const key = item.link || `${item.title}|${item.pubDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Format results
  const formatted = unique.map(item => {
    const area = (region === 'national' || region === 'yorkshire')
      ? detectArea(item.title + ' ' + item.description)
      : region;

    let parsedDate = '—';
    if (item.pubDate) {
      try { parsedDate = new Date(item.pubDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
      catch(e) {}
    }

    return {
      title:       item.title,
      description: item.description,
      area,
      ref:         item.category || item.noticeType || 'Corporate Insolvency',
      category:    item.category || 'Corporate Insolvency',
      date:        parsedDate,
      rawDate:     item.pubDate || '',
      link:        item.link || `${GAZETTE_BASE}/insolvency`,
      source:      'The Gazette'
    };
  });

  // Sort newest first
  formatted.sort((a,b) => {
    const da = a.rawDate ? new Date(a.rawDate) : new Date(0);
    const db = b.rawDate ? new Date(b.rawDate) : new Date(0);
    return db - da;
  });

  // Area breakdown
  const areaBreakdown = {};
  if (breakdown) {
    for (const item of formatted) {
      if (!areaBreakdown[item.area]) areaBreakdown[item.area] = [];
      areaBreakdown[item.area].push(item);
    }
  }

  // Category breakdown
  const categoryBreakdown = {};
  for (const item of formatted) {
    categoryBreakdown[item.category] = (categoryBreakdown[item.category]||0) + 1;
  }

  res.status(200).json({
    success: true,
    region,
    months,
    dateRange: {
      from: from.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }),
      to:   to.toLocaleDateString('en-GB',   { day:'numeric', month:'short', year:'numeric' })
    },
    count:             formatted.length,
    data:              formatted,
    areaBreakdown,
    categoryBreakdown,
    feedsChecked,
    urlsTried:         feedUrls.length,
    errors,
    gazetteLinks: {
      search:  `${GAZETTE_BASE}/insolvency${cfg.text ? '?text='+encodeURIComponent(cfg.text) : ''}`,
      winding: `${GAZETTE_BASE}/insolvency?text=${encodeURIComponent(cfg.text||'')}&notice-type=2100`,
      admin:   `${GAZETTE_BASE}/insolvency?text=${encodeURIComponent(cfg.text||'')}&notice-type=2150`
    },
    source:    'The Gazette',
    fetchedAt: new Date().toISOString()
  });
}
