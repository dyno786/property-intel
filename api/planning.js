// api/planning.js
// Planning applications - api.planning.org.uk
// Free key: https://api.planning.org.uk/v1/generatekey?email=YOUR@EMAIL

const PLANNING_BASE = 'https://api.planning.org.uk/v1';

const LPA_IDS = {
  leeds:        '114',
  bradford:     '105',
  wakefield:    '128',
  sheffield:    '123',
  huddersfield: '110'
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
      error: 'PLANNING_API_KEY not set in Vercel environment variables',
      data: [],
      setupRequired: true
    });
  }

  const lpaId = LPA_IDS[region] || LPA_IDS.leeds;

  try {
    const dateTo   = new Date().toISOString().split('T')[0];
    const dateFrom = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // First try: search without return_data to verify key works (free)
    const searchUrl = `${PLANNING_BASE}/search?key=${apiKey}&lpa_id=${lpaId}&date_from=${dateFrom}&date_to=${dateTo}`;

    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'CC-Property-Intelligence/1.0' }
    });

    // If 403 - key issue, return helpful message
    if (response.status === 403) {
      return res.status(200).json({
        success: false,
        error: 'Planning API key rejected (403). Your key may be invalid. Get a new one at: https://api.planning.org.uk/v1/generatekey?email=ccpropertiesleeds@gmail.com',
        data: [],
        keyError: true,
        apiKeyUsed: apiKey ? `${apiKey.substring(0,4)}...` : 'not set'
      });
    }

    if (!response.ok) {
      throw new Error(`Planning API returned ${response.status}`);
    }

    const json = await response.json();

    if (json.response?.status !== 'OK') {
      return res.status(200).json({
        success: false,
        error: `Planning API error: ${json.response?.message || JSON.stringify(json)}`,
        data: []
      });
    }

    let applications = json.response?.data || [];

    // Filter by postcode if specified
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
      date:     app.validated ? new Date(app.validated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      status:   app.status || 'Current',
      link:     app.externalLink || `https://publicaccess.leeds.gov.uk/online-applications/`,
      source:   'Planning Portal'
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
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
