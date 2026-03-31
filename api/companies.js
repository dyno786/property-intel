// api/companies.js
// Companies House free API — cross-reference businesses going insolvent
// Get your free key at: https://developer.company-information.service.gov.uk/get-started
// Add COMPANIES_HOUSE_API_KEY to Vercel environment variables

const CH_BASE = 'https://api.company-information.service.gov.uk';

// Yorkshire area codes used by Companies House
const REGION_AREA_CODES = {
  leeds:        ['LS'],
  bradford:     ['BD'],
  wakefield:    ['WF'],
  sheffield:    ['S'],
  huddersfield: ['HD']
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region     = (req.query.region || 'leeds').toLowerCase();
  const query      = req.query.q || '';        // company name search
  const type       = req.query.type || 'search'; // search | insolvency
  const apiKey     = process.env.COMPANIES_HOUSE_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'COMPANIES_HOUSE_API_KEY not set. Get free key at https://developer.company-information.service.gov.uk/get-started',
      data: [],
      setupRequired: true
    });
  }

  // Companies House uses Basic Auth with API key as username, empty password
  const auth = Buffer.from(`${apiKey}:`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  try {
    if (type === 'search' && query) {
      // Search for a specific company by name
      const url = `${CH_BASE}/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Companies House returned ${response.status}`);
      const json = await response.json();

      const formatted = (json.items || []).map(c => ({
        name:          c.title,
        number:        c.company_number,
        status:        c.company_status,
        type:          c.company_type,
        address:       c.address_snippet || '—',
        incorporated:  c.date_of_creation || '—',
        link:          `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
        source:        'Companies House'
      }));

      return res.status(200).json({
        success: true,
        query,
        count: formatted.length,
        data: formatted,
        fetchedAt: new Date().toISOString()
      });
    }

    if (type === 'insolvency') {
      // Get recently dissolved/wound-up companies in our postcode areas
      const areaCodes = REGION_AREA_CODES[region] || ['LS'];
      const allResults = [];

      for (const areaCode of areaCodes) {
        const url = `${CH_BASE}/advanced-search/companies?location=${areaCode}&company_status=liquidation&items_per_page=20`;
        const response = await fetch(url, { headers });
        if (!response.ok) continue;
        const json = await response.json();

        const items = (json.items || []).map(c => ({
          name:     c.company_name,
          number:   c.company_number,
          status:   c.company_status,
          type:     c.company_type,
          address:  c.registered_office_address ?
            [c.registered_office_address.address_line_1, c.registered_office_address.locality, c.registered_office_address.postal_code].filter(Boolean).join(', ')
            : '—',
          link:     `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
          source:   'Companies House'
        }));

        allResults.push(...items);
      }

      return res.status(200).json({
        success: true,
        region,
        count: allResults.length,
        data: allResults,
        fetchedAt: new Date().toISOString()
      });
    }

    res.status(400).json({ success: false, error: 'Invalid type parameter. Use: search or insolvency' });

  } catch (err) {
    console.error('Companies House error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
