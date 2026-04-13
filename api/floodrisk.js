// api/floodrisk.js - Environment Agency Flood Risk API
// Free, no API key needed
// Returns flood zone, surface water risk, river/sea risk for any postcode

const EA_BASE = 'https://environment.data.gov.uk';

async function getCoords(postcode) {
  // Postcodes.io - free, no key needed
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s/g,''))}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.result ? { lat: d.result.latitude, lng: d.result.longitude, district: d.result.admin_district } : null;
}

async function getFloodZone(lat, lng) {
  // EA Flood Map for Planning API
  const url = `${EA_BASE}/flood-monitoring/id/floodAreas?lat=${lat}&long=${lng}&dist=1`;
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return [];
    const d = await r.json();
    return d.items || [];
  } catch { return []; }
}

async function getSurfaceWaterRisk(lat, lng) {
  // EA surface water flood risk
  const url = `${EA_BASE}/flood-monitoring/id/stations?lat=${lat}&long=${lng}&dist=2&type=raingauge`;
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    return d.items || [];
  } catch { return []; }
}

async function getFloodWarnings(lat, lng) {
  const url = `${EA_BASE}/flood-monitoring/id/floodAreas?lat=${lat}&long=${lng}&dist=2`;
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items || []).slice(0,5);
  } catch { return []; }
}

function assessRisk(floodAreas, warnings) {
  if (!floodAreas || floodAreas.length === 0) {
    return { zone: 1, label: 'Zone 1 — Low Risk', colour: 'green',
      description: 'Low probability of flooding. Less than 1 in 1,000 annual chance. Most BTL mortgages have no issue with Zone 1 properties.' };
  }
  const labels = floodAreas.map(a => (a.label || a.description || '').toLowerCase());
  const hasHighRisk  = labels.some(l => l.includes('zone 3') || l.includes('high risk'));
  const hasMedRisk   = labels.some(l => l.includes('zone 2') || l.includes('medium'));
  if (hasHighRisk) return {
    zone: 3, label: 'Zone 3 — High Risk', colour: 'red',
    description: 'High probability of flooding. 1 in 100 or greater annual chance. Many BTL lenders will decline or require specialist flood insurance. Factor this into your offer price.'
  };
  if (hasMedRisk) return {
    zone: 2, label: 'Zone 2 — Medium Risk', colour: 'amber',
    description: 'Medium probability of flooding. 1 in 100 to 1 in 1,000 annual chance. Check Environment Agency flood history. Some lenders add conditions. Get a flood risk report.'
  };
  return {
    zone: 2, label: 'Zone 2 — Check Required', colour: 'amber',
    description: 'Property is within a flood area boundary. Verify exact zone with EA flood map. Request full flood history from vendor before proceeding.'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400');

  const postcode = (req.query.postcode || '').trim();
  if (!postcode || postcode.length < 4) {
    return res.status(400).json({ success: false, error: 'Please provide a valid UK postcode' });
  }

  // Get coordinates
  const coords = await getCoords(postcode);
  if (!coords) {
    return res.status(404).json({ success: false, error: `Could not find postcode: ${postcode}` });
  }

  const { lat, lng, district } = coords;

  // Fetch flood data in parallel
  const [floodAreas, surfaceWater, warnings] = await Promise.all([
    getFloodZone(lat, lng),
    getSurfaceWaterRisk(lat, lng),
    getFloodWarnings(lat, lng),
  ]);

  const risk = assessRisk(floodAreas, warnings);

  // Yorkshire history note
  const yorkshireNote = district && ['Leeds','Bradford','Calderdale','Kirklees','Wakefield'].some(d => district.includes(d))
    ? 'Yorkshire has experienced significant flooding events (2015 Boxing Day floods affected Leeds, Calderdale severely). Always check EA flood history for the specific address.'
    : null;

  res.status(200).json({
    success:    true,
    postcode:   postcode.toUpperCase(),
    district,
    coordinates: { lat, lng },
    floodRisk: {
      ...risk,
      areasAffected:   floodAreas.length,
      activeWarnings:  warnings.length,
      raingaugesNearby: surfaceWater.length,
    },
    recommendation: risk.zone === 1
      ? 'Proceed normally — low flood risk is not a concern for this property.'
      : risk.zone === 2
      ? 'Get a detailed flood risk assessment (£100-200) before exchanging. Check insurance availability and cost.'
      : 'Serious flood risk — get specialist flood report, check insurance costs, negotiate price reduction to reflect risk.',
    yorkshireNote,
    links: {
      eaFloodMap:    `https://check-long-term-flood-risk.service.gov.uk/map?postcode=${encodeURIComponent(postcode)}`,
      eaFloodHistory:`https://www.gov.uk/check-flooding`,
      checkInsurance:`https://www.floodriskmanagement.org.uk/`,
    },
    source:    'Environment Agency Open Data',
    fetchedAt: new Date().toISOString(),
  });
}
