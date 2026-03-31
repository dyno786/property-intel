// api/planning.js
// Planning applications via api.planning.org.uk
// Dynamically looks up LPA IDs by name to avoid hardcoding errors

const PLANNING_BASE = 'https://api.planning.org.uk/v1';

const REGION_NAMES = {
  leeds:        'leeds',
  bradford:     'bradford',
  wakefield:    'wakefield',
  sheffield:    'sheffield',
  huddersfield: 'kirklees'
};

// Cache LPA IDs in memory during function lifetime
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
    return match ? match.id : null;
  } catch(e) {
    return null;
  }
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
      error: 'PLANNING_API_KEY not set in Vercel environment variables',
      data: [], setupRequired: true
    });
  }

  try {
    // Step 1: Look up LPA ID dynamically
    const regionName = REGION_NAMES[region] || region;
    const lpaId = await getLpaId(regionName, apiKey);

    if (!lpaId) {
      return res.status(200).json({
        success: false,
        error: `Could not find LPA ID for region: ${regionName}. The planning API may not cover this council.`,
        data: [],
        lpaLookupFailed: true
      });
    }

    // Step 2: Search for applications in last 14 days
    const dateTo   = new Date().toISOString().split('T')[0];
    const dateFrom = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // return_data=0 is free, gives count only
    // return_data=1 costs credits but gives full data
    const searchUrl = `${PLANNING_BASE}/search?key=${apiKey}&lpa_id=${lpaId}&date_from=${dateFrom}&date_to=${dateTo}&return_data=1`;

    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CC-Property-Intelligence/1.0' }
    });

    if (response.status === 403) {
      return res.status(200).json({
        success: false,
        error: 'Planning API key rejected (403). Get a new key at: https://api.planning.org.uk/v1/generatekey?email=ccpropertiesleeds@gmail.com',
        data: [], keyError: true
      });
    }

    if (!response.ok) {
      throw new Error(`Planning API returned ${response.status}`);
    }

    const json = await response.json();

    if (json.response?.status !== 'OK') {
      // No results is fine — not an error
      if (json.response?.message?.includes('No matching')) {
        return res.status(200).json({
          success: true, region, postcode, lpaId,
          count: 0, data: [],
          fetchedAt: new Date().toISOString()
        });
      }
      return res.status(200).json({
        success: false,
        error: `Planning API: ${json.response?.message || JSON.stringify(json.response)}`,
        data: []
      });
    }

    let applications = json.response?.data || [];

    // Filter by postcode prefix if specified
    if (postcode !== 'ALL' && postcode !== '') {
      applications = applications.filter(app =>
        app.postcode && app.postcode.toUpperCase().startsWith(postcode)
      );
    }

    const formatted = applications.map(app => ({
      title:    app.title || app.description || 'Planning Application',
      address:  app.address || '—',
      postcode: app.postcode || '—',
      ref:      `Ref: ${app.keyval || '—'}`,
      date:     app.validated
        ? new Date(app.validated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—',
      status:   app.status || 'Current',
      link:     app.externalLink || '#',
      source:   'Planning Portal'
    }));

    res.status(200).json({
      success: true, region, postcode, lpaId,
      count: formatted.length,
      data: formatted,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
