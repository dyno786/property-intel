// api/insolvency.js
// Companies House API - Yorkshire insolvency finder
// v4 - added cache headers + debug info

const CH_BASE = 'https://api.company-information.service.gov.uk';

const REGION_SEARCHES = {
  leeds: [
    'leeds property', 'leeds retail', 'leeds hospitality',
    'leeds restaurant', 'leeds bar', 'leeds pub',
    'leeds hotel', 'leeds developments', 'leeds estates',
    'chapeltown', 'harehills', 'armley', 'beeston',
    'roundhay', 'headingley', 'morley', 'pudsey'
  ],
  bradford: [
    'bradford property', 'bradford retail', 'bradford restaurant',
    'bradford hotel', 'bradford developments', 'shipley', 'keighley'
  ],
  wakefield: [
    'wakefield property', 'wakefield retail', 'wakefield restaurant',
    'castleford', 'pontefract', 'ossett'
  ],
  sheffield: [
    'sheffield property', 'sheffield retail', 'sheffield restaurant',
    'sheffield hotel', 'sheffield developments', 'rotherham'
  ],
  huddersfield: [
    'huddersfield property', 'huddersfield retail', 'huddersfield restaurant',
    'huddersfield hotel', 'halifax', 'brighouse'
  ]
};

const INSOLVENT = new Set([
  'liquidation', 'administration', 'receivership',
  'voluntary-arrangement', 'insolvency-proceedings'
]);

export default async function handler(req, res) {
  // Prevent caching so we always get fresh data
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const region = (req.query.region || 'leeds').toLowerCase();
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'COMPANIES_HOUSE_API_KEY not set',
      data: [], setupRequired: true
    });
  }

  const auth    = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };
  const seen    = new Set();
  const results = [];
  const debug   = { searchesRun: 0, totalFound: 0, insolventFound: 0, errors: [] };
  const searches = REGION_SEARCHES[region] || REGION_SEARCHES.leeds;

  // Run searches in parallel batches of 4
  for (let i = 0; i < searches.length; i += 4) {
    const batch = searches.slice(i, i + 4);
    await Promise.all(batch.map(async (q) => {
      try {
        debug.searchesRun++;
        const r = await fetch(
          `${CH_BASE}/search/companies?q=${encodeURIComponent(q)}&items_per_page=20`,
          { headers }
        );
        if (!r.ok) {
          debug.errors.push(`${q}: HTTP ${r.status}`);
          return;
        }
        const json = await r.json();
        const items = json.items || [];
        debug.totalFound += items.length;

        for (const c of items) {
          if (seen.has(c.company_number)) continue;
          if (!INSOLVENT.has(c.company_status)) continue;
          debug.insolventFound++;
          seen.add(c.company_number);
          const addr  = c.address || {};
          const parts = [
            addr.address_line_1, addr.address_line_2,
            addr.locality, addr.postal_code
          ].filter(Boolean);
          results.push({
            title:       c.title || '—',
            description: formatStatus(c.company_status) + (c.company_type ? ' · ' + c.company_type : ''),
            address:     parts.join(', ') || '—',
            ref:         `Co. No: ${c.company_number}`,
            date:        c.date_of_cessation || c.date_of_creation || '—',
            category:    formatStatus(c.company_status),
            link:        `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
            source:      'Companies House'
          });
        }
      } catch(e) {
        debug.errors.push(`${q}: ${e.message}`);
      }
    }));
  }

  // Sort: active insolvencies first
  const priority = {
    'Administration': 1, 'Receivership': 2, 'Liquidation': 3,
    'Voluntary Arrangement': 4, 'Insolvency Proceedings': 5
  };
  results.sort((a,b) => (priority[a.category]||9) - (priority[b.category]||9));

  res.status(200).json({
    success: true,
    region,
    count: results.length,
    data: results.slice(0, 40),
    debug,
    source: 'Companies House',
    version: 'v4',
    fetchedAt: new Date().toISOString()
  });
}

function formatStatus(s) {
  if (!s) return 'Unknown';
  return s.replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase());
}
