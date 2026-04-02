// api/epc.js
// EPC Register - Domestic + Non-domestic certificates
// Searches by postcode, energy band, property type
// Free API - requires EPC_EMAIL + EPC_API_KEY in Vercel env vars
// Leeds local authority code: E08000035

const EPC_BASE = 'https://epc.opendatacommunities.org/api/v1';
const LEEDS_LA = 'E08000035';

const LA_CODES = {
  leeds:        'E08000035',
  bradford:     'E08000032',
  wakefield:    'E08000036',
  sheffield:    'E08000019',
  huddersfield: 'E08000034' // Kirklees
};

// Non-domestic property types relevant to property investment
const COMMERCIAL_TYPES = [
  'a1-a2',           // Retail
  'a3-a4-a5',        // Restaurant/pub/takeaway
  'b1-office',       // Office
  'b8-storage',      // Storage/warehouse
  'c1-hotel',        // Hotel
  'restaurant-public-house', // Pub specifically
  'retail',
  'retail-warehouse',
  'warehouse-storage'
];

function getAuth(email, key) {
  return 'Basic ' + Buffer.from(`${email}:${key}`).toString('base64');
}

function estimateUpgradeCost(rating) {
  const costs = { 'g':15000, 'f':12000, 'e':8000, 'd':4000, 'c':1500, 'b':500 };
  return costs[rating?.toLowerCase()] || 0;
}

function getMotivationScore(rating, tenure, date) {
  let score = 0;
  const r = (rating||'').toLowerCase();
  if (r === 'g') score += 50;
  else if (r === 'f') score += 35;
  else if (r === 'e') score += 20;
  if ((tenure||'').toLowerCase().includes('rental') || (tenure||'').toLowerCase().includes('let')) score += 25;
  if (date && date < '2020-01-01') score += 15;
  if (date && date < '2018-01-01') score += 10;
  return Math.min(score, 100);
}

function formatDomestic(row) {
  const rating   = row['current-energy-rating'] || '?';
  const cost     = estimateUpgradeCost(rating);
  const score    = getMotivationScore(rating, row['tenure'], row['lodgement-date']);
  const addr     = [row['address1'], row['address2'], row['address3']].filter(Boolean).join(', ');
  const potential = row['potential-energy-rating'] || '?';

  return {
    id:              row['lmk-key'] || '',
    address:         addr || row['address'] || '—',
    postcode:        row['postcode'] || '—',
    currentRating:   rating.toUpperCase(),
    potentialRating: potential.toUpperCase(),
    currentScore:    parseInt(row['current-energy-efficiency']) || 0,
    potentialScore:  parseInt(row['potential-energy-efficiency']) || 0,
    propertyType:    row['property-type'] || '—',
    builtForm:       row['built-form'] || '—',
    floorArea:       row['total-floor-area'] || '—',
    tenure:          row['tenure'] || '—',
    heatingType:     row['main-fuel'] || '—',
    lodgementDate:   row['lodgement-date'] || '—',
    estimatedUpgradeCost: cost,
    motivationScore: score,
    opportunityFlag: score >= 50
      ? { flag: '🔴 HIGH', reason: `Facing ~£${cost.toLocaleString()} upgrade costs — motivated to sell` }
      : score >= 25
      ? { flag: '🟡 MEDIUM', reason: 'May face future upgrade requirements' }
      : { flag: '🟢 LOW', reason: 'Good EPC rating' },
    type:  'domestic',
    link:  `https://find-energy-certificate.service.gov.uk/energy-certificate/${row['lmk-key']}`
  };
}

function formatNonDomestic(row) {
  const rating  = row['asset-rating-band'] || row['energy-rating-current'] || '?';
  const addr    = [row['address1'], row['address2'], row['address3']].filter(Boolean).join(', ');

  return {
    id:            row['lmk-key'] || '',
    address:       addr || row['address'] || '—',
    postcode:      row['postcode'] || '—',
    currentRating: rating.toUpperCase(),
    propertyType:  row['property-type'] || row['main-heating-fuel'] || '—',
    floorArea:     row['floor-area'] || row['total-floor-area'] || '—',
    lodgementDate: row['lodgement-date'] || '—',
    assetRating:   row['asset-rating'] || '—',
    motivationScore: rating.toLowerCase() === 'f' || rating.toLowerCase() === 'g' ? 70 : rating.toLowerCase() === 'e' ? 40 : 10,
    opportunityFlag: ['f','g'].includes(rating.toLowerCase())
      ? { flag: '🔴 HIGH', reason: 'F/G rated commercial — MEES regulations apply, owner may sell' }
      : ['e'].includes(rating.toLowerCase())
      ? { flag: '🟡 MEDIUM', reason: 'E rated — approaching minimum standard threshold' }
      : { flag: '🟢 LOW', reason: 'Meets current minimum energy standards' },
    type: 'commercial',
    link: `https://find-energy-certificate.service.gov.uk/energy-certificate/${row['lmk-key']}`
  };
}

async function fetchEPC(url, auth) {
  const r = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': auth
    }
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`EPC API ${r.status}: ${text.substring(0,200)}`);
  }
  return await r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const postcode   = (req.query.postcode || 'LS7').toUpperCase().trim();
  const region     = (req.query.region   || 'leeds').toLowerCase();
  const certType   = req.query.certType  || 'domestic';   // domestic | commercial | both
  const energyBand = req.query.band      || 'poor';        // poor (F/G/E) | all | fg (F/G only)
  const size       = Math.min(parseInt(req.query.size||'100'), 500);

  const epcEmail = process.env.EPC_EMAIL;
  const epcKey   = process.env.EPC_API_KEY;

  if (!epcEmail || !epcKey) {
    return res.status(200).json({
      success: false,
      error: 'EPC_EMAIL and EPC_API_KEY not set in Vercel environment variables',
      setupRequired: true,
      setupSteps: [
        'Go to https://epc.opendatacommunities.org and register',
        'Get your API key from your account page',
        'Add EPC_EMAIL to Vercel env vars',
        'Add EPC_API_KEY to Vercel env vars'
      ],
      data: []
    });
  }

  const auth = getAuth(epcEmail, epcKey);
  const laCode = LA_CODES[region] || LA_CODES.leeds;

  try {
    const results = { domestic: [], commercial: [] };

    // Build energy band filter
    let bands = [];
    if (energyBand === 'poor')   bands = ['f','g','e'];
    else if (energyBand === 'fg') bands = ['f','g'];
    else if (energyBand === 'all') bands = [];

    // ── DOMESTIC EPC ──
    if (certType === 'domestic' || certType === 'both') {
      const params = new URLSearchParams({ postcode, size: size.toString() });
      bands.forEach(b => params.append('energy-band', b));

      const domUrl = `${EPC_BASE}/domestic/search?${params}`;
      try {
        const domData = await fetchEPC(domUrl, auth);
        results.domestic = (domData.rows || []).map(formatDomestic);
      } catch(e) {
        console.error('Domestic EPC error:', e.message);
        results.domesticError = e.message;
      }
    }

    // ── NON-DOMESTIC / COMMERCIAL EPC ──
    if (certType === 'commercial' || certType === 'both') {
      const params = new URLSearchParams({ postcode, size: size.toString() });
      bands.forEach(b => params.append('energy-band', b));

      const comUrl = `${EPC_BASE}/non-domestic/search?${params}`;
      try {
        const comData = await fetchEPC(comUrl, auth);
        results.commercial = (comData.rows || []).map(formatNonDomestic);
      } catch(e) {
        console.error('Commercial EPC error:', e.message);
        results.commercialError = e.message;
      }
    }

    // Combined + sorted by motivation score
    const all = [...results.domestic, ...results.commercial]
      .sort((a, b) => b.motivationScore - a.motivationScore);

    // Rating breakdown
    const ratingBreakdown = {};
    all.forEach(p => {
      const r = p.currentRating;
      ratingBreakdown[r] = (ratingBreakdown[r] || 0) + 1;
    });

    const highOpportunity = all.filter(p => p.motivationScore >= 50);
    const poorRated       = all.filter(p => ['F','G'].includes(p.currentRating));

    res.status(200).json({
      success: true,
      postcode,
      region,
      certType,
      energyBand,
      total:          all.length,
      domestic:       results.domestic.length,
      commercial:     results.commercial.length,
      poorRated:      poorRated.length,
      highOpportunity: highOpportunity.length,
      ratingBreakdown,
      data: all,
      insight: highOpportunity.length > 0
        ? `${highOpportunity.length} high-opportunity properties in ${postcode} — owners likely motivated to sell due to energy upgrade costs`
        : poorRated.length > 0
        ? `${poorRated.length} F/G rated properties found — potential motivated sellers`
        : `${all.length} properties found in ${postcode} — all meeting current energy standards`,
      fetchedAt: new Date().toISOString()
    });

  } catch(err) {
    console.error('EPC handler error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
