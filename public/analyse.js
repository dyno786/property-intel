// api/analyse.js
// AI Deal Analyser - takes a property address and returns a full investment analysis
// Uses Anthropic Claude + PropertyData + Companies House + Land Registry EPC

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { address, postcode, price, type } = req.method === 'POST'
    ? req.body
    : req.query;

  if (!address) {
    return res.status(400).json({ success: false, error: 'Address is required' });
  }

  const pdKey  = process.env.PROPERTYDATA_API_KEY;
  const chKey  = process.env.COMPANIES_HOUSE_API_KEY;

  // Gather all available data in parallel
  const dataPoints = {};

  // 1. PropertyData - prices, rents, yield for postcode
  if (pdKey && postcode) {
    try {
      const pc = postcode.trim().split(' ')[0]; // e.g. LS7
      const [pricesRes, rentsRes, statsRes] = await Promise.all([
        fetch(`https://api.propertydata.co.uk/prices?key=${pdKey}&postcode=${encodeURIComponent(pc)}`),
        fetch(`https://api.propertydata.co.uk/rents?key=${pdKey}&postcode=${encodeURIComponent(pc)}`),
        fetch(`https://api.propertydata.co.uk/postcode-key-stats?key=${pdKey}&postcode=${encodeURIComponent(pc)}`)
      ]);
      if (pricesRes.ok) dataPoints.prices = await pricesRes.json();
      if (rentsRes.ok)  dataPoints.rents  = await rentsRes.json();
      if (statsRes.ok)  dataPoints.stats  = await statsRes.json();
    } catch(e) {}
  }

  // 2. EPC data for the postcode
  if (postcode) {
    try {
      const epcRes = await fetch(
        `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}&size=5`,
        { headers: { 'Accept': 'application/json', 'Authorization': 'Basic ' + Buffer.from('ccpropertiesleeds@gmail.com:').toString('base64') } }
      );
      if (epcRes.ok) dataPoints.epc = await epcRes.json();
    } catch(e) {}
  }

  // 3. Planning history for the postcode
  if (process.env.PLANNING_API_KEY && postcode) {
    try {
      const pc = postcode.trim().split(' ')[0];
      const planRes = await fetch(
        `https://api.planning.org.uk/v1/search?key=${process.env.PLANNING_API_KEY}&lpa_id=205&date_from=2020-01-01&date_to=${new Date().toISOString().split('T')[0]}&return_data=0`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (planRes.ok) dataPoints.planning = await planRes.json();
    } catch(e) {}
  }

  // Build context string for AI
  const context = buildContext(address, postcode, price, type, dataPoints);

  // 4. Call Claude for analysis
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `You are an expert UK property investment analyst specialising in Yorkshire residential and commercial property. 
You give clear, direct, actionable investment analysis. You are honest about risks. 
You understand the Leeds market deeply — LS postcodes, regeneration areas, yield expectations, rental demand.
Always respond in valid JSON only. No markdown, no preamble.`,
        messages: [{
          role: 'user',
          content: `Analyse this property investment opportunity and respond ONLY with a JSON object:

${context}

Respond with this exact JSON structure:
{
  "verdict": "STRONG BUY | BUY | HOLD | AVOID",
  "score": 1-10,
  "headline": "one sentence investment verdict",
  "askingPrice": "formatted price or unknown",
  "estimatedValue": "your estimate based on market data",
  "grossYield": "calculated % or estimated range",
  "monthlyRent": "estimated monthly rental income",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2"],
  "risks": ["risk 1", "risk 2"],
  "opportunities": ["opportunity 1", "opportunity 2"],
  "recommendedOffer": "suggested offer price with reasoning",
  "exitStrategy": "best exit strategy for this property",
  "dueDiligence": ["check 1", "check 2", "check 3"],
  "marketContext": "2-3 sentences about this specific area/postcode",
  "actionPlan": ["step 1", "step 2", "step 3"]
}`
        }]
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Anthropic API error: ${errText}`);
    }

    const aiData = await aiRes.json();
    const rawText = aiData.content?.[0]?.text || '{}';

    let analysis;
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(clean);
    } catch(e) {
      analysis = { verdict: 'HOLD', score: 5, headline: 'Analysis complete — see details', raw: rawText };
    }

    res.status(200).json({
      success: true,
      address,
      postcode,
      price,
      type,
      analysis,
      marketData: {
        avgPrice:    dataPoints.stats?.data?.average_asking_price || null,
        avgRent:     dataPoints.rents?.data?.average || null,
        priceGrowth: dataPoints.stats?.data?.price_growth_1yr || null,
        epcRating:   dataPoints.epc?.rows?.[0]?.['current-energy-rating'] || null,
      },
      fetchedAt: new Date().toISOString()
    });

  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function buildContext(address, postcode, price, type, data) {
  let ctx = `PROPERTY: ${address}\n`;
  if (postcode) ctx += `POSTCODE: ${postcode}\n`;
  if (price)    ctx += `ASKING PRICE: ${price}\n`;
  if (type)     ctx += `PROPERTY TYPE: ${type}\n\n`;

  if (data.prices?.data) {
    const p = data.prices.data;
    ctx += `MARKET PRICES (${postcode}):\n`;
    if (p.averages) {
      Object.entries(p.averages).forEach(([k,v]) => {
        ctx += `  ${k}: avg £${v?.toLocaleString?.() || v}\n`;
      });
    }
  }

  if (data.rents?.data) {
    const r = data.rents.data;
    ctx += `\nRENTAL MARKET (${postcode}):\n`;
    if (r.averages) {
      Object.entries(r.averages).forEach(([k,v]) => {
        ctx += `  ${k}: avg £${v?.toLocaleString?.() || v}/month\n`;
      });
    }
  }

  if (data.stats?.data) {
    const s = data.stats.data;
    ctx += `\nKEY STATS:\n`;
    if (s.average_asking_price) ctx += `  Avg asking price: £${s.average_asking_price.toLocaleString()}\n`;
    if (s.average_sold_price)   ctx += `  Avg sold price: £${s.average_sold_price.toLocaleString()}\n`;
    if (s.price_growth_1yr)     ctx += `  1yr price growth: ${s.price_growth_1yr}%\n`;
    if (s.gross_yield)          ctx += `  Area gross yield: ${s.gross_yield}%\n`;
  }

  if (data.epc?.rows?.length) {
    const epc = data.epc.rows[0];
    ctx += `\nEPC DATA:\n`;
    ctx += `  Current rating: ${epc['current-energy-rating'] || '?'}\n`;
    ctx += `  Potential rating: ${epc['potential-energy-rating'] || '?'}\n`;
    ctx += `  Property type: ${epc['property-type'] || '?'}\n`;
  }

  return ctx;
}
