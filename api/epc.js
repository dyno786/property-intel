import { withApi, postcodeValue } from '../lib/http.js';
import { searchCertificates, formatCertificate, EPC_SITE } from '../lib/epc.js';

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const postcode = postcodeValue(req.query.postcode || 'LS7', true);
  const certType = req.query.certType || 'domestic';
  const energyBand = req.query.band || 'poor';
  const size = Number(req.query.size || '100');
  if (!postcode || !Number.isInteger(size) || size < 1 || size > 500 || !['domestic', 'commercial', 'both'].includes(certType) || !['poor', 'fg', 'all'].includes(energyBand)) return res.status(400).json({ success: false, error: 'Invalid postcode, certificate type, energy band or size' });
  const bands = energyBand === 'poor' ? ['E', 'F', 'G'] : energyBand === 'fg' ? ['F', 'G'] : [];
  const types = certType === 'both' ? [false, true] : [certType === 'commercial'];
  const results = await Promise.allSettled(types.map(async commercial => {
    const result = await searchCertificates({ postcode, size, bands, commercial });
    return { ...result, rows: result.rows.map(row => formatCertificate(row, commercial)) };
  }));
  const failures = results.filter(result => result.status === 'rejected');
  const setupFailure = failures.find(result => result.reason.setupRequired);
  if (setupFailure) return res.status(503).json({ success: false, setupRequired: true, error: setupFailure.reason.message, setupUrl: EPC_SITE, data: [] });
  if (failures.length === results.length) return res.status(502).json({ success: false, error: 'EPC data provider unavailable. Please try again later.', data: [] });
  const data = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value.rows).sort((a, b) => b.motivationScore - a.motivationScore);
  const ratingBreakdown = {};
  for (const certificate of data) ratingBreakdown[certificate.currentRating] = (ratingBreakdown[certificate.currentRating] || 0) + 1;
  res.status(200).json({
    success: true, partial: failures.length > 0, postcode, certType, energyBand,
    total: data.length, domestic: data.filter(row => row.type === 'domestic').length,
    commercial: data.filter(row => row.type === 'commercial').length,
    poorRated: data.filter(row => ['F', 'G'].includes(row.currentRating)).length,
    highOpportunity: data.filter(row => row.motivationScore >= 50).length,
    ratingBreakdown, data,
    pagination: results.filter(result => result.status === 'fulfilled').map(result => result.value.pagination),
    insight: `${data.length} certificates returned. Ratings are screening signals; confirm current certificates and property details.`,
    source: 'GOV.UK Get energy performance of buildings data', fetchedAt: new Date().toISOString(),
  });
}
export default withApi(handler);
