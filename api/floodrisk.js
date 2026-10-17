import { withApi, fetchWithTimeout as fetch, postcodeValue } from '../lib/http.js';

async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=900');
  const postcode = postcodeValue(req.query.postcode);
  if (!postcode) return res.status(400).json({ success: false, error: 'A full UK postcode is required' });
  const geo = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
  if (!geo.ok) return res.status(404).json({ success: false, error: 'Postcode not found' });
  const { result } = await geo.json();
  if (!result) return res.status(404).json({ success: false, error: 'Postcode not found' });
  const { latitude: lat, longitude: lng, admin_district: district } = result;
  const response = await fetch(`https://environment.data.gov.uk/flood-monitoring/id/floods?lat=${lat}&long=${lng}&dist=2`);
  if (!response.ok) throw new Error('Flood warnings unavailable');
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error('Invalid flood warnings');
  const warnings = data.items.filter(item => Number(item.severityLevel) >= 1 && Number(item.severityLevel) <= 3);
  return res.status(200).json({
    success: true, postcode, district, coordinates: { lat, lng },
    floodRisk: { zone: null, colour: 'unknown', label: 'Long-term flood risk requires an address check', activeWarnings: warnings.length },
    warnings,
    recommendation: 'Nearby flood warnings do not establish the flood zone or long-term risk for this property. Check the official flood map using the exact address.',
    links: { eaFloodMap: `https://check-long-term-flood-risk.service.gov.uk/map?postcode=${encodeURIComponent(postcode)}` },
    source: 'Environment Agency real-time flood warnings; long-term risk not assessed',
    fetchedAt: new Date().toISOString(),
  });
}
export default withApi(handler);
