// api/planning.js
// Fetches real planning applications from api.planning.org.uk
// Free searches — generate your key at https://api.planning.org.uk/v1/generatekey
// Full data return costs small credits — free searches return count + refs

const PLANNING_BASE = 'https://api.planning.org.uk/v1';

// LPA IDs for our regions (Local Planning Authority IDs)
const LPA_IDS = {
  leeds:        '2482',  // Leeds City Council
  bradford:     '2406',  // Bradford MDC
  wakefield:    '2563',  // Wakefield MDC
  sheffield:    '2514',  // Sheffield City Council
  huddersfield: '2436'   // Kirklees (Huddersfield)
};

// Postcode to LPA mapping for Leeds sub-filtering
const POSTCODE_AREAS = {
  'LS1':  'Leeds City Centre',
  'LS2':  'Leeds City Centre',
  'LS6':  'Headingley',
  'LS7':  'Chapeltown',
  'LS8':  'Roundhay / Harehills',
  'LS9':  'East Leeds',
  'LS11': 'Beeston / South Leeds',
  'LS12': 'Armley',
  'all':  'All Leeds'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region   = (req.query.region   || 'leeds').toLowerCase();
  const postcode = (req.query.postcode || 'all').toUpperCase();
  const apiKey   = process.env.PLANNING_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      success: false,
      error: 'PLANNING_API_KEY not set. Get your free key at https://api.planning.org.uk/v1/generatekey',
      data: [],
      setupRequired: true
    });
  }

  const lpaId = LPA_IDS[region] || LPA_IDS.leeds;

  try {
    // Get applications from last 14 days
    const dateTo   = new Date().toISOString().split('T')[0];
    const dateFrom = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const url = `${PLANNING_BASE}/search?key=${apiKey}&lpa_id=${lpaId}&date_from=${dateFrom}&date_to=${dateTo}&return_data=1`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Planning API returned ${response.status}`);
    }

    const json = await response.json();

    if (json.response?.status !== 'OK') {
      throw new Error(json.response?.message || 'Planning API error');
    }

    let applications = json.response?.data || [];

    // Filter by postcode if specified
    if (postcode !== 'ALL') {
      applications = applications.filter(app =>
        app.postcode && app.postcode.toUpperCase().startsWith(postcode)
      );
    }

    // Format for dashboard
    const formatted = applications.map(app => ({
      title:     app.title || app.description || 'Planning Application',
      address:   app.address || '—',
      postcode:  app.postcode || '—',
      ref:       `Ref: ${app.keyval || '—'}`,
      date:      app.validated ? new Date(app.validated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      status:    app.status || 'Current',
      link:      app.externalLink || `https://publicaccess.leeds.gov.uk/online-applications/`,
      source:    'Planning Portal'
    }));

    res.status(200).json({
      success: true,
      region,
      postcode,
      count: formatted.length,
      data: formatted,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Planning API error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
