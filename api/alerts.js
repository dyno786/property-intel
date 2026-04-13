// api/alerts.js - Google Alerts search terms for property intelligence
// Returns pre-built search queries the user can set up as Google Alerts

const ALERT_SETS = {
  council: [
    { query:'"Leeds City Council" "disposal" OR "for sale" property', freq:'daily',  category:'Council Disposals' },
    { query:'"Bradford Council" "surplus" OR "disposal" property',    freq:'daily',  category:'Council Disposals' },
    { query:'"Wakefield Council" property "for sale" OR disposal',    freq:'daily',  category:'Council Disposals' },
    { query:'"Sheffield Council" property surplus disposal',          freq:'weekly', category:'Council Disposals' },
    { query:'Leeds "executive board" property disposal site',        freq:'weekly', category:'Council Disposals' },
  ],
  university: [
    { query:'"Sheffield Hallam" property surplus "for sale" estate', freq:'daily',  category:'University Disposals' },
    { query:'"University of Leeds" estate surplus property',          freq:'weekly', category:'University Disposals' },
    { query:'"Leeds Beckett" property "for sale" estate',            freq:'weekly', category:'University Disposals' },
    { query:'"University of Bradford" estate disposal property',     freq:'weekly', category:'University Disposals' },
    { query:'Yorkshire university "campus" "for sale" OR disposal',  freq:'weekly', category:'University Disposals' },
  ],
  nhs: [
    { query:'NHS Yorkshire property "for sale" OR surplus estate',   freq:'weekly', category:'NHS Disposals' },
    { query:'"NHS Property Services" disposal Yorkshire',            freq:'weekly', category:'NHS Disposals' },
    { query:'GP surgery "for sale" Leeds OR Bradford OR Sheffield',  freq:'weekly', category:'NHS Disposals' },
    { query:'former hospital site "planning permission" Yorkshire',  freq:'weekly', category:'NHS Disposals' },
  ],
  supermarket: [
    { query:'Asda property "for sale" OR disposal Yorkshire',        freq:'daily',  category:'Supermarket Disposals' },
    { query:'Morrisons property "surplus" OR "disposal" Yorkshire',  freq:'daily',  category:'Supermarket Disposals' },
    { query:'Aldi "surplus sites" OR "for sale" Yorkshire',          freq:'weekly', category:'Supermarket Disposals' },
    { query:'Lidl "disposal list" OR "surplus" property',           freq:'weekly', category:'Supermarket Disposals' },
    { query:'supermarket "store closure" Yorkshire 2026',           freq:'daily',  category:'Supermarket Disposals' },
  ],
  insolvency: [
    { query:'insolvency administration Leeds Bradford Yorkshire commercial property', freq:'daily',  category:'Insolvency' },
    { query:'administration receivers Yorkshire commercial property 2026',           freq:'daily',  category:'Insolvency' },
    { query:'Yorkshire "winding up" commercial property 2026',                      freq:'weekly', category:'Insolvency' },
    { query:'hotel administration Leeds OR Bradford OR Sheffield 2026',             freq:'weekly', category:'Insolvency' },
  ],
  market: [
    { query:'Leeds property market prices 2026',                    freq:'daily',  category:'Market Intelligence' },
    { query:'Yorkshire BTL landlord rental yield 2026',             freq:'weekly', category:'Market Intelligence' },
    { query:'"Bank of England" rate decision mortgage BTL',         freq:'daily',  category:'Market Intelligence' },
    { query:'Yorkshire regeneration planning approved 2026',        freq:'weekly', category:'Market Intelligence' },
    { query:'Leeds "planning permission" "change of use" residential', freq:'daily', category:'Market Intelligence' },
  ],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400');

  const category = (req.query.category || 'all').toLowerCase();
  let alerts = [];

  if (category === 'all') {
    alerts = Object.values(ALERT_SETS).flat();
  } else if (ALERT_SETS[category]) {
    alerts = ALERT_SETS[category];
  }

  const googleAlertsUrl = q => `https://www.google.com/alerts#${encodeURIComponent(q)}`;

  const enriched = alerts.map(a => ({
    ...a,
    googleUrl: googleAlertsUrl(a.query),
    setupUrl:  'https://alerts.google.com',
  }));

  res.status(200).json({
    success:    true,
    count:      enriched.length,
    categories: Object.keys(ALERT_SETS),
    alerts:     enriched,
    setupInstructions: [
      '1. Go to alerts.google.com',
      '2. Paste each search query into the search box',
      '3. Click Show Options — set frequency (daily/weekly)',
      '4. Set delivery to your email',
      '5. Click Create Alert',
      '6. Repeat for each query — takes 10 minutes total',
    ],
    tip: `Set up all ${Object.values(ALERT_SETS).flat().length} alerts for complete market monitoring. Daily alerts for highest-value sources, weekly for background monitoring.`,
    fetchedAt: new Date().toISOString(),
  });
}
