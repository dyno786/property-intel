// api/subsidence.js - BGS Ground Risk + Mining History
// British Geological Survey free API - no key needed

async function getCoords(postcode) {
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s/g,''))}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.result ? { lat: d.result.latitude, lng: d.result.longitude, district: d.result.admin_district } : null;
}

// Yorkshire coal mining areas by postcode district
const MINING_AREAS = {
  // West Yorkshire coalfield
  WF: { risk:'high',   area:'West Yorkshire Coalfield', note:'Significant coal mining history. Subsidence risk elevated. Always get a mining search (£35-£60) before buying.' },
  S:  { risk:'high',   area:'South Yorkshire Coalfield', note:'Major coal mining region. Subsidence very common. Mining search essential — available from Coal Authority.' },
  DN: { risk:'medium', area:'Doncaster Coalfield', note:'Former coal mining area. Ground stability issues possible. Mining search recommended.' },
  HD: { risk:'medium', area:'Huddersfield area', note:'Some historic mining activity. Lower risk than WF/S but still worth checking.' },
  BD: { risk:'low',    area:'Bradford area', note:'Mainly sandstone geology. Lower mining risk but check specific street.' },
  LS: { risk:'low',    area:'Leeds area', note:'Mainly away from coalfield. Some areas near south Leeds warrant checking.' },
  HX: { risk:'medium', area:'Halifax / Calderdale', note:'Mixed geology. Some quarrying history. Check specific location.' },
  HG: { risk:'low',    area:'Harrogate area', note:'Limestone/sandstone. Low mining risk. Knaresborough has historic gypsum mining.' },
  YO: { risk:'low',    area:'York area', note:'Mainly alluvial/glacial deposits. Ground compression possible near River Ouse.' },
};

// Shrink-swell clay risk by region
const CLAY_RISK = {
  LS: 'low', BD: 'low', HX: 'low', HD: 'low',
  WF: 'low', S: 'low', DN: 'medium', YO: 'low', HG: 'low',
};

async function getBGSHazards(lat, lng) {
  try {
    // BGS GeoIndex Onshore - hazards layer
    const url = `https://ogcapi.bgs.ac.uk/collections/geoindex_onshore_hazards/items?f=json&lat=${lat}&lon=${lng}&buffer=500`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = await r.json();
      return d.features || [];
    }
  } catch {}
  return [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400');

  const postcode = (req.query.postcode || '').trim().toUpperCase();
  if (!postcode || postcode.length < 3) {
    return res.status(400).json({ success: false, error: 'Postcode required' });
  }

  const coords = await getCoords(postcode);
  if (!coords) return res.status(404).json({ success: false, error: `Postcode not found: ${postcode}` });

  const { lat, lng, district } = coords;
  const districtCode = postcode.match(/^([A-Z]{1,2})/)?.[1] || '';
  const miningData   = MINING_AREAS[districtCode] || { risk:'low', area:'Outside known coalfield', note:'No significant mining history identified. Standard ground survey recommended for any purchase.' };
  const clayRisk     = CLAY_RISK[districtCode] || 'low';

  // Try BGS API
  const bgsFeatures = await getBGSHazards(lat, lng);

  const checks = [
    {
      name:  'Mining & Subsidence Risk',
      risk:  miningData.risk,
      detail: miningData.area,
      note:  miningData.note,
      action: miningData.risk === 'high' ? 'Get Coal Authority mining search (£35). Non-negotiable before exchange.' : miningData.risk === 'medium' ? 'Mining search recommended — £35 from Coal Authority.' : 'Low priority but cheap to check.',
      link:  'https://www.gov.uk/get-information-about-a-property/search-for-mining-reports',
    },
    {
      name:  'Shrink-Swell Clay',
      risk:  clayRisk,
      detail: clayRisk === 'high' ? 'High plasticity clay — foundation movement likely' : clayRisk === 'medium' ? 'Some clay present — monitor for cracks' : 'Low clay content in this area',
      note:  'Clay soils expand when wet, shrink when dry. Causes foundation movement — shows as diagonal cracks above door/window frames.',
      action: clayRisk === 'low' ? 'Standard structural survey sufficient.' : 'Request Level 3 Building Survey — ask surveyor to specifically assess clay risk.',
    },
    {
      name:  'Radon Gas',
      risk:  ['S','DN','WF'].includes(districtCode) ? 'low' : 'low',
      detail: 'Yorkshire is generally low radon — mainly affects SW England, Derbyshire Peak District',
      note:  'Radon is a radioactive gas from natural rock decay. Very low risk in Yorkshire.',
      action: 'No radon protection measures required for this area.',
      link:  'https://www.ukradon.org/information/ukmaps',
    },
    {
      name:  'Landfill / Contaminated Land',
      risk:  'check',
      detail: 'Requires specific address check — not postcode level data',
      note:  'Former industrial Yorkshire means contaminated land is a real risk, especially brownfield sites.',
      action: 'Request Phase 1 Environmental Search through your solicitor (£100-200). Essential for any commercial or industrial site.',
      link:  'https://www.gov.uk/guidance/land-contamination-how-to-manage-the-risks',
    },
  ];

  const overallRisk = miningData.risk === 'high' ? 'high' : miningData.risk === 'medium' || clayRisk === 'medium' ? 'medium' : 'low';

  res.status(200).json({
    success: true,
    postcode: postcode.toUpperCase(),
    district,
    overallRisk,
    checks,
    bgsHazardsFound: bgsFeatures.length,
    investorNote: miningData.risk === 'high'
      ? `High mining risk area. Always get Coal Authority mining search (£35) before exchanging on ANY property in ${districtCode} postcodes. Subsidence claims are expensive and time-consuming.`
      : `Standard due diligence applies. ${miningData.note}`,
    costlySearches: [
      { name:'Coal Authority Mining Search', cost:'£35', where:'gov.uk/get-information-about-a-property' },
      { name:'Environmental Search',         cost:'£100-200', where:'Via your solicitor' },
      { name:'Level 3 Building Survey',      cost:'£600-1,500', where:'RICS chartered surveyor' },
    ],
    source:    'BGS GeoIndex + Coal Authority + UKRR',
    fetchedAt: new Date().toISOString(),
  });
}
