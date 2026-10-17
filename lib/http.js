import { timingSafeEqual } from 'node:crypto';

export function withApi(handler, methods = ['GET']) {
  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    req.query ||= {};
    if (Object.values(req.query).some(value => typeof value !== 'string')) {
      return res.status(400).json({ success: false, error: 'Query parameters must be single text values' });
    }
    if (req.method === 'POST') {
      try {
        if (typeof req.body === 'string') req.body = JSON.parse(req.body);
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new Error();
      } catch {
        return res.status(400).json({ success: false, error: 'A JSON object body is required' });
      }
    }
    try {
      return await handler(req, res);
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ success: false, error: 'Data provider unavailable. Please try again later.' });
    }
  };
}

export function requireToken(req, res, keys = ['API_ACCESS_TOKEN']) {
  res.setHeader('Cache-Control', 'no-store');
  const secrets = keys.map(key => process.env[key]).filter(Boolean);
  if (!secrets.length) {
    res.status(503).json({ success: false, setupRequired: true, error: `Configure ${keys.join(' or ')} to enable this action securely` });
    return false;
  }
  const provided = Buffer.from(req.headers?.authorization || '');
  const valid = secrets.some(secret => {
    const expected = Buffer.from(`Bearer ${secret}`);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
  if (!valid) res.status(401).json({ success: false, error: 'Authentication required' });
  return valid;
}

export function fetchWithTimeout(url, options = {}) {
  const timeout = AbortSignal.timeout(15000);
  return globalThis.fetch(url, { ...options, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
}

export function postcodeValue(value, allowDistrict = false) {
  const compact = (value || '').replace(/\s/g, '').toUpperCase();
  if (/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(compact)) {
    return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
  }
  if (allowDistrict && /^[A-Z]{1,2}\d[A-Z\d]?$/.test(compact)) return compact;
  return null;
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function propertyType(uri = '') {
  const code = uri.split('/').pop().toLowerCase().replace(/[-_]/g, '');
  return ({ semidetached: 'Semi-detached', detached: 'Detached', terraced: 'Terraced', flat: 'Flat/Maisonette', otherpropertytype: 'Other' })[code] || 'Unknown';
}
