// api/probate.js - Probate Leads from The Gazette
// Deceased estates notices — executors looking to sell quickly
// Same source as insolvency, notice types 1300/1301 (deceased estates)

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const NOTICE_TYPES = [
  { code: '1300', label: 'Deceased Estates',          priority: 'high'   },
  { code: '1301', label: 'Trustee Act Notices',       priority: 'medium' },
  { code: '1302', label: 'Administration of Estates', priority: 'high'   },
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

function parseAtom(xml, label, priority) {
  const items = [];
  const entries = xml.split(/<entry[\s>]/i).slice(1);
  for (const entry of entries) {
    const get = tag => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,' ').trim() : '';
    };
    const linkM = entry.match(/<link[^>]+href=["']([^"']+)["']/i);
    const title = get('title');
    if (!title || title.length < 3) continue;
    items.push({
      title,
      description: (get('summary') || get('content')).replace(/\s+/g,' ').substring(0, 500),
      pubDate:     get('updated') || get('published') || '',
      link:        linkM ? linkM[1] : '',
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
        'User-Agent': 'Mozilla/5.0 (compatible; CCPropertyIntel/1.0)',
        'Accept': 'application/atom+xml, application/xml, text/xml, */*',
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

  const region = (req.query.region || 'leeds').toLowerCase();
  const cfg    = REGION_CONFIG[region] || REGION_CONFIG.leeds;

  const seen     = new Set();
  const allItems = [];
  const debug    = [];

  await Promise.all(NOTICE_TYPES.map(async ({ code, label, priority }) => {
    const url = cfg.text
      ? `${GAZETTE_BASE}/all-notices/data.feed?notice-type=${code}&text=${encodeURIComponent(cfg.text)}&format=atom&results-page=1`
      : `${GAZETTE_BASE}/all-notices/data.feed?notice-type=${code}&format=atom&results-page=1`;

    const xml    = await fetchFeed(url);
    const parsed = xml ? parseAtom(xml, label, priority) : [];
    debug.push({ code, label, count: parsed.length, ok: !!xml });

    for (const item of parsed) {
      const key = item.link || `${item.title}|${item.pubDate}`;
      if (seen.has(key)) continue;
      seen.add(key); allItems.push(item);
    }
  }));

  const PORDER = { high: 0, medium: 1, low: 2 };
  const formatted = allItems.map(item => {
    let date = '—';
    try { if (item.pubDate) date = new Date(item.pubDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); } catch {}
    return { ...item, date };
  }).sort((a,b) => (PORDER[a.priority]??1) - (PORDER[b.priority]??1));

  res.status(200).json({
    success:   true,
    region,
    count:     formatted.length,
    data:      formatted,
    debug,
    tip:       'Deceased estates = executor needs to sell property quickly. Approach respectfully within 2-4 weeks of notice.',
    gazetteLink: `${GAZETTE_BASE}/all-notices/notice?notice-type=1300${cfg.text ? '&text='+encodeURIComponent(cfg.text) : ''}`,
    source:    'The Gazette',
    fetchedAt: new Date().toISOString(),
  });
}
