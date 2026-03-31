// api/insolvency.js
// Uses Companies House API to find companies in liquidation/administration
// in Yorkshire postcodes — free, reliable, no blocking issues
// COMPANIES_HOUSE_API_KEY required in Vercel env vars

const CH_BASE = 'https://api.company-information.service.gov.uk';

const REGION_POSTCODES = {
  leeds:        'LS',
  bradford:     'BD',
  wakefield:    'WF',
  sheffield:    'S',
  huddersfield: 'HD'
};

const INSOLVENCY_STATUSES = ['liquidation', 'administration', 'receivership', 'voluntary-arrangement'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region  = (req.query.region || 'leeds').toLowerCase();
  const apiKey  = process.env.COMPANIES_HOUSE_API_KEY;
  const postcode = REGION_POSTCODES[region] || 'LS';

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'COMPANIES_HOUSE_API_KEY not set in Vercel environment variables',
      data: [], setupRequired: true
    });
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  try {
    const allResults = [];

    // Fetch companies in each insolvency status for this region
    for (const status of INSOLVENCY_STATUSES) {
      try {
        const url = `${CH_BASE}/advanced-search/companies?company_status=${status}&location=${postcode}&items_per_page=20`;
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const json = await r.json();
        const items = json.items || [];

        for (const c of items) {
          const addr = c.registered_office_address || {};
          const fullAddr = [addr.address_line_1, addr.locality, addr.postal_code]
            .filter(Boolean).join(', ');

          allResults.push({
            title:       c.company_name,
            description: `${status.replace(/-/g,' ').replace(/\b\w/g,l=>l.toUpperCase())} — ${c.company_type || 'Limited Company'}`,
            address:     fullAddr || `${postcode} area`,
            ref:         `Co. No: ${c.company_number}`,
            date:        c.date_of_cessation || c.date_of_creation || '—',
            category:    status.replace(/-/g,' ').replace(/\b\w/g,l=>l.toUpperCase()),
            link:        `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
            source:      'Companies House'
          });
        }
      } catch(e) { continue; }
    }

    // Deduplicate by company name
    const seen = new Set();
    const unique = allResults.filter(r => {
      if (seen.has(r.title)) return false;
      seen.add(r.title);
      return true;
    });

    // Sort by most recently active
    unique.sort((a, b) => (b.date > a.date ? 1 : -1));

    res.status(200).json({
      success: true, region, postcode,
      count: unique.length,
      totalFetched: allResults.length,
      data: unique.slice(0, 25),
      source: 'Companies House',
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
