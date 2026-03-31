// api/insolvency.js
// Fetches real insolvency notices from The Gazette (free, Crown Copyright)
// Filters by Yorkshire/Leeds/Bradford/Wakefield/Sheffield/Huddersfield

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const REGION_KEYWORDS = {
  leeds:        ['leeds', 'ls1', 'ls2', 'ls3', 'ls4', 'ls5', 'ls6', 'ls7', 'ls8', 'ls9', 'ls10', 'ls11', 'ls12', 'ls13', 'ls14', 'ls15', 'ls16', 'ls17', 'ls18', 'ls19', 'ls25', 'ls26', 'ls27', 'ls28'],
  bradford:     ['bradford', 'bd1', 'bd2', 'bd3', 'bd4', 'bd5', 'bd6', 'bd7', 'bd8', 'bd9', 'bd10', 'bd11', 'bd12', 'bd13', 'bd14', 'bd15', 'bd16', 'bd17', 'bd18'],
  wakefield:    ['wakefield', 'wf1', 'wf2', 'wf3', 'wf4', 'wf5', 'wf6', 'wf7', 'wf8', 'wf9', 'wf10', 'wf11', 'wf12', 'wf13', 'wf14', 'wf15', 'wf16', 'wf17'],
  sheffield:    ['sheffield', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14', 's17', 's18', 's20', 's21'],
  huddersfield: ['huddersfield', 'hd1', 'hd2', 'hd3', 'hd4', 'hd5', 'hd6', 'hd7', 'hd8', 'hd9']
};

function matchesRegion(text, region) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const keywords = REGION_KEYWORDS[region] || REGION_KEYWORDS.leeds;
  return keywords.some(kw => lower.includes(kw));
}

function parseGazetteXML(xml) {
  const notices = [];
  // Extract notice blocks
  const items = xml.split('<item>').slice(1);
  for (const item of items) {
    const title    = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1] || '';
    const desc     = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/))?.[1] || '';
    const link     = (item.match(/<link>(.*?)<\/link>/))?.[1] || '';
    const pubDate  = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';
    const category = (item.match(/<category>(.*?)<\/category>/))?.[1] || '';

    // Clean HTML tags from description
    const cleanDesc = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    notices.push({ title: title.trim(), description: cleanDesc.substring(0, 300), link, pubDate, category });
  }
  return notices;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region = (req.query.region || 'leeds').toLowerCase();

  try {
    // The Gazette RSS feed for corporate insolvency notices — free, no auth needed
    const feedUrl = `${GAZETTE_BASE}/all-notices/notice?notice-type=2100&format=rss`;

    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'CC-Property-Intelligence/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`Gazette feed returned ${response.status}`);
    }

    const xml = await response.text();
    const allNotices = parseGazetteXML(xml);

    // Filter by region
    const filtered = allNotices.filter(n =>
      matchesRegion(n.title, region) ||
      matchesRegion(n.description, region)
    );

    // Format dates nicely
    const formatted = filtered.map(n => ({
      title:       n.title,
      description: n.description,
      link:        n.link,
      date:        n.pubDate ? new Date(n.pubDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      category:    n.category || 'Corporate Insolvency',
      source:      'The Gazette'
    }));

    res.status(200).json({
      success: true,
      region,
      count: formatted.length,
      data: formatted,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Gazette fetch error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
