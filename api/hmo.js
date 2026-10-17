import { withApi, postcodeValue } from '../lib/http.js';

async function handler(req, res) {
  const postcode = postcodeValue(req.query.postcode, true);
  if (!postcode) return res.status(400).json({ success: false, error: 'A UK postcode or district is required' });
  res.setHeader('Cache-Control', 's-maxage=3600');
  const district = postcode.split(' ')[0];
  return res.status(200).json({
    success: true, postcode, district,
    selectiveLicensing: null, article4Direction: null, licenceFee: null,
    assessmentStatus: 'unverified', licensingType: 'Address-level check required', zoneName: district,
    notes: 'Licensing and Article 4 boundaries can divide a postcode district. The postcode alone cannot establish whether a scheme applies.',
    investorNote: 'Confirm the exact property address, proposed occupancy, current licensing schemes and planning restrictions with the responsible council before proceeding.',
    link: district.startsWith('LS') ? 'https://www.leeds.gov.uk/housing/information-for-landlords' : 'https://www.gov.uk/find-local-council',
    source: 'Council verification required; no address-level licensing dataset connected',
    fetchedAt: new Date().toISOString(),
  });
}
export default withApi(handler);
