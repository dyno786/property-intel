// api/schools.js - Ofsted / EduBase free API
// Returns school ratings within radius of postcode

async function getCoords(postcode) {
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s/g,''))}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.result ? { lat: d.result.latitude, lng: d.result.longitude } : null;
}

// Haversine distance in miles
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const OFSTED_LABELS = { '1':'Outstanding','2':'Good','3':'Requires Improvement','4':'Inadequate','':'Not yet inspected' };
const OFSTED_RISK   = { '1':'low','2':'low','3':'medium','4':'high','':'neutral' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400');

  const postcode = (req.query.postcode || '').trim();
  const radiusMiles = parseFloat(req.query.radius || '1');
  if (!postcode) return res.status(400).json({ success:false, error:'Postcode required' });

  const coords = await getCoords(postcode);
  if (!coords) return res.status(404).json({ success:false, error:`Postcode not found: ${postcode}` });

  try {
    // Get-Information-About-Schools (GIAS) free API
    const url = `https://api.get-information-schools.service.gov.uk/api/schools?lat=${coords.lat}&lon=${coords.lng}&distance=${Math.ceil(radiusMiles * 1609)}&phase=Primary,Secondary&status=Open&limit=20`;
    const r   = await fetch(url, {
      headers: { 'Accept':'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    let schools = [];
    if (r.ok) {
      const d = await r.json();
      schools = (d.schools || d.results || d || []).slice(0,20);
    }

    // Format schools
    const formatted = schools.map(s => {
      const ofstedRating = String(s.ofstedRating || s.OfstedRating || '');
      const dist = distanceMiles(coords.lat, coords.lng, parseFloat(s.lat||s.Latitude||coords.lat), parseFloat(s.lon||s.Longitude||coords.lng));
      return {
        name:         s.name || s.Name || s.EstablishmentName || 'Unknown School',
        type:         s.typeOfEstablishment || s.TypeOfEstablishment || s.establishmentType || '',
        phase:        s.phase || s.Phase || '',
        ofstedRating,
        ofstedLabel:  OFSTED_LABELS[ofstedRating] || 'Not inspected',
        risk:         OFSTED_RISK[ofstedRating] || 'neutral',
        distanceMiles: dist.toFixed(2),
        postcode:     s.postcode || s.Postcode || '',
      };
    }).sort((a,b) => parseFloat(a.distanceMiles)-parseFloat(b.distanceMiles));

    const outstanding = formatted.filter(s => s.ofstedRating === '1').length;
    const good        = formatted.filter(s => s.ofstedRating === '2').length;
    const concern     = formatted.filter(s => ['3','4'].includes(s.ofstedRating)).length;

    const investorNote = outstanding + good > concern
      ? 'Good school catchment — attractive to family tenants, supports rental demand and lower voids.'
      : concern > outstanding + good
      ? 'Weaker school catchment — may deter family tenants. Consider HMO or student lets instead.'
      : 'Mixed school catchment — neutral impact on rental demand.';

    res.status(200).json({
      success: true,
      postcode: postcode.toUpperCase(),
      radius:  `${radiusMiles} mile`,
      count:   formatted.length,
      outstanding, good, concern,
      schools: formatted,
      investorNote,
      source:    'Get Information About Schools (GIAS) - DfE',
      fetchedAt: new Date().toISOString(),
    });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
}
