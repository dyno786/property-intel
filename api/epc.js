// api/epc.js
// Downloads EPC certificates for a postcode
// Flags F/G rated properties as motivated sellers (facing upgrade costs)
// Free - EPC Register open data

const EPC_BASE = 'https://epc.opendatacommunities.org/api/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const postcode = req.query.postcode || 'LS7';
  const filter   = req.query.filter   || 'all'; // all | poor | good | recent

  // EPC API uses basic auth with email as username
  // Register free at https://epc.opendatacommunities.org
  const epcEmail = process.env.EPC_EMAIL || 'ccpropertiesleeds@gmail.com';
  const epcKey   = process.env.EPC_API_KEY || '';
  const auth     = Buffer.from(`${epcEmail}:${epcKey}`).toString('base64');

  try {
    const url = `${EPC_BASE}/domestic/search?postcode=${encodeURIComponent(postcode)}&size=100`;
    const r = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (r.status === 401) {
      return res.status(200).json({
        success: false,
        error: 'EPC API requires registration. Register free at https://epc.opendatacommunities.org and add EPC_EMAIL + EPC_API_KEY to Vercel env vars.',
        setupRequired: true,
        data: []
      });
    }

    if (!r.ok) {
      throw new Error(`EPC API returned ${r.status}`);
    }

    const json = await r.json();
    const rows = json.rows || [];

    // Process and flag opportunities
    const processed = rows.map(p => {
      const currentRating  = p['current-energy-rating']   || '?';
      const potentialRating = p['potential-energy-rating'] || '?';
      const currentScore   = parseInt(p['current-energy-efficiency'])   || 0;
      const potentialScore = parseInt(p['potential-energy-efficiency']) || 0;
      const improvementCost = estimateImprovementCost(currentRating, potentialRating);

      return {
        address:         p['address'] || p['address1'] || '—',
        postcode:        p['postcode'] || postcode,
        currentRating,
        potentialRating,
        currentScore,
        potentialScore,
        propertyType:    p['property-type'] || '—',
        builtForm:       p['built-form'] || '—',
        floorArea:       p['total-floor-area'] || '—',
        lodgementDate:   p['lodgement-date'] || '—',
        tenure:          p['tenure'] || '—',
        heatingType:     p['main-fuel'] || '—',
        estimatedUpgradeCost: improvementCost,
        opportunityFlag: getOpportunityFlag(currentRating, improvementCost),
        motivationScore: getMotivationScore(currentRating, p['tenure'], p['lodgement-date']),
        link:            `https://find-energy-certificate.service.gov.uk/energy-certificate/${p['lmk-key']}`
      };
    });

    // Filter based on request
    let filtered = processed;
    if (filter === 'poor')   filtered = processed.filter(p => ['F','G','E'].includes(p.currentRating));
    if (filter === 'good')   filtered = processed.filter(p => ['A','B','C'].includes(p.currentRating));
    if (filter === 'recent') filtered = processed.filter(p => p.lodgementDate >= '2023-01-01');

    // Sort by motivation score (highest first)
    filtered.sort((a,b) => b.motivationScore - a.motivationScore);

    // Summary stats
    const ratingCounts = {};
    processed.forEach(p => { ratingCounts[p.currentRating] = (ratingCounts[p.currentRating]||0)+1; });
    const poorRated = processed.filter(p => ['F','G'].includes(p.currentRating));

    res.status(200).json({
      success: true,
      postcode,
      filter,
      total: processed.length,
      filtered: filtered.length,
      poorRated: poorRated.length,
      ratingBreakdown: ratingCounts,
      data: filtered,
      insight: poorRated.length > 0
        ? `${poorRated.length} F/G rated properties in ${postcode} — these landlords face £8,000-£15,000 upgrade costs by 2028 and may prefer to sell`
        : `No F/G rated properties found — good quality stock in ${postcode}`,
      fetchedAt: new Date().toISOString()
    });

  } catch(err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}

function estimateImprovementCost(current, potential) {
  const costs = { 'G': 15000, 'F': 12000, 'E': 8000, 'D': 4000, 'C': 1500 };
  return costs[current] || 0;
}

function getOpportunityFlag(rating, cost) {
  if (['F','G'].includes(rating)) return { flag: '🔴 HIGH', reason: `Facing £${cost.toLocaleString()} mandatory upgrade — motivated seller` };
  if (['E'].includes(rating))     return { flag: '🟡 MEDIUM', reason: `May face future upgrade requirements` };
  return { flag: '🟢 LOW', reason: 'Good EPC rating — less pressure to sell' };
}

function getMotivationScore(rating, tenure, date) {
  let score = 0;
  if (rating === 'G') score += 40;
  if (rating === 'F') score += 30;
  if (rating === 'E') score += 15;
  if (tenure === 'rental') score += 20;
  // Older certificates = property hasn't been actively managed
  if (date && date < '2020-01-01') score += 15;
  if (date && date < '2018-01-01') score += 10;
  return score;
}
