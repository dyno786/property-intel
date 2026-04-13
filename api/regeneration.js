// api/regeneration.js - Yorkshire Regeneration Tracker
// Tracks major schemes: South Bank Leeds, East Leeds Extension, Bradford City Village etc

const SCHEMES = [
  {
    id: 'south-bank-leeds',
    name: 'South Bank Leeds',
    city: 'Leeds',
    postcodes: ['LS10','LS11'],
    status: 'Active',
    phase: 'Phase 2 — infrastructure',
    investment: '£350m public + £2bn private pipeline',
    homes: 8000,
    commercial: '1.5m sq ft office + retail',
    completion: '2038 est.',
    impact: 'high',
    description: 'Largest regeneration scheme in England outside London. Doubling the size of Leeds city centre south of the river. New bridge, parks, homes, offices. Already driving significant price uplift in LS10/LS11.',
    buyNow: true,
    tip: 'Buy in LS10/LS11 now. Infrastructure spend already underway. Prices have moved but significant upside remains before scheme completes.',
    planningRef: 'https://www.leeds.gov.uk/planning',
    newsUrl: 'https://www.placeyorkshire.co.uk/',
  },
  {
    id: 'east-leeds-extension',
    name: 'East Leeds Extension',
    city: 'Leeds',
    postcodes: ['LS14','LS15'],
    status: 'Active',
    phase: 'Phase 1 building',
    investment: '£160m infrastructure',
    homes: 4000,
    commercial: 'District centre + employment land',
    completion: '2030 est.',
    impact: 'high',
    description: '4,000 new homes approved near LS14. New roads, schools, district centre. Infrastructure spend typically pushes nearby existing property values up 12-18 months before building starts.',
    buyNow: true,
    tip: 'LS14 terrace prices still relatively low — strong rental demand from new residents during construction phase.',
    planningRef: 'https://www.leeds.gov.uk/planning',
    newsUrl: 'https://www.yorkshireeveningpost.co.uk/',
  },
  {
    id: 'bradford-city-village',
    name: 'Bradford City Village',
    city: 'Bradford',
    postcodes: ['BD1','BD3'],
    status: 'Planning',
    phase: 'Planning approved',
    investment: '£320m',
    homes: 1000,
    commercial: 'City centre mixed use',
    completion: '2032 est.',
    impact: 'medium',
    description: 'Major city centre regeneration in Bradford. 1,000 homes plus commercial space. Bradford is UK City of Culture 2025 — significant investment already underway in cultural infrastructure.',
    buyNow: true,
    tip: 'Bradford is significantly underpriced vs Leeds (30-40% cheaper). City of Culture 2025 investment already catalysing change. Early mover advantage.',
    planningRef: 'https://planning.bradford.gov.uk/',
    newsUrl: 'https://www.bdadvertiser.co.uk/',
  },
  {
    id: 'sheffield-heart-of-city',
    name: 'Sheffield Heart of the City',
    city: 'Sheffield',
    postcodes: ['S1','S3'],
    status: 'Active',
    phase: 'Phase 2 underway',
    investment: '£470m',
    homes: 1500,
    commercial: '1m sq ft mixed use',
    completion: '2028 est.',
    impact: 'medium',
    description: 'Major Sheffield city centre regeneration. New hotels, offices, apartments, retail. Adjacent sites becoming available as scheme advances.',
    buyNow: false,
    tip: 'Sheffield S1/S3 already showing strong price growth. Yields still reasonable at 6-7%.',
    planningRef: 'https://publicaccess.sheffield.gov.uk/online-applications/',
    newsUrl: 'https://www.thestar.co.uk/',
  },
  {
    id: 'wakefield-waterfront',
    name: 'Wakefield Waterfront',
    city: 'Wakefield',
    postcodes: ['WF1'],
    status: 'Planning',
    phase: 'Early stages',
    investment: '£150m est.',
    homes: 500,
    commercial: 'Waterfront mixed use',
    completion: '2030 est.',
    impact: 'low',
    description: 'Wakefield waterfront and city centre revitalisation. Early stage but Wakefield has strong fundamentals — good rail links, relatively affordable.',
    buyNow: false,
    tip: 'Monitor for planning progress. WF1 properties near station offer good commuter BTL yields now.',
    planningRef: 'https://www.wakefield.gov.uk/planning',
    newsUrl: 'https://www.wakefieldexpress.co.uk/',
  },
  {
    id: 'hs2-leeds',
    name: 'HS2 East Midlands to Leeds',
    city: 'Leeds',
    postcodes: ['LS1','LS2'],
    status: 'Political',
    phase: 'Route being reviewed',
    investment: 'TBC',
    homes: 0,
    commercial: 'Station area + transport hub',
    completion: 'Unknown',
    impact: 'medium',
    description: 'HS2 Phase 2 to Leeds — future uncertain but government remains committed. Any new station area would see major development. Current surplus land from route already being sold.',
    buyNow: false,
    tip: 'Watch planning applications near New Lane / Wellington Street area for any station-related speculation.',
    planningRef: 'https://www.gov.uk/government/collections/hs2-phase-two',
    newsUrl: 'https://www.placeyorkshire.co.uk/',
  },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const city   = (req.query.city || 'all').toLowerCase();
  const impact = (req.query.impact || 'all').toLowerCase();

  let schemes = SCHEMES;
  if (city !== 'all') schemes = schemes.filter(s => s.city.toLowerCase() === city);
  if (impact !== 'all') schemes = schemes.filter(s => s.impact === impact);

  const buyNow = schemes.filter(s => s.buyNow);

  res.status(200).json({
    success: true,
    count:   schemes.length,
    schemes,
    buyNow,
    buyNowCount: buyNow.length,
    summary: `${SCHEMES.filter(s=>s.status==='Active').length} active schemes, ${SCHEMES.filter(s=>s.buyNow).length} with buy-now recommendation`,
    monitorTip: 'Set Google Alerts for each scheme name + "planning" to get notified when new applications are submitted — earliest possible signal.',
    fetchedAt: new Date().toISOString(),
  });
}
