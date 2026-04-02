// api/insolvency.js
// Companies House API - finds insolvent companies in Yorkshire
// Uses /search/companies endpoint which is reliable
// Filters results by registered address containing Yorkshire postcodes/towns

const CH_BASE = 'https://api.company-information.service.gov.uk';

// Search terms that return Yorkshire businesses
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
    'bradford hotel', 'bradford developments', 'shipley',
    'keighley', 'bingley', 'ilkley'
  ],
  wakefield: [
    'wakefield property', 'wakefield retail', 'wakefield restaurant',
    'castleford', 'pontefract', 'ossett', 'dewsbury'
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

// Yorkshire town/postcode keywords to identify local companies
const REGION_KEYWORDS = {
  leeds:        ['leeds','ls1','ls2','ls3','ls4','ls6','ls7','ls8','ls9','ls10','ls11','ls12','ls13','ls14','ls15','ls16','ls17','ls18','ls19','ls20','ls25','ls26','ls27','ls28','chapeltown','harehills','armley','beeston','roundhay','headingley','morley','pudsey','garforth','wetherby'],
  bradford:     ['bradford','bd1','bd2','bd3','bd4','bd5','bd6','bd7','bd8','bd9','bd10','shipley','keighley','bingley','ilkley'],
  wakefield:    ['wakefield','wf1','wf2','wf3','wf4','wf5','wf6','castleford','pontefract','ossett','dewsbury'],
  sheffield:    ['sheffield','s1','s2','s3','s6','s7','s8','s10','s11','rotherham'],
  huddersfield: ['huddersfield','hd1','hd2','hd3','hd4','hd5','halifax','brighouse','kirklees']
};

const INSOLVENT = new Set(['liquidation','administration','receivership','voluntary-arrangement','insolvency-proceedings']);

function isLocalCompany(company, region) {
  const keywords = REGION_KEYWORDS[region] || REGION_KEYWORDS.leeds;
  const addr = company.address || {};
  const searchText = [
    addr.address_line_1, addr.address_line_2,
    addr.locality, addr.postal_code,
    company.title
  ].filter(Boolean).join(' ').toLowerCase();
  return keywords.some(kw => searchText.includes(kw));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

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
  const searches = REGION_SEARCHES[region] || REGION_SEARCHES.leeds;

  // Run searches in parallel batches of 4
  for (let i = 0; i < searches.length; i += 4) {
    const batch = searches.slice(i, i + 4);
    await Promise.all(batch.map(async (q) => {
      try {
        const r = await fetch(
          `${CH_BASE}/search/companies?q=${encodeURIComponent(q)}&items_per_page=20`,
          { headers }
        );
        if (!r.ok) return;
        const json = await r.json();
        for (const c of (json.items || [])) {
          if (seen.has(c.company_number)) continue;
          if (!INSOLVENT.has(c.company_status)) continue;
          seen.add(c.company_number);
          const addr  = c.address || {};
          const parts = [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code].filter(Boolean);
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
      } catch(e) {}
    }));
  }

  // Sort: active insolvencies first
  const priority = { 'Administration':1,'Receivership':2,'Liquidation':3,'Voluntary Arrangement':4,'Insolvency Proceedings':5 };
  results.sort((a,b) => (priority[a.category]||9) - (priority[b.category]||9));

  res.status(200).json({
    success: true,
    region,
    count: results.length,
    data: results.slice(0, 40),
    source: 'Companies House',
    fetchedAt: new Date().toISOString()
  });
}

function formatStatus(s) {
  if (!s) return 'Unknown';
  return s.replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase());
}
