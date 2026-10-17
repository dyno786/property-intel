import { withApi, postcodeValue } from '../lib/http.js';

async function handler(req, res) {
  const postcode = postcodeValue(req.query.postcode);
  if (!postcode) return res.status(400).json({ success: false, error: 'A full UK postcode is required' });
  res.setHeader('Cache-Control', 's-maxage=3600');
  return res.status(200).json({
    success: true, postcode, overallRisk: 'unknown', assessmentStatus: 'unverified', bgsHazardsFound: null,
    checks: [
      { name: 'Mining & Subsidence Risk', risk: 'unknown', detail: 'Address-level mining search required', action: 'Obtain an official mining search and appropriate property survey.', link: 'https://www.gov.uk/get-information-about-a-property/search-for-mining-reports' },
      { name: 'Shrink-Swell Clay', risk: 'unknown', detail: 'Geology has not been verified for this address', action: 'Obtain a ground stability report and survey.' },
      { name: 'Radon Gas', risk: 'unknown', detail: 'Address-level radon assessment required', action: 'Check the official radon map and obtain a property report.', link: 'https://www.ukradon.org/information/ukmaps' },
      { name: 'Landfill / Contaminated Land', risk: 'unknown', detail: 'No address-level environmental search connected', action: 'Request an environmental search through your solicitor.' },
    ],
    investorNote: 'A postcode prefix cannot establish ground safety. These checks remain outstanding until address-level reports are obtained.',
    source: 'Due diligence checklist; no verified property ground-risk data', fetchedAt: new Date().toISOString(),
  });
}
export default withApi(handler);
