import { withApi, fetchWithTimeout as fetch } from '../lib/http.js';
// api/boe.js - Bank of England + ONS Economic Indicators
// All free APIs, no key needed

async function fetchBOERate() {
  try {
    // BOE Statistical Interactive Database - IUDBEDR = Bank Rate
    const r = await fetch(
      `https://www.bankofengland.co.uk/boeapps/database/fromshowcolumns.asp?Travel=NIxSUx&FromSeries=1&ToSeries=50&DAT=RNG&FD=1&FM=Jan&FY=2024&TD=${new Date().getUTCDate()}&TM=${new Date().toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}&TY=${new Date().getUTCFullYear()}&VFD=Y&html.x=66&html.y=26&C=IUDBEDR&csv.x=1`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const text = await r.text();
      const lines = text.trim().split('\n').filter(l => l.trim());
      const last = lines[lines.length - 1];
      const parts = last.split(',');
      if (parts.length >= 2) {
        const rate = parseFloat(parts[1]);
        const date = parts[0].replace(/"/g, '').trim();
        if (!isNaN(rate)) return { rate, date, source: 'Bank of England' };
      }
    }
  } catch {}
  return { rate: null, date: null, source: 'Bank of England', unavailable: true };
}

async function fetchInflation() {
  try {
    // ONS CPI API
    const r = await fetch(
      'https://api.ons.gov.uk/v1/datasets/cpih01/timeseries/l55o/data',
      { signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const d = await r.json();
      const months = d.months || [];
      const last = months[months.length - 1];
      if (last && Number.isFinite(Number(last.value))) return { rate: Number(last.value), period: last.label, source: 'ONS CPIH' };
    }
  } catch {}
  return { rate: null, period: null, source: 'ONS CPIH', unavailable: true };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600');

  const [boe, inflation] = await Promise.allSettled([fetchBOERate(), fetchInflation()]);
  const boeData = boe.value || { rate: null, unavailable: true };
  const cpiData = inflation.value || { rate: null, unavailable: true };

  const indicators = [
    { label: 'BOE Base Rate', value: boeData.rate == null ? 'Unavailable' : boeData.rate + '%', change: boeData.date || 'Provider unavailable', colour: 'amber', icon: '🏦' },
    { label: 'CPIH Inflation', value: cpiData.rate == null ? 'Unavailable' : cpiData.rate + '%', change: cpiData.period || 'Provider unavailable', colour: 'amber', icon: '📈' },
  ];
  res.status(200).json({ success: true, partial: boeData.rate == null || cpiData.rate == null,
    baseRate: boeData, inflation: cpiData, indicators,
    rateOutlook: 'No verified forecast connected.', nextMeetingDate: null,
    investorNote: 'Check observation dates. Mortgage quotes and property yields must be obtained separately.',
    source: 'Bank of England + ONS', fetchedAt: new Date().toISOString(),
  });
}
export default withApi(handler);
