// api/insolvency.js
// The Gazette - insolvency notices with date range support
// Supports: region, months (1-6), breakdown
// Uses Gazette search API with date filtering

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const NOTICE_TYPES = [
  { code: '2100', label: 'Winding Up / Liquidation' },
  { code: '2150', label: 'Administration' },
  { code: '2160', label: 'Receivership' },
  { code: '2200', label: 'Voluntary Arrangement' }
];

const REGION_TERMS = {
  leeds:        ['leeds'],
  bradford:     ['bradford'],
  wakefield:    ['wakefield'],
  sheffield:    ['sheffield'],
  huddersfield: ['huddersfield'],
  yorkshire:    ['leeds', 'bradford', 'sheffield', 'wakefield', 'huddersfield'],
  national:     ['']
};

const AREA_KEYWORDS = {
  leeds:        ['leeds','ls1','ls2','ls3','ls6','ls7','ls8','ls9','ls10','ls11','ls12'],
  bradford:     ['bradford','bd1','bd2','bd3','bd4','bd5'],
  wakefield:    ['wakefield','wf1','wf2','wf3','wf4'],
  sheffield:    ['sheffield','s1','s2','s3','s6','s10'],
  huddersfield: ['huddersfield','kirklees','hd1','hd2','hd3']
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
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim() : '';
    };
    const title   = get('title');
    const desc    = get('description').replace(/\s+/g,' ').substring(0,500);
    const link    = get('link');
    const pubDate = get('pubDate');
    const cat     = get('category');
    if (title) items.push({ title, description:desc, link, pubDate, category:cat });
  }
  return items;
}

function formatGazetteDate(date) {
  // Gazette uses DD/MM/YYYY format for date filtering
  const d = String(date.getDate()).padStart(2,'0');
  const m = String(date.getMonth()+1).padStart(2,'0');
  const y = date.getFullYear();
  return `${d}%2F${m}%2F${y}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const region    = (req.query.region    || 'leeds').toLowerCase();
  const months    = Math.min(parseInt(req.query.months || '1'), 6);
  const breakdown = req.query.breakdown  === 'true';
  const terms     = REGION_TERMS[region] || REGION_TERMS.leeds;

  // Date range
  const dateTo   = new Date();
  const dateFrom = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const fromStr  = formatGazetteDate(dateFrom);
  const toStr    = formatGazetteDate(dateTo);

  const allItems = [];
  const errors   = [];
  let feedsChecked = 0;

  for (const term of terms) {
    for (const { code, label } of NOTICE_TYPES) {
      feedsChecked++;

      // Build URL with date range filter
      let url = `${GAZETTE_BASE}/all-notices/notice?notice-type=${code}&format=rss`;
      if (term) url += `&text=${encodeURIComponent(term)}`;
      // Add date filters
      url += `&start-publish-date=${fromStr}&end-publish-date=${toStr}`;

      try {
        const r = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CCPropertyIntel/1.0)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          }
        });

        if (!r.ok) {
          // Try without date filter as fallback
          const fallbackUrl = `${GAZETTE_BASE}/all-notices/notice?notice-type=${code}&format=rss${term?'&text='+encodeURIComponent(term):''}`;
          const fr = await fetch(fallbackUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, */*' }
          });
          if (fr.ok) {
            const xml = await fr.text();
            const items = parseXML(xml);
            for (const item of items) allItems.push({ ...item, noticeLabel: label, code });
          } else {
            errors.push(`${term||'national'}/${code}: HTTP ${r.status}`);
          }
          continue;
        }

        const xml   = await r.text();
        const items = parseXML(xml);
        for (const item of items) allItems.push({ ...item, noticeLabel: label, code });

      } catch(e) {
        errors.push(`${term||'national'}/${code}: ${e.message}`);
      }
    }
  }

  // Deduplicate
  const seen   = new Set();
  const unique = allItems.filter(item => {
    const key = `${item.title}|${item.pubDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Format + detect area
  const formatted = unique.map(item => {
    const area = (region === 'national' || region === 'yorkshire')
      ? detectArea(item.title + ' ' + item.description)
      : region;

    let parsedDate = '—';
    if (item.pubDate) {
      try {
        parsedDate = new Date(item.pubDate).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric'
        });
      } catch(e) {}
    }

    return {
      title:       item.title,
      description: item.description,
      area,
      ref:         item.noticeLabel,
      category:    item.noticeLabel,
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
  for (const item of formatted) {
    const a = item.area;
    if (!areaBreakdown[a]) areaBreakdown[a] = [];
    areaBreakdown[a].push(item);
  }

  // Category breakdown
  const categoryBreakdown = {};
  for (const item of formatted) {
    categoryBreakdown[item.category] = (categoryBreakdown[item.category]||0) + 1;
  }

  res.status(200).json({
    success:           true,
    region,
    months,
    dateRange: {
      from: dateFrom.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }),
      to:   dateTo.toLocaleDateString('en-GB',   { day:'numeric', month:'short', year:'numeric' })
    },
    count:             formatted.length,
    data:              formatted,
    areaBreakdown:     breakdown ? areaBreakdown : {},
    categoryBreakdown,
    feedsChecked,
    errors:            errors.slice(0,5),
    gazetteLinks: {
      search:  `${GAZETTE_BASE}/insolvency/search?text=${encodeURIComponent(terms[0]||'')}`,
      winding: `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(terms[0]||'')}&notice-type=2100`,
      admin:   `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(terms[0]||'')}&notice-type=2150`
    },
    source:    'The Gazette',
    fetchedAt: new Date().toISOString()
  });
}
