// api/insolvency.js
// Companies House - finds businesses in insolvency in Yorkshire
// Uses advanced search with company_status filter which is the correct approach

const CH_BASE = 'https://api.company-information.service.gov.uk';

const REGION_CONFIG = {
  leeds:        { area: 'Leeds',        postcodes: ['LS1','LS2','LS6','LS7','LS8','LS9','LS10','LS11','LS12'] },
  bradford:     { area: 'Bradford',     postcodes: ['BD1','BD2','BD3','BD4','BD5'] },
  wakefield:    { area: 'Wakefield',    postcodes: ['WF1','WF2','WF3','WF4'] },
  sheffield:    { area: 'Sheffield',    postcodes: ['S1','S2','S3','S6','S10'] },
  huddersfield: { area: 'Huddersfield', postcodes: ['HD1','HD2','HD3','HD4'] }
};

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
  const headers = { 'Authorization':`Basic ${auth}`, 'Accept':'application/json' };
  const seen    = new Set();
  const results = [];

  function addCompany(c, reason) {
    if (!c?.company_number || seen.has(c.company_number)) return;
    seen.add(c.company_number);
    const addr = c.address || c.registered_office_address || {};
    const parts = [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code].filter(Boolean);
    results.push({
      title:       c.title || c.company_name || '—',
      description: formatStatus(c.company_status) + (c.company_type ? ' · ' + c.company_type : ''),
      address:     parts.join(', ') || cfg.area,
      ref:         `Co. No: ${c.company_number}`,
      date:        c.date_of_cessation || c.date_of_creation || '—',
      category:    formatStatus(c.company_status),
      reason:      reason,
      link:        `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
      source:      'Companies House'
    });
  }

  async function doSearch(query) {
    try {
      const r = await fetch(`${CH_BASE}/search/companies?q=${encodeURIComponent(query)}&items_per_page=20`, { headers });
      if (!r.ok) return;
      const j = await r.json();
      return j.items || [];
    } catch(e) { return []; }
  }

  async function doAdvanced(status, location) {
    try {
      const url = `${CH_BASE}/advanced-search/companies?company_status=${status}&location=${encodeURIComponent(location)}&items_per_page=20`;
      const r = await fetch(url, { headers });
      if (!r.ok) return [];
      const j = await r.json();
      return j.items || [];
    } catch(e) { return []; }
  }

  const insolventStatuses = ['liquidation','administration','receivership','voluntary-arrangement'];
  const area = cfg.area;

  // Method 1: Advanced search by status + location (most reliable)
  for (const status of insolventStatuses) {
    const items = await doAdvanced(status, area);
    for (const c of items) addCompany(c, `In ${formatStatus(status)}`);
  }

  // Method 2: Search by postcode + filter for insolvency status
  for (const pc of cfg.postcodes.slice(0, 5)) {
    const items = await doSearch(pc);
    for (const c of (items||[])) {
      if (insolventStatuses.includes(c.company_status)) {
        addCompany(c, `${formatStatus(c.company_status)} — ${pc} postcode`);
      }
    }
  }

  // Method 3: Keyword searches for property/business distress
  const keywords = [
    `${area} property`,
    `${area} developments`,
    `${area} retail`,
    `${area} hospitality`,
    `${area} restaurant`
  ];
  for (const kw of keywords) {
    const items = await doSearch(kw);
    for (const c of (items||[])) {
      if (insolventStatuses.includes(c.company_status) || c.company_status === 'dissolved') {
        addCompany(c, `Distressed ${c.company_type||'business'} — ${c.company_status}`);
      }
    }
  }

  // Sort by priority
  const order = { 'Administration':1,'Receivership':2,'Liquidation':3,'Voluntary Arrangement':4,'Dissolved':5 };
  results.sort((a,b) => (order[a.category]||9) - (order[b.category]||9));

  res.status(200).json({
    success: true,
    region,
    area,
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
