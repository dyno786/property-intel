// api/planning.js
// Uses return_data=0 (FREE - no credits needed) to get application counts
// Links directly to council portal for full details

const PLANNING_BASE = 'https://api.planning.org.uk/v1';

const REGION_NAMES = {
  leeds:        'leeds',
  bradford:     'bradford',
  wakefield:    'wakefield',
  sheffield:    'sheffield',
  huddersfield: 'kirklees'
};

const PORTAL_LINKS = {
  leeds:        'https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList',
  bradford:     'https://planning.bradford.gov.uk/online-applications/search.do?action=weeklyList',
  wakefield:    'https://www.wakefield.gov.uk/planning-and-building/planning-applications',
  sheffield:    'https://planningregister.sheffield.gov.uk',
  huddersfield: 'https://www.kirklees.gov.uk/beta/planning-applications'
};

let lpaCache = null;

async function getLpaId(regionName, apiKey) {
  try {
    if (!lpaCache) {
      const r = await fetch(`${PLANNING_BASE}/lpas?key=${apiKey}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'CC-Property-Intelligence/1.0' }
      });
      if (!r.ok) return null;
      const json = await r.json();
      lpaCache = json.response?.data || [];
    }
    const match = lpaCache.find(lpa =>
      lpa.name && lpa.name.toLowerCase().includes(regionName.toLowerCase())
    );
    return match ? { id: match.id, name: match.name, count: match.application_count } : null;
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region   = (req.query.region   || 'leeds').toLowerCase();
  const postcode = (req.query.postcode || 'all').toUpperCase();
  const apiKey   = process.env.PLANNING_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'PLANNING_API_KEY not set',
      data: [], setupRequired: true
    });
  }

  const regionName  = REGION_NAMES[region] || region;
  const portalLink  = PORTAL_LINKS[region] || PORTAL_LINKS.leeds;

  try {
    const lpa = await getLpaId(regionName, apiKey);

    if (!lpa) {
      return res.status(200).json({
        success: true, region,
        count: 0, data: [],
        message: 'LPA not found in planning API',
        portalLink,
        fetchedAt: new Date().toISOString()
      });
    }

    // return_data=0 is FREE — gives application count only, no credits used
    const dateTo   = new Date().toISOString().split('T')[0];
    const dateFrom = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `${PLANNING_BASE}/search?key=${apiKey}&lpa_id=${lpa.id}&date_from=${dateFrom}&date_to=${dateTo}&return_data=0`;

    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CC-Property-Intelligence/1.0' }
    });

    if (!r.ok) {
      throw new Error(`Planning API returned ${r.status}`);
    }

    const json = await r.json();
    const appCount = json.response?.application_count || 0;

    // Since we can't get full data for free, return summary cards that link to portal
    // Generate date-range summary entries as placeholder cards
    const weeks = [];
    for (let i = 0; i < 2; i++) {
      const weekEnd   = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
      weeks.push({
        title:    `${appCount > 0 ? appCount : 'New'} Planning Applications — ${lpa.name}`,
        address:  `Week of ${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        postcode: region.toUpperCase(),
        ref:      `LPA: ${lpa.name} (${lpa.id})`,
        date:     weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        status:   'Current',
        link:     portalLink,
        note:     'Click View to see full list on council portal',
        source:   'Planning Portal API'
      });
    }

    res.status(200).json({
      success: true, region, postcode,
      lpaId: lpa.id,
      lpaName: lpa.name,
      count: appCount,
      data: appCount > 0 ? weeks : [],
      freeMode: true,
      portalLink,
      message: appCount > 0
        ? `${appCount} applications found in last 14 days — click View to see full list on council portal`
        : 'No applications found in last 14 days',
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
