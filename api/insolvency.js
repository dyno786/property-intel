// api/insolvency.js
// Fetches real insolvency notices from The Gazette (free, Crown Copyright)

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const REGION_KEYWORDS = {
  leeds:        ['leeds', 'west yorkshire', 'ls1', 'ls2', 'ls3', 'ls4', 'ls5', 'ls6', 'ls7', 'ls8', 'ls9', 'ls10', 'ls11', 'ls12', 'ls13', 'ls14', 'ls15', 'ls16', 'ls17', 'ls18', 'ls19', 'ls25', 'ls26', 'ls27', 'ls28'],
  bradford:     ['bradford', 'west yorkshire', 'bd1', 'bd2', 'bd3', 'bd4', 'bd5', 'bd6', 'bd7', 'bd8', 'bd9', 'bd10'],
  wakefield:    ['wakefield', 'west yorkshire', 'wf1', 'wf2', 'wf3', 'wf4', 'wf5', 'wf6'],
  sheffield:    ['sheffield', 'south yorkshire', 's1', 's2', 's3', 's6', 's7', 's8', 's10', 's11'],
  huddersfield: ['huddersfield', 'kirklees', 'hd1', 'hd2', 'hd3', 'hd4', 'hd5']
};

function matchesRegion(text, region) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const keywords = REGION_KEYWORDS[region] || REGION_KEYWORDS.leeds;
  return keywords.some(kw => lower.includes(kw));
}

function parseGazetteXML(xml) {
  const notices = [];
  const items = xml.split(/<item[\s>]/i).slice(1);
  for (const item of items) {
    const title    = (item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/))?.[1] || '';
    const desc     = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/))?.[1] || '';
    const link     = (item.match(/<link>([\s\S]*?)<\/link>/))?.[1] || '';
    const pubDate  = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1] || '';
    const category = (item.match(/<category>([\s\S]*?)<\/category>/))?.[1] || '';
    const cleanDesc = desc.replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/\s+/g, ' ').trim();
    if (title.trim()) {
      notices.push({ title: title.trim(), description: cleanDesc.substring(0, 400), link: link.trim(), pubDate: pubDate.trim(), category: category.trim() });
    }
  }
  return notices;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region = (req.query.region || 'leeds').toLowerCase();

  try {
    const feedUrls = [
      `${GAZETTE_BASE}/all-notices/notice?notice-type=2100&format=rss`,
      `${GAZETTE_BASE}/all-notices/notice?notice-type=2150&format=rss`,
      `${GAZETTE_BASE}/all-notices/notice?notice-type=2160&format=rss`,
    ];

    let allNotices = [];

    for (const feedUrl of feedUrls) {
      try {
        const response = await fetch(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CC-Property-Intelligence/1.0)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          }
        });
        if (!response.ok) continue;
        const xml = await response.text();
        const parsed = parseGazetteXML(xml);
        allNotices.push(...parsed);
      } catch(e) { continue; }
    }

    // Deduplicate
    const seen = new Set();
    allNotices = allNotices.filter(n => {
      if (seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    });

    let filtered = allNotices.filter(n =>
      matchesRegion(n.title, region) || matchesRegion(n.description, region)
    );

    // Fallback: show all if no local matches
    const usedFallback = filtered.length === 0 && allNotices.length > 0;
    if (usedFallback) filtered = allNotices.slice(0, 20);

    const formatted = filtered.map(n => ({
      title:       n.title,
      description: n.description,
      link:        n.link,
      date:        n.pubDate ? new Date(n.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      category:    n.category || 'Corporate Insolvency',
      source:      'The Gazette',
      note:        usedFallback ? 'Showing national notices (no local match today)' : ''
    }));

    res.status(200).json({
      success: true, region,
      count: formatted.length,
      totalFetched: allNotices.length,
      usedFallback,
      data: formatted,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
