// api/insolvency.js
// The Gazette Official Public Record - free, no API key needed
// Crown Copyright - Open Government Licence
// Uses their linked data search API to find insolvency notices

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

// Notice type codes for The Gazette
// 2100 = Winding Up / Liquidation
// 2150 = Administration  
// 2160 = Receivership
// 2200 = Voluntary Arrangement

const NOTICE_TYPES = ['2100', '2150', '2160', '2200'];

const REGION_TERMS = {
  leeds:        'leeds',
  bradford:     'bradford',
  wakefield:    'wakefield',
  sheffield:    'sheffield',
  huddersfield: 'huddersfield'
};

function parseXMLItems(xml) {
  const items = [];
  // Split on item tags
  const parts = xml.split(/<item[\s>]/i).slice(1);

  for (const part of parts) {
    const get = (tag) => {
      const cdataMatch = part.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>`, 'i'));
      if (cdataMatch) return cdataMatch[1].trim();
      const match = part.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
      return match ? match[1].replace(/<[^>]+>/g,'').trim() : '';
    };

    const title    = get('title');
    const desc     = get('description').replace(/\s+/g,' ').substring(0, 400);
    const link     = get('link');
    const pubDate  = get('pubDate');
    const category = get('category');

    if (title) {
      items.push({ title, description: desc, link, pubDate, category });
    }
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const region     = (req.query.region || 'leeds').toLowerCase();
  const searchTerm = REGION_TERMS[region] || 'leeds';
  const allItems   = [];
  const debug      = { feedsChecked: 0, totalItems: 0, errors: [] };

  // Fetch multiple notice type feeds
  for (const noticeType of NOTICE_TYPES) {
    try {
      debug.feedsChecked++;

      // Use The Gazette search with text filter for the region
      const url = `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(searchTerm)}&notice-type=${noticeType}&format=rss`;

      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CCPropertyIntel/1.0)',
          'Accept':     'application/rss+xml, application/xml, text/xml, */*'
        }
      });

      if (!r.ok) {
        debug.errors.push(`Notice type ${noticeType}: HTTP ${r.status}`);
        continue;
      }

      const xml   = await r.text();
      const items = parseXMLItems(xml);
      debug.totalItems += items.length;
      allItems.push(...items);

    } catch(e) {
      debug.errors.push(`Notice type ${noticeType}: ${e.message}`);
    }
  }

  // Also try the main search endpoint with location
  try {
    const searchUrl = `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(searchTerm)}&notice-type=2100,2150,2160,2200&format=rss`;
    const r = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CCPropertyIntel/1.0)',
        'Accept': 'application/rss+xml, */*'
      }
    });
    if (r.ok) {
      const xml   = await r.text();
      const items = parseXMLItems(xml);
      allItems.push(...items);
    }
  } catch(e) {}

  // Deduplicate by title
  const seen = new Set();
  const unique = allItems.filter(item => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });

  // Format results
  const formatted = unique.map(item => ({
    title:       item.title,
    description: item.description,
    address:     searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1) + ' area',
    ref:         item.category || 'Insolvency Notice',
    date:        item.pubDate
      ? new Date(item.pubDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
      : '—',
    category:    item.category || 'Corporate Insolvency',
    link:        item.link || `${GAZETTE_BASE}/insolvency`,
    source:      'The Gazette'
  }));

  // If gazette is blocked, return helpful links instead
  const gazetteBlocked = debug.errors.length === NOTICE_TYPES.length;

  res.status(200).json({
    success: true,
    region,
    searchTerm,
    count:          formatted.length,
    data:           formatted,
    gazetteBlocked: gazetteBlocked && formatted.length === 0,
    debug,
    // Always include direct links to The Gazette
    gazetteLinks: [
      {
        label:  `Search "${searchTerm}" insolvency notices`,
        url:    `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(searchTerm)}&notice-type=2100`,
        type:   'Winding Up / Liquidation'
      },
      {
        label:  `Search "${searchTerm}" administration notices`,
        url:    `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(searchTerm)}&notice-type=2150`,
        type:   'Administration'
      },
      {
        label:  `${searchTerm} insolvency — full search`,
        url:    `${GAZETTE_BASE}/insolvency/search?text=${encodeURIComponent(searchTerm)}`,
        type:   'All Types'
      }
    ],
    source:    'The Gazette',
    fetchedAt: new Date().toISOString()
  });
}
