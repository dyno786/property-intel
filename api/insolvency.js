// api/insolvency.js
// Companies House — finds companies in insolvency in Yorkshire
// Uses /search endpoint which works reliably

const CH_BASE = 'https://api.company-information.service.gov.uk';

const REGION_CONFIG = {
  leeds:        { terms: ['Leeds'], postcodes: ['LS1','LS2','LS3','LS6','LS7','LS8','LS9','LS10','LS11','LS12'] },
  bradford:     { terms: ['Bradford'], postcodes: ['BD1','BD2','BD3','BD4','BD5'] },
  wakefield:    { terms: ['Wakefield'], postcodes: ['WF1','WF2','WF3','WF4','WF5'] },
  sheffield:    { terms: ['Sheffield'], postcodes: ['S1','S2','S3','S6','S10','S11'] },
  huddersfield: { terms: ['Huddersfield'], postcodes: ['HD1','HD2','HD3','HD4','HD5'] }
};

const INSOLVENCY_STATUSES = new Set(['liquidation','administration','receivership','voluntary-arrangement','insolvency-proceedings']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region = (req.query.region || 'leeds').toLowerCase();
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  const cfg    = REGION_CONFIG[region] || REGION_CONFIG.leeds;

  if (!apiKey) {
    return res.status(200).json({
      success: false, error: 'COMPANIES_HOUSE_API_KEY not set',
      data: [], setupRequired: true
    });
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };

  try {
    const allResults = [];
    const seen = new Set();

    // Strategy: search for "Leeds liquidation", "Leeds administration" etc
    const searchTerms = [];
    for (const town of cfg.terms) {
      searchTerms.push(`${town} liquidation`);
      searchTerms.push(`${town} administration`);
      searchTerms.push(`${town} insolvency`);
    }

    for (const term of searchTerms) {
      try {
        const url = `${CH_BASE}/search/companies?q=${encodeURIComponent(term)}&items_per_page=20`;
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const json = await r.json();
        for (const c of (json.items || [])) {
          if (seen.has(c.company_number)) continue;
          // Include if company is in an insolvency status OR name contains insolvency keywords
          const isInsolvent = INSOLVENCY_STATUSES.has(c.company_status);
          const nameHint = /liquidat|administ|receiv|insolv/i.test(c.title || '');
          if (isInsolvent || nameHint) {
            seen.add(c.company_number);
            allResults.push(formatCompany(c));
          }
        }
      } catch(e) { continue; }
    }

    // Also do a broader search for any company in these postcodes that's in liquidation
    for (const pc of cfg.postcodes.slice(0,4)) {
      try {
        const url = `${CH_BASE}/search/companies?q=${encodeURIComponent(pc)}&items_per_page=20`;
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const json = await r.json();
        for (const c of (json.items || [])) {
          if (seen.has(c.company_number)) continue;
          if (INSOLVENCY_STATUSES.has(c.company_status)) {
            seen.add(c.company_number);
            allResults.push(formatCompany(c));
          }
        }
      } catch(e) { continue; }
    }

    // Sort — active insolvencies first
    allResults.sort((a,b) => {
      const order = { 'Administration': 0, 'Liquidation': 1, 'Receivership': 2 };
      return (order[a.category]||9) - (order[b.category]||9);
    });

    res.status(200).json({
      success: true, region,
      count: allResults.length,
      data: allResults.slice(0,30),
      source: 'Companies House',
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}

function formatCompany(c) {
  const addr = c.address || {};
  const parts = [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code].filter(Boolean);
  return {
    title:       c.title || c.company_name || '—',
    description: `${formatStatus(c.company_status)} · ${c.company_type || 'Ltd'}`,
    address:     parts.join(', ') || '—',
    ref:         `Co. No: ${c.company_number}`,
    date:        c.date_of_cessation || c.date_of_creation || '—',
    category:    formatStatus(c.company_status),
    link:        `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
    source:      'Companies House'
  };
}

function formatStatus(s) {
  if (!s) return 'Insolvency';
  return s.replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase());
}
