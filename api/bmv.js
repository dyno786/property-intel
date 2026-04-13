// api/bmv.js - Below Market Value Finder
// Compares postcode Land Registry average vs typical asking prices
// Flags properties priced below comparable sold prices

async function getLandRegistryAvg(postcode, months = 12) {
  const fromDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const query = `
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?amount ?date ?propertyType WHERE {
  ?t lrppi:pricePaid ?amount ; lrppi:transactionDate ?date ; lrppi:propertyType ?propertyType ;
     lrppi:propertyAddress ?addr .
  ?addr lrcommon:postcode "${postcode}"^^xsd:string .
  FILTER(?date >= "${fromDate}"^^xsd:date)
} ORDER BY DESC(?date) LIMIT 30`;

  try {
    const r = await fetch('https://landregistry.data.gov.uk/landregistry/query', {
      method: 'POST',
      headers: { 'Content-Type':'application/sparql-query','Accept':'application/sparql-results+json' },
      body: query,
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const bindings = d.results?.bindings || [];
    const prices = bindings.map(b => parseInt(b.amount?.value || 0)).filter(p => p > 0);
    if (!prices.length) return null;
    const avg    = Math.round(prices.reduce((a,b) => a+b, 0) / prices.length);
    const median = prices.sort((a,b) => a-b)[Math.floor(prices.length/2)];
    const byType = {};
    bindings.forEach(b => {
      const type  = (b.propertyType?.value || '').split('/').pop();
      const price = parseInt(b.amount?.value || 0);
      if (!byType[type]) byType[type] = [];
      byType[type].push(price);
    });
    const typeAvgs = {};
    Object.entries(byType).forEach(([t,ps]) => {
      typeAvgs[t] = Math.round(ps.reduce((a,b)=>a+b,0)/ps.length);
    });
    return { avg, median, count: prices.length, min: Math.min(...prices), max: Math.max(...prices), typeAvgs, months };
  } catch { return null; }
}

function bmvAnalysis(askingPrice, lrData) {
  if (!lrData || !lrData.avg) return null;
  const pct = ((askingPrice - lrData.avg) / lrData.avg * 100).toFixed(1);
  const isBMV = parseFloat(pct) < -5;
  const discount = Math.round(lrData.avg - askingPrice);
  return {
    askingPrice,
    marketAverage: lrData.avg,
    differencePercent: parseFloat(pct),
    discountAmount: discount,
    isBMV,
    verdict: isBMV
      ? `✅ ${Math.abs(pct)}% below market average — genuine BMV opportunity. ${discount > 0 ? '£'+discount.toLocaleString() : ''} discount vs comparables.`
      : parseFloat(pct) < 5
      ? `⚠️ Priced at market value — little room for BMV. Negotiate using the comparables data.`
      : `❌ ${pct}% above market average. Overprice — use comparables to negotiate down.`,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const postcode    = (req.query.postcode || '').trim().toUpperCase();
  const askingPrice = parseInt(req.query.price || '0');

  if (!postcode || postcode.length < 4) return res.status(400).json({ success:false, error:'Postcode required' });

  const lrData = await getLandRegistryAvg(postcode);

  if (!lrData) {
    return res.status(200).json({
      success: false,
      postcode,
      message: `No Land Registry sold prices found for ${postcode} in the last 12 months. Try the full postcode (e.g. LS7 4EH) or a nearby postcode.`,
      tip: 'Land Registry data updates monthly. Very new postcodes or rural areas may have fewer transactions.',
    });
  }

  const analysis = askingPrice > 0 ? bmvAnalysis(askingPrice, lrData) : null;

  res.status(200).json({
    success: true,
    postcode,
    landRegistry: lrData,
    analysis,
    negotiationTips: [
      `Market average for ${postcode}: £${lrData.avg.toLocaleString()} (${lrData.count} sales in ${lrData.months} months)`,
      `Median sold price: £${lrData.median.toLocaleString()} — use this in negotiations`,
      `Lowest comparable: £${lrData.min.toLocaleString()} — your absolute floor for offers`,
      'Print this data and present to vendor — hard to argue with Land Registry',
      'Always negotiate down from asking price — never up from your opening offer',
    ],
    propertyTypeAvgs: lrData.typeAvgs,
    source:    'HM Land Registry Price Paid Data — Open Government Licence',
    fetchedAt: new Date().toISOString(),
  });
}
