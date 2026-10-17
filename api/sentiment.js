import { withApi } from '../lib/http.js';

async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600');
  return res.status(200).json({
    success: false, score: null, verdict: 'Unavailable', colourBand: 'unknown',
    headline: 'Current market sentiment has not been verified.',
    recommendation: 'Review dated market sources and property-specific figures before making an investment decision.',
    error: 'No verified current market dataset is connected. The previous static score has been removed.',
  });
}
export default withApi(handler);
