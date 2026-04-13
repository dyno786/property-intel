// api/comparables.js - Land Registry Price Paid Data
// Free SPARQL endpoint - no API key needed
// Returns sold prices for same postcode, last 12 months

const LR_SPARQL = 'https://landregistry.data.gov.uk/landregistry/query';

function buildQuery(postcode, months) {
  const fromDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return `
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?paon ?saon ?street ?town ?postcode ?amount ?date ?propertyType ?estateType
WHERE {
  ?transx lrppi:pricePaid ?amount ;
          lrppi:transactionDate ?date ;
          lrppi:propertyType ?propertyType ;
          lrppi:estateType ?estateType ;
          lrppi:propertyAddress ?addr .
  ?addr lrcommon:postcode "${postcode.toUpperCase()}"^^xsd:string .
  OPTIONAL { ?addr lrcommon:paon ?paon }
  OPTIONAL { ?addr lrcommon:saon ?saon }
  OPTIONAL { ?addr lrcommon:street ?street }
  OPTIONAL { ?addr lrcommon:town ?town }
  FILTER(?date >= "${fromDate}"^^xsd:date)
}
ORDER BY DESC(?date)
LIMIT 50`;
}

function getTypeLabel(uri) {
  if (!uri) return 'Unknown';
  if (uri.includes('detached'))        return 'Detached';
  if (uri.includes('semi-detached'))   return 'Semi-detached';
  if (uri.includes('terraced'))        return 'Terraced';
  if (uri.includes('flat'))            return 'Flat / Maisonette';
  if (uri.includes('otherPropertyType'))return 'Other';
  return uri.split('/').pop() || 'Unknown';
}

function getEstateLabel(uri) {
  if (!uri) return '';
  if (uri.includes('freehold'))  return 'Freehold';
  if (uri.includes('leasehold')) return 'Leasehold';
  return '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const postcode = (req.query.postcode || '').trim().toUpperCase();
  const months   = Math.min(parseInt(req.query.months || '12'), 24);

  if (!postcode || postcode.length < 4) {
    return res.status(400).json({ success: false, error: 'Please provide a valid UK postcode' });
  }

  const query = buildQuery(postcode, months);

  try {
    const r = await fetch(LR_SPARQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
      },
      body: query,
    });

    if (!r.ok) {
      return res.status(502).json({ success: false, error: `Land Registry returned ${r.status}` });
    }

    const data   = await r.json();
    const bindings = data.results?.bindings || [];

    if (bindings.length === 0) {
      return res.status(200).json({
        success: true, postcode, months, count: 0, sales: [],
        message: `No sold prices found for ${postcode} in the last ${months} months. Try a nearby postcode or extend the date range.`,
      });
    }

    const sales = bindings.map(b => {
      const amount = parseInt(b.amount?.value || 0);
      let dateStr = '—';
      try { dateStr = new Date(b.date?.value).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); } catch {}
      const addr = [b.saon?.value, b.paon?.value, b.street?.value].filter(Boolean).join(', ');
      return {
        address:      addr || 'Address not disclosed',
        price:        amount,
        priceFormatted: '£' + amount.toLocaleString('en-GB'),
        date:         dateStr,
        rawDate:      b.date?.value || '',
        propertyType: getTypeLabel(b.propertyType?.value),
        tenure:       getEstateLabel(b.estateType?.value),
        postcode,
      };
    }).sort((a,b) => new Date(b.rawDate) - new Date(a.rawDate));

    // Stats
    const prices  = sales.map(s => s.price).filter(p => p > 0);
    const avg     = prices.length ? Math.round(prices.reduce((a,b)=>a+b,0) / prices.length) : 0;
    const min     = prices.length ? Math.min(...prices) : 0;
    const max     = prices.length ? Math.max(...prices) : 0;
    const median  = prices.length ? prices.sort((a,b)=>a-b)[Math.floor(prices.length/2)] : 0;

    res.status(200).json({
      success: true,
      postcode,
      months,
      count:   sales.length,
      stats: {
        average:          '£' + avg.toLocaleString('en-GB'),
        median:           '£' + median.toLocaleString('en-GB'),
        lowest:           '£' + min.toLocaleString('en-GB'),
        highest:          '£' + max.toLocaleString('en-GB'),
        averageRaw:       avg,
        medianRaw:        median,
      },
      sales,
      tip: `Use these comparables to justify your offer. If asking price is above the average ${('£'+avg.toLocaleString('en-GB'))} for this postcode, use the data to negotiate down.`,
      source:    'HM Land Registry Price Paid Data',
      licence:   'Open Government Licence v3.0',
      fetchedAt: new Date().toISOString(),
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
