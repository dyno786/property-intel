// api/insolvency.js
// Companies House — searches for insolvent companies by town name
// Free API, no blocking issues

const CH_BASE = 'https://api.company-information.service.gov.uk';

const REGION_TOWNS = {
  leeds:        ['Leeds', 'Horsforth', 'Morley', 'Pudsey', 'Garforth', 'Wetherby', 'Otley'],
  bradford:     ['Bradford', 'Shipley', 'Keighley', 'Bingley', 'Ilkley'],
  wakefield:    ['Wakefield', 'Castleford', 'Pontefract', 'Ossett', 'Dewsbury'],
  sheffield:    ['Sheffield', 'Rotherham', 'Doncaster', 'Barnsley'],
  huddersfield: ['Huddersfield', 'Halifax', 'Brighouse', 'Mirfield']
};

const INSOLVENCY_STATUSES = ['liquidation', 'administration', 'receivership'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region = (req.query.region || 'leeds').toLowerCase();
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  const towns  = REGION_TOWNS[region] || REGION_TOWNS.leeds;

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'COMPANIES_HOUSE_API_KEY not set',
      data: [], setupRequired: true
    });
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };

  try {
    const allResults = [];

    // Search each insolvency status for the primary town
    for (const status of INSOLVENCY_STATUSES) {
      try {
        // Use company search with status filter — searches across all registered companies
        const url = `${CH_BASE}/advanced-search/companies?company_status=${status}&location=${encodeURIComponent(towns[0])}&items_per_page=25`;
        const r = await fetch(url, { headers });
        if (!r.ok) {
          // Try basic search if advanced fails
          const basicUrl = `${CH_BASE}/search/companies?q=${encodeURIComponent(towns[0])}&items_per_page=20`;
          const rb = await fetch(basicUrl, { headers });
          if (!rb.ok) continue;
          const jb = await rb.json();
          const items = (jb.items || []).filter(c => c.company_status === status);
          for (const c of items) {
            pushResult(allResults, c, status);
          }
          continue;
        }
        const json = await r.json();
        for (const c of (json.items || [])) {
          pushResult(allResults, c, status);
        }
      } catch(e) { continue; }
    }

    // Also do a general insolvency search for the region
    try {
      for (const town of towns.slice(0, 3)) {
        const url = `${CH_BASE}/search/companies?q=${encodeURIComponent(town + ' liquidation')}&items_per_page=10`;
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const json = await r.json();
        for (const c of (json.items || [])) {
          if (['liquidation','administration','receivership','voluntary-arrangement'].includes(c.company_status)) {
            pushResult(allResults, c, c.company_status);
          }
        }
      }
    } catch(e) {}

    // Deduplicate by company number
    const seen = new Set();
    const unique = allResults.filter(r => {
      if (seen.has(r.ref)) return false;
      seen.add(r.ref);
      return true;
    });

    res.status(200).json({
      success: true, region,
      count: unique.length,
      data: unique.slice(0, 30),
      source: 'Companies House',
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}

function pushResult(arr, c, status) {
  const addr = c.address || c.registered_office_address || {};
  const fullAddr = [
    addr.address_line_1 || addr.addressLine1,
    addr.locality || addr.town,
    addr.postal_code || addr.postcode
  ].filter(Boolean).join(', ');

  arr.push({
    title:       c.title || c.company_name,
    description: `${formatStatus(status)} — ${c.company_type || 'Ltd'}`,
    address:     fullAddr || '—',
    ref:         c.company_number,
    date:        c.date_of_cessation || c.date_of_creation || '—',
    category:    formatStatus(status),
    link:        `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
    source:      'Companies House'
  });
}

function formatStatus(s) {
  return s.replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase());
}
