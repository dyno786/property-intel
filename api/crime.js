// api/crime.js - Police.uk free API - no key needed
// Returns crime counts by category for a postcode

async function getCoords(postcode) {
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s/g,''))}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.result ? { lat: d.result.latitude, lng: d.result.longitude } : null;
}

const CATEGORY_LABELS = {
  'anti-social-behaviour':       'Anti-Social Behaviour',
  'bicycle-theft':               'Bicycle Theft',
  'burglary':                    'Burglary',
  'criminal-damage-arson':       'Criminal Damage & Arson',
  'drugs':                       'Drugs',
  'other-theft':                 'Other Theft',
  'possession-of-weapons':       'Weapons Possession',
  'public-order':                'Public Order',
  'robbery':                     'Robbery',
  'shoplifting':                 'Shoplifting',
  'theft-from-the-person':       'Theft from Person',
  'vehicle-crime':               'Vehicle Crime',
  'violent-crime':               'Violent Crime',
  'other-crime':                 'Other Crime',
};

function riskLevel(count, category) {
  const thresholds = {
    'anti-social-behaviour': [10,25],
    'burglary':              [3,8],
    'violent-crime':         [5,15],
    'vehicle-crime':         [4,10],
    'criminal-damage-arson': [3,8],
    'drugs':                 [2,6],
  };
  const [low, high] = thresholds[category] || [5,15];
  if (count <= low)  return 'low';
  if (count <= high) return 'medium';
  return 'high';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400');

  const postcode = (req.query.postcode || '').trim();
  if (!postcode) return res.status(400).json({ success:false, error:'Postcode required' });

  const coords = await getCoords(postcode);
  if (!coords) return res.status(404).json({ success:false, error:`Postcode not found: ${postcode}` });

  try {
    // Get last 3 months of crime data
    const now   = new Date();
    const dates = [0,1,2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth()-i-1, 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    });

    const allCrimes = [];
    await Promise.all(dates.map(async date => {
      try {
        const r = await fetch(
          `https://data.police.uk/api/crimes-street/all-crime?lat=${coords.lat}&lng=${coords.lng}&date=${date}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (r.ok) {
          const crimes = await r.json();
          if (Array.isArray(crimes)) allCrimes.push(...crimes);
        }
      } catch {}
    }));

    // Aggregate by category
    const counts = {};
    for (const crime of allCrimes) {
      const cat = crime.category || 'other-crime';
      counts[cat] = (counts[cat] || 0) + 1;
    }

    const breakdown = Object.entries(counts)
      .sort((a,b) => b[1]-a[1])
      .map(([cat, count]) => ({
        category:   cat,
        label:      CATEGORY_LABELS[cat] || cat,
        count,
        risk:       riskLevel(count, cat),
      }));

    const total = allCrimes.length;
    const burglary = counts['burglary'] || 0;
    const asb      = counts['anti-social-behaviour'] || 0;
    const violent  = counts['violent-crime'] || 0;

    let overallRisk = 'low';
    if (total > 60 || burglary > 8 || violent > 15) overallRisk = 'high';
    else if (total > 30 || burglary > 3 || violent > 5) overallRisk = 'medium';

    const investorNote = overallRisk === 'low'
      ? 'Low crime area — good for family tenants, lower void risk, easier to let.'
      : overallRisk === 'medium'
      ? 'Average crime levels — factor into rental pricing. HMO or student lets may be more appropriate than family BTL.'
      : 'High crime area — price discount likely needed. Consider commercial or HMO use. Higher insurance costs.';

    res.status(200).json({
      success: true,
      postcode: postcode.toUpperCase(),
      period:  '3 months',
      total,
      overallRisk,
      burglary,
      asb,
      violent,
      breakdown,
      investorNote,
      source:    'Police.uk Open Data API',
      fetchedAt: new Date().toISOString(),
    });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
}
