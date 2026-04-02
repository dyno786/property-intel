// api/insolvency.js
// The Gazette - insolvency notices by area OR national
// Supports: region=leeds|bradford|wakefield|sheffield|huddersfield|national|yorkshire
// Returns notices filtered by location with area breakdown

const GAZETTE_BASE = 'https://www.thegazette.co.uk';
const NOTICE_TYPES = ['2100', '2150', '2160', '2200'];

const NOTICE_LABELS = {
  '2100': 'Winding Up / Liquidation',
  '2150': 'Administration',
  '2160': 'Receivership',
  '2200': 'Voluntary Arrangement'
};

// Search terms per region
const REGION_TERMS = {
  leeds:        ['leeds'],
  bradford:     ['bradford'],
  wakefield:    ['wakefield'],
  sheffield:    ['sheffield'],
  huddersfield: ['huddersfield', 'kirklees'],
  yorkshire:    ['yorkshire', 'leeds', 'bradford', 'sheffield', 'wakefield', 'huddersfield'],
  national:     [''] // empty = no text filter = all national notices
};

// Keywords to identify which area a notice belongs to
const AREA_KEYWORDS = {
  leeds:        ['leeds', 'ls1', 'ls2', 'ls3', 'ls6', 'ls7', 'ls8', 'ls9', 'ls10', 'ls11', 'ls12'],
  bradford:     ['bradford', 'bd1', 'bd2', 'bd3', 'bd4', 'bd5'],
  wakefield:    ['wakefield', 'wf1', 'wf2', 'wf3', 'wf4'],
  sheffield:    ['sheffield', 's1', 's2', 's3', 's6', 's10'],
  huddersfield: ['huddersfield', 'kirklees', 'hd1', 'hd2', 'hd3'],
  yorkshire:    ['yorkshire', 'west yorkshire', 'south yorkshire', 'north yorkshire']
};

function detectArea(text) {
  const lower = (text||'').toLowerCase();
  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return area;
  }
  return 'national';
}

function parseXML(xml) {
  const items = [];
  const parts = xml.split(/<item[\s>]/i).slice(1);
  for (const part of parts) {
    const get = (tag) => {
      const m = part.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').trim() : '';
    };
    const title   = get('title');
    const desc    = get('description').replace(/\s+/g,' ').substring(0,500);
    const link    = get('link');
    const pubDate = get('pubDate');
    const cat     = get('category');
    if (title) items.push({ title, description: desc, link, pubDate, category: cat });
  }
  return items;
}

async function fetchFeed(url) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CCPropertyIntel/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    if (!r.ok) return { items: [], error: `HTTP ${r.status}` };
    const xml = await r.text();
    return { items: parseXML(xml), error: null };
  } catch(e) {
    return { items: [], error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const region    = (req.query.region || 'leeds').toLowerCase();
  const breakdown = req.query.breakdown === 'true'; // return area breakdown
  const terms     = REGION_TERMS[region] || REGION_TERMS.leeds;

  const allItems = [];
  const errors   = [];
  let feedsChecked = 0;

  // Fetch notices for each search term + notice type combination
  for (const term of terms) {
    for (const noticeType of NOTICE_TYPES) {
      feedsChecked++;
      const url = term
        ? `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(term)}&notice-type=${noticeType}&format=rss`
        : `${GAZETTE_BASE}/all-notices/notice?notice-type=${noticeType}&format=rss`;

      const { items, error } = await fetchFeed(url);
      if (error) errors.push(`${term||'national'} / ${noticeType}: ${error}`);

      for (const item of items) {
        allItems.push({
          ...item,
          noticeType,
          noticeLabel: NOTICE_LABELS[noticeType] || 'Insolvency',
          searchTerm: term
        });
      }
    }
  }

  // Deduplicate by title+date
  const seen    = new Set();
  const unique  = allItems.filter(item => {
    const key = `${item.title}|${item.pubDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Format
  const formatted = unique.map(item => {
    const area = region === 'national' || region === 'yorkshire'
      ? detectArea(item.title + ' ' + item.description)
      : region;

    return {
      title:       item.title,
      description: item.description,
      address:     area.charAt(0).toUpperCase() + area.slice(1) + ' area',
      ref:         item.noticeLabel,
      category:    item.noticeLabel,
      area,
      date:        item.pubDate
        ? new Date(item.pubDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
        : '—',
      link:        item.link || `${GAZETTE_BASE}/insolvency`,
      source:      'The Gazette'
    };
  });

  // Sort by date (newest first)
  formatted.sort((a,b) => new Date(b.date) - new Date(a.date));

  // Area breakdown for national/yorkshire view
  const areaBreakdown = {};
  if (breakdown || region === 'national' || region === 'yorkshire') {
    for (const item of formatted) {
      const a = item.area;
      if (!areaBreakdown[a]) areaBreakdown[a] = [];
      areaBreakdown[a].push(item);
    }
  }

  // Category breakdown
  const categoryBreakdown = {};
  for (const item of formatted) {
    const c = item.category;
    categoryBreakdown[c] = (categoryBreakdown[c] || 0) + 1;
  }

  res.status(200).json({
    success:           true,
    region,
    count:             formatted.length,
    data:              formatted,
    areaBreakdown,
    categoryBreakdown,
    feedsChecked,
    errors:            errors.slice(0,5),
    gazetteLinks: {
      search:    `${GAZETTE_BASE}/insolvency/search?text=${encodeURIComponent(terms[0]||'')}`,
      winding:   `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(terms[0]||'')}&notice-type=2100`,
      admin:     `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(terms[0]||'')}&notice-type=2150`
    },
    source:    'The Gazette',
    fetchedAt: new Date().toISOString()
  });
}
