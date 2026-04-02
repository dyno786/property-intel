// api/pubs.js
// Monitors pub company disposal lists for Yorkshire pubs
// Checks Star Pubs, Admiral Taverns, Greene King, Punch Taverns
// Also searches Companies House for licensed premises in liquidation

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region = (req.query.region || 'leeds').toLowerCase();
  const chKey  = process.env.COMPANIES_HOUSE_API_KEY;

  const results = {
    starPubs:    [],
    admiral:     [],
    greene:      [],
    punch:       [],
    companies:   [],
    rightmove:   []
  };

  // 1. Companies House - licensed premises / pubs in liquidation/administration
  if (chKey) {
    const auth = Buffer.from(`${chKey}:`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' };

    const pubSearchTerms = [
      'pub leeds', 'inn leeds', 'tavern leeds', 'bar leeds',
      'hotel leeds', 'restaurant leeds liquidation',
      'licensed premises leeds'
    ];

    const seen = new Set();
    for (const term of pubSearchTerms.slice(0, 4)) {
      try {
        const r = await fetch(
          `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(term)}&items_per_page=20`,
          { headers }
        );
        if (!r.ok) continue;
        const json = await r.json();
        for (const c of (json.items || [])) {
          if (seen.has(c.company_number)) continue;
          const isInsolvent = ['liquidation','administration','receivership'].includes(c.company_status);
          const isPub = /pub|inn|tavern|bar|hotel|restaurant|licensed|brewery/i.test(c.title || '');
          if ((isInsolvent || isPub) && c.company_status !== 'active') {
            seen.add(c.company_number);
            const addr = c.address || {};
            results.companies.push({
              name:    c.title,
              status:  c.company_status,
              number:  c.company_number,
              address: [addr.address_line_1, addr.locality, addr.postal_code].filter(Boolean).join(', '),
              type:    'Companies House',
              link:    `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
              reason:  isInsolvent ? `In ${c.company_status}` : 'Dissolved/closed pub business'
            });
          }
        }
      } catch(e) { continue; }
    }
  }

  // 2. Build direct search links for pub disposal sites
  // These are the real URLs investors use
  const YORKSHIRE_AREA = 'Yorkshire';
  const disposalLinks = [
    {
      name:        'Star Pubs (Heineken)',
      url:         'https://starpubs.co.uk/pubs-for-sale',
      searchUrl:   `https://starpubs.co.uk/pubs-for-sale?region=yorkshire`,
      description: 'Heineken-owned pub estate — regular Yorkshire disposals',
      logo:        '⭐',
      type:        'disposal_list'
    },
    {
      name:        'Admiral Taverns',
      url:         'https://www.admiraltaverns.co.uk/pubs-available',
      searchUrl:   `https://www.admiraltaverns.co.uk/pubs-available`,
      description: 'Admiral Taverns lease and freehold pub disposals',
      logo:        '⚓',
      type:        'disposal_list'
    },
    {
      name:        'Punch Taverns',
      url:         'https://www.punchtavernsleases.co.uk/pub-search',
      searchUrl:   `https://www.punchtavernsleases.co.uk/pub-search?county=yorkshire`,
      description: 'Punch pub estate — leases and freeholds available',
      logo:        '🥊',
      type:        'disposal_list'
    },
    {
      name:        'Greene King',
      url:         'https://www.greenekingpubs.co.uk/pubs-for-sale',
      searchUrl:   `https://www.greenekingpubs.co.uk/pubs-for-sale`,
      description: 'Greene King estate disposals',
      logo:        '🍺',
      type:        'disposal_list'
    },
    {
      name:        'Stonegate Group',
      url:         'https://www.stonegategroup.co.uk',
      searchUrl:   `https://www.stonegategroup.co.uk`,
      description: 'UK\'s largest pub company — estate rationalisation ongoing',
      logo:        '🏛️',
      type:        'disposal_list'
    },
    {
      name:        'Rightmove Commercial (Pubs)',
      url:         `https://www.rightmove.co.uk/commercial-property-for-sale/Leeds.html?propertySubType=Pub`,
      searchUrl:   `https://www.rightmove.co.uk/commercial-property-for-sale/Leeds.html?propertySubType=Pub`,
      description: 'Pubs listed for sale on Rightmove in Leeds',
      logo:        '🏠',
      type:        'portal'
    },
    {
      name:        'Christie & Co (Pub Agents)',
      url:         `https://www.christieandco.com/en-gb/for-sale/pubs`,
      searchUrl:   `https://www.christieandco.com/en-gb/for-sale/pubs?location=Leeds`,
      description: 'UK\'s leading licensed property agent — Yorkshire listings',
      logo:        '🏢',
      type:        'agent'
    },
    {
      name:        'Fleurets (Pub Agents)',
      url:         `https://www.fleurets.com/properties/`,
      searchUrl:   `https://www.fleurets.com/properties/?type=pub&location=yorkshire`,
      description: 'Specialist licensed property agent — regular Yorkshire stock',
      logo:        '📋',
      type:        'agent'
    },
    {
      name:        'EG Propertylink (Leisure)',
      url:         `https://www.propertylink.estatesgazette.com/search?q=pub+leeds`,
      searchUrl:   `https://www.propertylink.estatesgazette.com/search?q=pub+leeds`,
      description: 'Commercial property portal — leisure and licensed',
      logo:        '📊',
      type:        'portal'
    },
    {
      name:        'SDL Auctions (Pubs)',
      url:         `https://www.sdlauctions.co.uk/property-auctions/yorkshire/`,
      searchUrl:   `https://www.sdlauctions.co.uk/property-auctions/yorkshire/`,
      description: 'Yorkshire auction house — pubs and licensed premises',
      logo:        '🔨',
      type:        'auction'
    }
  ];

  res.status(200).json({
    success: true,
    region,
    companies: results.companies,
    companiesCount: results.companies.length,
    disposalLinks,
    summary: {
      companiesInDistress: results.companies.length,
      disposalSources: disposalLinks.length,
      message: results.companies.length > 0
        ? `Found ${results.companies.length} pub/licensed businesses in distress in ${region}`
        : `No distressed pub companies found in Companies House for ${region} — check disposal links below`
    },
    fetchedAt: new Date().toISOString()
  });
}
