// api/landregistry.js
// Land Registry Price Paid Data - free, open government data
// Shows what properties actually sold for in any postcode
// Updated monthly by HMLR

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const postcode = (req.query.postcode || 'LS7').trim().toUpperCase();
  const months   = parseInt(req.query.months || '12');
  const type     = req.query.type || 'all'; // all | residential | commercial

  // Calculate date range
  const dateTo   = new Date();
  const dateFrom = new Date(dateTo - months * 30 * 24 * 60 * 60 * 1000);
  const fromStr  = dateFrom.toISOString().split('T')[0];
  const toStr    = dateTo.toISOString().split('T')[0];

  // Land Registry SPARQL endpoint - free, no auth needed
  const postcodeClean = postcode.replace(' ', '+');

  // Use the Land Registry Linked Data API
  const sparqlQuery = `
    SELECT ?paon ?saon ?street ?town ?postcode ?amount ?date ?category ?propertyType ?newBuild
    WHERE {
      ?transx lrppi:pricePaid ?amount ;
              lrppi:transactionDate ?date ;
              lrppi:propertyAddress ?addr ;
              lrppi:recordStatus lrppi:add ;
              lrppi:transactionCategory ?category ;
              lrppi:propertyType ?propertyType ;
              lrppi:newBuild ?newBuild .
      ?addr lrcommon:postcode "${postcode}" .
      OPTIONAL { ?addr lrcommon:paon ?paon }
      OPTIONAL { ?addr lrcommon:saon ?saon }
      OPTIONAL { ?addr lrcommon:street ?street }
      OPTIONAL { ?addr lrcommon:town ?town }
      FILTER (?date >= "${fromStr}"^^xsd:date && ?date <= "${toStr}"^^xsd:date)
    }
    ORDER BY DESC(?date)
    LIMIT 50
  `;

  try {
    const url = `https://landregistry.data.gov.uk/landregistry/query?query=${encodeURIComponent(sparqlQuery)}&output=json`;

    const r = await fetch(url, {
      headers: {
        'Accept': 'application/sparql-results+json, application/json',
        'User-Agent': 'CC-Property-Intelligence/1.0'
      }
    });

    if (!r.ok) {
      throw new Error(`Land Registry SPARQL returned ${r.status}`);
    }

    const json = await r.json();
    const bindings = json?.results?.bindings || [];

    const sales = bindings.map(b => {
      const amount = parseInt(b.amount?.value || '0');
      const date   = b.date?.value || '—';
      const propType = formatPropertyType(b.propertyType?.value || '');
      const address  = [b.paon?.value, b.saon?.value, b.street?.value].filter(Boolean).join(' ');

      return {
        address:      address || 'Address not disclosed',
        town:         b.town?.value || '—',
        postcode,
        amount,
        formattedPrice: `£${amount.toLocaleString()}`,
        date,
        formattedDate: date !== '—' ? new Date(date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—',
        propertyType: propType,
        newBuild:     b.newBuild?.value === 'true' ? 'New Build' : 'Existing',
        category:     b.category?.value?.includes('A') ? 'Standard' : 'Additional'
      };
    });

    // Filter by type if specified
    let filtered = sales;
    if (type === 'residential') filtered = sales.filter(s => ['Detached','Semi-detached','Terraced','Flat/Maisonette'].includes(s.propertyType));
    if (type === 'commercial')  filtered = sales.filter(s => s.propertyType === 'Other');

    // Calculate stats
    const amounts = filtered.map(s => s.amount).filter(a => a > 0);
    const avgPrice    = amounts.length ? Math.round(amounts.reduce((a,b)=>a+b,0)/amounts.length) : 0;
    const medianPrice = amounts.length ? amounts.sort((a,b)=>a-b)[Math.floor(amounts.length/2)] : 0;
    const minPrice    = amounts.length ? Math.min(...amounts) : 0;
    const maxPrice    = amounts.length ? Math.max(...amounts) : 0;

    // Type breakdown
    const typeBreakdown = {};
    filtered.forEach(s => { typeBreakdown[s.propertyType] = (typeBreakdown[s.propertyType]||0)+1; });

    res.status(200).json({
      success: true,
      postcode,
      months,
      type,
      count: filtered.length,
      stats: {
        avgPrice:    avgPrice    ? `£${avgPrice.toLocaleString()}`    : '—',
        medianPrice: medianPrice ? `£${medianPrice.toLocaleString()}` : '—',
        minPrice:    minPrice    ? `£${minPrice.toLocaleString()}`    : '—',
        maxPrice:    maxPrice    ? `£${maxPrice.toLocaleString()}`    : '—',
        totalSales:  filtered.length,
        typeBreakdown
      },
      data: filtered,
      source: 'HM Land Registry Price Paid Data',
      fetchedAt: new Date().toISOString()
    });

  } catch(err) {
    // Fallback: use the simpler CSV endpoint
    try {
      const csvUrl = `https://landregistry.data.gov.uk/app/ppd/ppd_data.csv?et%5B%5D=lrppi%3AStandardPricePaidTransaction&et%5B%5D=lrppi%3AAdditionalPricePaidTransaction&ptype%5B%5D=lrppi%3ADetached&ptype%5B%5D=lrppi%3ASemiDetached&ptype%5B%5D=lrppi%3ATerraced&ptype%5B%5D=lrppi%3AFlat&ptype%5B%5D=lrppi%3AOtherPropertyType&tc%5B%5D=lrppi%3AStandardPricePaidTransaction&tc%5B%5D=lrppi%3AAdditionalPricePaidTransaction&postcode=${encodeURIComponent(postcode)}&min-date=${fromStr}&max-date=${toStr}`;

      return res.status(200).json({
        success: false,
        error: `SPARQL endpoint error: ${err.message}`,
        fallbackUrl: csvUrl,
        message: 'Use fallback URL to download CSV directly from Land Registry',
        data: []
      });
    } catch(e2) {
      res.status(500).json({ success: false, error: err.message, data: [] });
    }
  }
}

function formatPropertyType(uri) {
  if (uri.includes('Detached'))     return 'Detached';
  if (uri.includes('SemiDetached')) return 'Semi-detached';
  if (uri.includes('Terraced'))     return 'Terraced';
  if (uri.includes('Flat'))         return 'Flat/Maisonette';
  if (uri.includes('Other'))        return 'Other/Commercial';
  return uri.split('/').pop() || 'Unknown';
}
