// api/mortgage.js - BTL Mortgage Rate Tracker
// Curated lender rates — updated manually each quarter
// Real-time scraping of lender sites is blocked by CORS so we maintain a curated dataset

const LAST_UPDATED = '2026-04-13';

const RATES = [
  // Product: lender, LTV, rate type, rate, fee, max_loan, notes
  { lender:'Barclays',       ltv:75, type:'2yr Fix',  rate:4.89, fee:1999, maxLoan:1000000, notes:'Rental stress test at 125%', updated: LAST_UPDATED },
  { lender:'Barclays',       ltv:75, type:'5yr Fix',  rate:5.06, fee:1999, maxLoan:1000000, notes:'Good for portfolio landlords', updated: LAST_UPDATED },
  { lender:'NatWest',        ltv:75, type:'2yr Fix',  rate:4.94, fee:1995, maxLoan:750000,  notes:'Max 3 BTL properties', updated: LAST_UPDATED },
  { lender:'NatWest',        ltv:75, type:'5yr Fix',  rate:5.12, fee:1995, maxLoan:750000,  notes:'Max 3 BTL properties', updated: LAST_UPDATED },
  { lender:'Nationwide',     ltv:75, type:'2yr Fix',  rate:4.84, fee:1749, maxLoan:500000,  notes:'Max 3 BTL with Nationwide', updated: LAST_UPDATED },
  { lender:'HSBC',           ltv:75, type:'2yr Fix',  rate:4.99, fee:1999, maxLoan:1000000, notes:'Portfolio landlords welcome', updated: LAST_UPDATED },
  { lender:'HSBC',           ltv:75, type:'5yr Fix',  rate:5.09, fee:1999, maxLoan:1000000, notes:'Portfolio landlords welcome', updated: LAST_UPDATED },
  { lender:'Yorkshire BS',   ltv:75, type:'2yr Fix',  rate:4.79, fee:1495, maxLoan:750000,  notes:'Ideal for Yorkshire properties', updated: LAST_UPDATED },
  { lender:'Yorkshire BS',   ltv:75, type:'5yr Fix',  rate:4.99, fee:1495, maxLoan:750000,  notes:'Good portfolio terms', updated: LAST_UPDATED },
  { lender:'Leeds BS',       ltv:75, type:'2yr Fix',  rate:4.94, fee:999,  maxLoan:500000,  notes:'Low fee option. Local lender.', updated: LAST_UPDATED },
  { lender:'Leeds BS',       ltv:75, type:'Tracker',  rate:5.49, fee:999,  maxLoan:500000,  notes:'BOE +0.99%. Benefits from rate cuts.', updated: LAST_UPDATED },
  { lender:'Coventry BS',    ltv:75, type:'5yr Fix',  rate:5.02, fee:999,  maxLoan:1000000, notes:'Portfolio landlords. Flexible criteria', updated: LAST_UPDATED },
  { lender:'TMW (Natwest)',   ltv:75, type:'2yr Fix',  rate:4.99, fee:2495, maxLoan:2000000, notes:'Specialist BTL lender. Portfolio OK', updated: LAST_UPDATED },
  { lender:'TMW (Natwest)',   ltv:75, type:'5yr Fix',  rate:5.19, fee:2495, maxLoan:2000000, notes:'HMO acceptable', updated: LAST_UPDATED },
  { lender:'Skipton BS',     ltv:75, type:'2yr Fix',  rate:4.86, fee:1995, maxLoan:750000,  notes:'Good for first-time landlords', updated: LAST_UPDATED },
  { lender:'Precise Mortgages',ltv:75,type:'5yr Fix', rate:5.24, fee:1995, maxLoan:3000000, notes:'HMO, MUF, limited company BTL', updated: LAST_UPDATED },
  { lender:'Accord (YBS)',   ltv:80, type:'2yr Fix',  rate:5.34, fee:1495, maxLoan:500000,  notes:'80% LTV option', updated: LAST_UPDATED },
  { lender:'Fleet Mortgages', ltv:75, type:'5yr Fix', rate:5.44, fee:1995, maxLoan:5000000, notes:'Portfolio landlords specialist', updated: LAST_UPDATED },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const ltv  = parseInt(req.query.ltv || '75');
  const type = (req.query.type || 'all').toLowerCase();

  let filtered = RATES.filter(r => r.ltv <= ltv);
  if (type !== 'all') filtered = filtered.filter(r => r.type.toLowerCase().includes(type));
  filtered.sort((a,b) => a.rate - b.rate);

  const best2yr = RATES.filter(r=>r.ltv<=75&&r.type.includes('2yr')).sort((a,b)=>a.rate-b.rate)[0];
  const best5yr = RATES.filter(r=>r.ltv<=75&&r.type.includes('5yr')).sort((a,b)=>a.rate-b.rate)[0];
  const bestTrk = RATES.filter(r=>r.ltv<=75&&r.type.includes('Tracker')).sort((a,b)=>a.rate-b.rate)[0];

  const avgRate2yr = (RATES.filter(r=>r.type.includes('2yr')).reduce((s,r)=>s+r.rate,0) / RATES.filter(r=>r.type.includes('2yr')).length).toFixed(2);
  const avgRate5yr = (RATES.filter(r=>r.type.includes('5yr')).reduce((s,r)=>s+r.rate,0) / RATES.filter(r=>r.type.includes('5yr')).length).toFixed(2);

  res.status(200).json({
    success:      true,
    lastUpdated:  LAST_UPDATED,
    boeBaseRate:  4.5,
    rates:        filtered,
    bestDeals: {
      twoYear:  best2yr,
      fiveYear: best5yr,
      tracker:  bestTrk,
    },
    marketSummary: {
      avg2yr: avgRate2yr + '%',
      avg5yr: avgRate5yr + '%',
      lowestFee: 'Leeds BS at £999',
      portfolioSpecialists: ['TMW', 'Precise Mortgages', 'Fleet Mortgages'],
      hmoFriendly: ['TMW', 'Precise Mortgages', 'Fleet Mortgages'],
    },
    advice: [
      'If buying soon: 2yr fix gives lower initial rate — benefits from future rate cuts on remortgage.',
      'If holding long term: 5yr fix gives payment certainty — ideal if cashflow is tight.',
      'If expecting rate cuts: Tracker at BOE+0.99% means automatic payment drops when BOE cuts.',
      'Yorkshire Building Society and Leeds BS both have local knowledge and competitive rates for Yorkshire properties.',
      'Always use a whole-of-market broker — they access products not available direct.',
    ],
    disclaimer: 'Rates indicative — check lender websites for current offers. Rates change frequently.',
    fetchedAt:  new Date().toISOString(),
  });
}
