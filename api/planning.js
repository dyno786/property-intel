// api/planning.js
// Gets real count from planning API (free, no credits)
// Builds direct deep links into each council's planning portal
// filtered by postcode, date range and type

const PLANNING_BASE = 'https://api.planning.org.uk/v1';

const REGIONS = {
  leeds: {
    name: 'leeds',
    lpaId: '205',
    portalBase: 'https://publicaccess.leeds.gov.uk/online-applications',
    searchUrl: (postcode, dateFrom, dateTo) => {
      const pc = postcode !== 'ALL' ? postcode : '';
      return `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced` +
        `&dateType=validated&dateFrom=${dateFrom}&dateTo=${dateTo}` +
        (pc ? `&postCode=${encodeURIComponent(pc)}` : '');
    },
    weeklyUrl: 'https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList',
    types: [
      { label: 'All Applications',         url: (from,to,pc) => buildLeedsUrl(from,to,pc,'') },
      { label: 'Change of Use',            url: (from,to,pc) => buildLeedsUrl(from,to,pc,'Change+of+Use') },
      { label: 'New Build / Development',  url: (from,to,pc) => buildLeedsUrl(from,to,pc,'Full+Planning+Permission') },
      { label: 'Demolition',               url: (from,to,pc) => buildLeedsUrl(from,to,pc,'Demolition') },
      { label: 'Prior Approval',           url: (from,to,pc) => buildLeedsUrl(from,to,pc,'Prior+Approval') },
      { label: 'Listed Building Consent',  url: (from,to,pc) => buildLeedsUrl(from,to,pc,'Listed+Building') },
    ]
  },
  bradford: {
    name: 'bradford', lpaId: '106',
    weeklyUrl: 'https://planning.bradford.gov.uk/online-applications/search.do?action=weeklyList',
    searchUrl: (postcode, dateFrom, dateTo) =>
      `https://planning.bradford.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${dateFrom}&dateTo=${dateTo}` +
      (postcode !== 'ALL' ? `&postCode=${encodeURIComponent(postcode)}` : ''),
    types: [
      { label: 'All Applications', url: (from,to,pc) => `https://planning.bradford.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${from}&dateTo=${to}` },
      { label: 'Change of Use',    url: (from,to,pc) => `https://planning.bradford.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${from}&dateTo=${to}&applicationType=Change+of+Use` },
    ]
  },
  wakefield: {
    name: 'wakefield', lpaId: '245',
    weeklyUrl: 'https://planning.wakefield.gov.uk/online-applications/search.do?action=weeklyList',
    searchUrl: (postcode, dateFrom, dateTo) =>
      `https://planning.wakefield.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${dateFrom}&dateTo=${dateTo}`,
    types: [
      { label: 'All Applications', url: (from,to) => `https://planning.wakefield.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${from}&dateTo=${to}` },
    ]
  },
  sheffield: {
    name: 'sheffield', lpaId: '213',
    weeklyUrl: 'https://planningregister.sheffield.gov.uk',
    searchUrl: (postcode, dateFrom, dateTo) =>
      `https://planningregister.sheffield.gov.uk/Search/Results?dateFrom=${dateFrom}&dateTo=${dateTo}` +
      (postcode !== 'ALL' ? `&postCode=${postcode}` : ''),
    types: [
      { label: 'All Applications', url: (from,to,pc) => `https://planningregister.sheffield.gov.uk/Search/Results?dateFrom=${from}&dateTo=${to}` },
    ]
  },
  huddersfield: {
    name: 'kirklees', lpaId: '175',
    weeklyUrl: 'https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx',
    searchUrl: (postcode, dateFrom, dateTo) =>
      `https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx`,
    types: [
      { label: 'All Applications', url: () => `https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx` },
    ]
  }
};

function buildLeedsUrl(from, to, postcode, type) {
  let url = `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${from}&dateTo=${to}`;
  if (postcode && postcode !== 'ALL') url += `&postCode=${encodeURIComponent(postcode)}`;
  if (type) url += `&applicationType=${type}`;
  return url;
}

function formatDate(date) {
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
}

function formatDateDisplay(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

let lpaCache = null;
async function getLpaId(regionName, apiKey) {
  try {
    if (!lpaCache) {
      const r = await fetch(`${PLANNING_BASE}/lpas?key=${apiKey}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!r.ok) return null;
      const json = await r.json();
      lpaCache = json.response?.data || [];
    }
    return lpaCache.find(lpa => lpa.name && lpa.name.toLowerCase().includes(regionName.toLowerCase()));
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region   = (req.query.region   || 'leeds').toLowerCase();
  const postcode = (req.query.postcode || 'all').toUpperCase();
  const apiKey   = process.env.PLANNING_API_KEY;
  const cfg      = REGIONS[region] || REGIONS.leeds;

  if (!apiKey) {
    return res.status(200).json({ success: false, error: 'PLANNING_API_KEY not set', data: [], setupRequired: true });
  }

  // Date ranges
  const now      = new Date();
  const week1End  = now;
  const week1Start = new Date(now - 7  * 24*60*60*1000);
  const week2Start = new Date(now - 14 * 24*60*60*1000);

  const w1From = formatDate(week1Start);
  const w1To   = formatDate(week1End);
  const w2From = formatDate(week2Start);
  const w2To   = formatDate(week1Start);

  try {
    // Get count from API (free, no credits)
    const lpa = await getLpaId(cfg.name, apiKey);
    const lpaId = lpa?.id || cfg.lpaId;

    const dateFromISO = new Date(Date.now() - 14*24*60*60*1000).toISOString().split('T')[0];
    const dateToISO   = now.toISOString().split('T')[0];
    const countUrl = `${PLANNING_BASE}/search?key=${apiKey}&lpa_id=${lpaId}&date_from=${dateFromISO}&date_to=${dateToISO}&return_data=0`;

    let totalCount = 0;
    try {
      const cr = await fetch(countUrl, { headers: { 'Accept': 'application/json' } });
      if (cr.ok) {
        const cj = await cr.json();
        totalCount = cj.response?.application_count || 0;
      }
    } catch(e) {}

    const pc = postcode !== 'ALL' ? postcode : '';

    // Build useful cards — each one is a different view/filter into the real portal
    const cards = [
      {
        title:    `📋 This Week — ${totalCount > 0 ? Math.round(totalCount/2) + ' est.' : 'New'} Applications`,
        address:  `${pc || region.charAt(0).toUpperCase()+region.slice(1)} · ${formatDateDisplay(week1Start)} – ${formatDateDisplay(week1End)}`,
        ref:      `${totalCount} total in 14 days · Click View to browse`,
        date:     formatDateDisplay(week1End),
        status:   'Current',
        link:     cfg.searchUrl(postcode, w1From, w1To),
        note:     'Opens Leeds planning portal filtered to this week'
      },
      {
        title:    `📋 Previous Week — Applications`,
        address:  `${pc || region.charAt(0).toUpperCase()+region.slice(1)} · ${formatDateDisplay(week2Start)} – ${formatDateDisplay(week1Start)}`,
        ref:      `Validated week of ${formatDateDisplay(week2Start)}`,
        date:     formatDateDisplay(week1Start),
        status:   'Current',
        link:     cfg.searchUrl(postcode, w2From, w2To),
        note:     'Opens planning portal filtered to previous week'
      },
      ...cfg.types.slice(0,4).map(t => ({
        title:    `🔍 ${t.label}`,
        address:  `${pc || region.charAt(0).toUpperCase()+region.slice(1)} · Last 14 days`,
        ref:      `Filter: ${t.label}`,
        date:     formatDateDisplay(now),
        status:   'Filter',
        link:     t.url(w2From, w1To, postcode),
        note:     `Opens portal filtered to ${t.label}`
      }))
    ];

    res.status(200).json({
      success: true, region, postcode,
      lpaId, lpaName: cfg.name,
      count: totalCount,
      data: cards,
      freeMode: true,
      portalLink: cfg.weeklyUrl,
      message: `${totalCount} applications in last 14 days — use cards below to browse by type, date or postcode`,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
