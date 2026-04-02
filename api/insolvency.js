// api/insolvency.js
// Companies House - finds businesses in insolvency/distress in Yorkshire
// Uses multiple search strategies to maximise results

const CH_BASE = 'https://api.company-information.service.gov.uk';

const REGION_CONFIG = {
  leeds:        { towns: ['Leeds'], postcodes: ['LS1','LS2','LS3','LS6','LS7','LS8','LS9','LS10','LS11','LS12'] },
  bradford:     { towns: ['Bradford','Shipley','Keighley'], postcodes: ['BD1','BD2','BD3','BD4','BD5'] },
  wakefield:    { towns: ['Wakefield','Castleford','Pontefract'], postcodes: ['WF1','WF2','WF3'] },
  sheffield:    { towns: ['Sheffield'], postcodes: ['S1','S2','S3','S6','S10','S11'] },
  huddersfield: { towns: ['Huddersfield','Halifax'], postcodes: ['HD1','HD2','HD3'] }
};

const INSOLVENCY_STATUSES = new Set(['liquidation','administration','receivership','voluntary-arrangement','insolvency-proceedings']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region = (req.query.region || 'leeds').toLowerCase();
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  const cfg    = REGION_CONFIG[region] || REGION_CONFIG.leeds;

  if (!apiKey) {
    return res.status(200).json({ success:false, error:'COMPANIES_HOUSE_API_KEY not set', data:[], setupRequired:true });
  }

  const auth    = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };

  const seen    = new Set();
  const results = [];

  async function searchAndAdd(query) {
    try {
      const r = await fetch(`${CH_BASE}/search/companies?q=${encodeURIComponent(query)}&items_per_page=20`, { headers });
      if (!r.ok) return;
      const json = await r.json();
      for (const c of (json.items || [])) {
        if (seen.has(c.company_number)) continue;
        const insolvent = INSOLVENCY_STATUSES.has(c.company_status);
        const dissolved = c.company_status === 'dissolved';
        if (insolvent || dissolved) {
          seen.add(c.company_number);
          const addr = c.address || {};
          results.push({
            title:       c.title || '—',
            description: formatStatus(c.company_status) + ' · ' + (c.company_type || 'Ltd'),
            address:     [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code].filter(Boolean).join(', ') || '—',
            ref:         `Co. No: ${c.company_number}`,
            date:        c.date_of_cessation || c.date_of_creation || '—',
            category:    formatStatus(c.company_status),
            link:        `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
            source:      'Companies House'
          });
        }
      }
    } catch(e) {}
  }

  // Strategy 1: Search by town name with insolvency keywords
  for (const town of cfg.towns) {
    await searchAndAdd(town + ' liquidation');
    await searchAndAdd(town + ' administration');
    await searchAndAdd(town + ' in administration');
  }

  // Strategy 2: Search by postcode area for insolvent companies
  for (const pc of cfg.postcodes.slice(0, 4)) {
    await searchAndAdd(pc);
  }

  // Strategy 3: Property-related businesses in distress
  for (const town of cfg.towns.slice(0, 1)) {
    await searchAndAdd(town + ' property liquidation');
    await searchAndAdd(town + ' developments dissolved');
    await searchAndAdd(town + ' retail liquidation');
    await searchAndAdd(town + ' hospitality administration');
  }

  // Sort: active insolvencies first, then dissolved
  const order = { 'Liquidation':1, 'Administration':2, 'Receivership':3, 'Voluntary Arrangement':4, 'Dissolved':5 };
  results.sort((a,b) => (order[a.category]||9) - (order[b.category]||9));

  res.status(200).json({
    success: true, region,
    count: results.length,
    data: results.slice(0, 40),
    source: 'Companies House',
    fetchedAt: new Date().toISOString()
  });
}

function formatStatus(s) {
  if (!s) return 'Dissolved';
  return s.replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase());
}
