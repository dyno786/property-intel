import { fetchWithTimeout as fetch } from './http.js';

export const EPC_SITE = 'https://get-energy-performance-data.communities.gov.uk';
export const EPC_API = 'https://api.get-energy-performance-data.communities.gov.uk/api';
export const epcToken = () => process.env.EPC_BEARER_TOKEN || process.env.EPC_API_KEY;

export async function searchCertificates({ postcode, size = 100, bands = [], commercial = false }) {
  const token = epcToken();
  if (!token) throw Object.assign(new Error('Add the bearer token from the new GOV.UK energy-data service to EPC_API_KEY in Vercel.'), { setupRequired: true });
  const params = new URLSearchParams({ postcode, page_size: String(size), current_page: '1' });
  for (const band of bands) params.append('efficiency_rating[]', band.toUpperCase());
  const response = await fetch(`${EPC_API}/${commercial ? 'non-domestic' : 'domestic'}/search?${params}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('The EPC service rejected the token. Sign in to the new GOV.UK energy-data service and replace EPC_API_KEY with its bearer token.'), { setupRequired: true });
  if (response.status === 404) return { rows: [], pagination: null };
  if (!response.ok) throw new Error(`EPC service returned ${response.status}`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('EPC service returned an unexpected response');
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error('EPC service returned an invalid certificate list');
  return { rows: payload.data.slice(0, size), pagination: payload.pagination || null };
}

export function formatCertificate(row, commercial = false) {
  const rating = String(row.currentEnergyEfficiencyBand || '?').toUpperCase();
  const score = ({ G: 70, F: 50, E: 25 })[rating] || 0;
  const certificate = String(row.certificateNumber || '');
  return {
    id: certificate, certificateNumber: certificate,
    address: [row.addressLine1, row.addressLine2, row.addressLine3, row.addressLine4, row.postTown].filter(Boolean).join(', ') || 'Address unavailable',
    postcode: row.postcode || '—', currentRating: rating,
    potentialRating: null, currentScore: null, potentialScore: null,
    propertyType: '—', builtForm: null, floorArea: null, tenure: null, heatingType: null,
    lodgementDate: row.registrationDate?.slice(0, 10) || '—',
    uprn: row.uprn || null, estimatedUpgradeCost: null,
    motivationScore: score,
    opportunityFlag: { flag: score >= 50 ? '🔴 HIGH' : score >= 25 ? '🟡 MEDIUM' : '⚪ REVIEW', reason: 'Energy-rating screening only; condition, upgrade costs and owner willingness to sell are unverified.' },
    type: commercial ? 'commercial' : 'domestic',
    link: /^\d{4}(?:-\d{4}){4}$/.test(certificate) ? `https://find-energy-certificate.service.gov.uk/energy-certificate/${certificate}` : 'https://www.gov.uk/find-energy-certificate',
  };
}
