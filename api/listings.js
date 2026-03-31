// api/listings.js
// Fetches live property listings + market stats from PropertyData API
// Sign up at https://propertydata.co.uk/free-trial/10
// Add PROPERTYDATA_API_KEY to Vercel environment variables

const PD_BASE = 'https://api.propertydata.co.uk';

// Postcode districts per region
const REGION_POSTCODES = {
  leeds:        ['LS1', 'LS2', 'LS3', 'LS4', 'LS6', 'LS7', 'LS8', 'LS9', 'LS10', 'LS11', 'LS12', 'LS13', 'LS14', 'LS15', 'LS16', 'LS17', 'LS18', 'LS19'],
  bradford:     ['BD1', 'BD2', 'BD3', 'BD4', 'BD5', 'BD6', 'BD7', 'BD8', 'BD9', 'BD10'],
  wakefield:    ['WF1', 'WF2', 'WF3', 'WF4', 'WF5', 'WF6'],
  sheffield:    ['S1', 'S2', 'S3', 'S6', 'S7', 'S8', 'S10', 'S11', 'S17'],
  huddersfield: ['HD1', 'HD2', 'HD3', 'HD4', 'HD5']
};

async function fetchPostcodeStats(postcode, apiKey) {
  const url = `${PD_BASE}/postcode-key-stats?key=${apiKey}&postcode=${encodeURIComponent(postcode)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.status === 'success' ? json : null;
}

async function fetchSourcedProperties(postcode, apiKey) {
  const url = `${PD_BASE}/sourced-properties?key=${apiKey}&postcode=${encodeURIComponent(postcode)}&listing_status=for_sale`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return [];
  const json = await res.json();
  return json.status === 'success' ? (json.data || []) : [];
}

async function fetchCommercialRents(postcode, apiKey) {
  const url = `${PD_BASE}/rents-commercial?key=${apiKey}&postcode=${encodeURIComponent(postcode)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json();
  return json.status === 'success' ? json : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region       = (req.query.region   || 'leeds').toLowerCase();
  const postcode     = (req.query.postcode || 'all').toUpperCase();
  const dataType     = req.query.type || 'listings'; // listings | stats | commercial
  const apiKey       = process.env.PROPERTYDATA_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'PROPERTYDATA_API_KEY not set. Sign up at https://propertydata.co.uk/free-trial/10',
      data: [],
      setupRequired: true
    });
  }

  try {
    // Determine which postcodes to query
    let postcodesToQuery = [];
    if (postcode === 'ALL') {
      // Use first 4 postcodes for region overview (saves API credits)
      postcodesToQuery = (REGION_POSTCODES[region] || REGION_POSTCODES.leeds).slice(0, 4);
    } else {
      postcodesToQuery = [postcode];
    }

    if (dataType === 'stats') {
      // Key stats for the postcode(s)
      const results = await Promise.all(
        postcodesToQuery.map(pc => fetchPostcodeStats(pc, apiKey))
      );
      const valid = results.filter(Boolean);
      return res.status(200).json({
        success: true,
        region,
        postcodes: postcodesToQuery,
        data: valid,
        fetchedAt: new Date().toISOString()
      });
    }

    if (dataType === 'commercial') {
      const results = await Promise.all(
        postcodesToQuery.map(pc => fetchCommercialRents(pc, apiKey))
      );
      const valid = results.filter(Boolean);
      return res.status(200).json({
        success: true,
        region,
        data: valid,
        fetchedAt: new Date().toISOString()
      });
    }

    // Default: sourced properties (for sale listings)
    const allListings = [];
    for (const pc of postcodesToQuery) {
      const props = await fetchSourcedProperties(pc, apiKey);
      allListings.push(...props.map(p => ({
        title:    p.full_address || p.address || 'Property',
        address:  p.full_address || `${pc}`,
        price:    p.price ? `£${Number(p.price).toLocaleString()}` : '—',
        type:     p.property_type || 'Residential',
        beds:     p.bedrooms || '—',
        link:     p.url || p.listing_url || '#',
        date:     p.first_listed_date ? new Date(p.first_listed_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—',
        postcode: pc,
        source:   'PropertyData'
      })));
    }

    res.status(200).json({
      success: true,
      region,
      postcode,
      count: allListings.length,
      data: allListings,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('PropertyData error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
