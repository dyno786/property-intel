// api/planning.js
// Always returns useful portal links regardless of count
// Free - no credits used

const PLANNING_BASE = 'https://api.planning.org.uk/v1';

const REGIONS = {
  leeds: {
    name: 'leeds', lpaId: '205',
    weeklyUrl: 'https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList',
    searchUrl: (pc, from, to) => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${from}&dateTo=${to}${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}`,
    types: [
      { label: 'All Applications',        icon: '📋', url: (f,t,pc) => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}` },
      { label: 'Change of Use',           icon: '🔄', url: (f,t,pc) => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}&applicationType=Change+of+Use${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}` },
      { label: 'New Build / Full PP',     icon: '🏗️', url: (f,t,pc) => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}&applicationType=Full+Application${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}` },
      { label: 'Prior Approval',          icon: '✅', url: (f,t,pc) => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}&applicationType=Prior+Approval${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}` },
      { label: 'Demolition',              icon: '🔨', url: (f,t,pc) => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}&applicationType=Demolition${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}` },
      { label: 'Listed Building Consent', icon: '🏛️', url: (f,t,pc) => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}&applicationType=Listed+Building+Consent${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}` },
    ]
  },
  bradford: {
    name: 'bradford', lpaId: '106',
    weeklyUrl: 'https://planning.bradford.gov.uk/online-applications/search.do?action=weeklyList',
    searchUrl: (pc, from, to) => `https://planning.bradford.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${from}&dateTo=${to}${pc&&pc!=='ALL'?'&postCode='+encodeURIComponent(pc):''}`,
    types: [
      { label: 'All Applications', icon: '📋', url: (f,t,pc) => `https://planning.bradford.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}` },
      { label: 'Change of Use',    icon: '🔄', url: (f,t,pc) => `https://planning.bradford.gov.uk/online-applications/search.do?action=advanced&dateType=validated&dateFrom=${f}&dateTo=${t}&applicationType=Change+of+Use` },
    ]
  },
  wakefield: {
    name: 'wakefield', lpaId: '245',
    weeklyUrl: 'https://www.wakefield.gov.uk/planning-and-building/planning-applications',
    searchUrl: (pc, from, to) => `https://www.wakefield.gov.uk/planning-and-building/planning-applications`,
    types: [{ label: 'All Applications', icon: '📋', url: () => `https://www.wakefield.gov.uk/planning-and-building/planning-applications` }]
  },
  sheffield: {
    name: 'sheffield', lpaId: '213',
    weeklyUrl: 'https://planningregister.sheffield.gov.uk',
    searchUrl: (pc, from, to) => `https://planningregister.sheffield.gov.uk/Search/Results?dateFrom=${from}&dateTo=${to}${pc&&pc!=='ALL'?'&postCode='+pc:''}`,
    types: [{ label: 'All Applications', icon: '📋', url: (f,t,pc) => `https://planningregister.sheffield.gov.uk/Search/Results?dateFrom=${f}&dateTo=${t}` }]
  },
  huddersfield: {
    name: 'kirklees', lpaId: '175',
    weeklyUrl: 'https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx',
    searchUrl: () => `https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx`,
    types: [{ label: 'All Applications', icon: '📋', url: () => `https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx` }]
  }
};

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtDisplay(d) {
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

let lpaCache = null;
async function getLpaId(name, key) {
  try {
    if (!lpaCache) {
      const r = await fetch(`${PLANNING_BASE}/lpas?key=${key}`, { headers:{'Accept':'application/json'} });
      if (r.ok) { const j = await r.json(); lpaCache = j.response?.data || []; }
    }
    return lpaCache?.find(l => l.name?.toLowerCase().includes(name.toLowerCase()));
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

  const now        = new Date();
  const week1Start = new Date(now - 7  * 864e5);
  const week2Start = new Date(now - 14 * 864e5);
  const w1From = fmtDate(week1Start); const w1To = fmtDate(now);
  const w2From = fmtDate(week2Start); const w2To = fmtDate(week1Start);
  const isoFrom = new Date(Date.now() - 14*864e5).toISOString().split('T')[0];
  const isoTo   = now.toISOString().split('T')[0];

  try {
    // Get count (free - no credits)
    const lpa = await getLpaId(cfg.name, apiKey);
    const lpaId = lpa?.id || cfg.lpaId;
    let totalCount = 0;

    try {
      const cr = await fetch(`${PLANNING_BASE}/search?key=${apiKey}&lpa_id=${lpaId}&date_from=${isoFrom}&date_to=${isoTo}&return_data=0`, { headers:{'Accept':'application/json'} });
      if (cr.ok) { const cj = await cr.json(); totalCount = cj.response?.application_count || 0; }
    } catch(e) {}

    const pc = postcode !== 'ALL' ? postcode : '';

    // ALWAYS build cards regardless of count — these are useful portal links
    const cards = [
      {
        title:   `📋 This Week — ${totalCount > 0 ? Math.round(totalCount/2)+' applications est.' : 'New Applications'}`,
        address: `${region.charAt(0).toUpperCase()+region.slice(1)}${pc?' · '+pc:''} · ${fmtDisplay(week1Start)} – ${fmtDisplay(now)}`,
        ref:     totalCount > 0 ? `${totalCount} total found in last 14 days` : 'Click View to browse this week\'s applications',
        date:    fmtDisplay(now),
        status:  'Current',
        link:    cfg.searchUrl(pc, w1From, w1To),
        note:    'Click View → opens council planning portal filtered to this week'
      },
      {
        title:   `📋 Previous Week — Applications`,
        address: `${region.charAt(0).toUpperCase()+region.slice(1)}${pc?' · '+pc:''} · ${fmtDisplay(week2Start)} – ${fmtDisplay(week1Start)}`,
        ref:     'Click View to browse last week\'s applications',
        date:    fmtDisplay(week1Start),
        status:  'Current',
        link:    cfg.searchUrl(pc, w2From, w2To),
        note:    'Click View → opens council planning portal filtered to previous week'
      },
      ...cfg.types.map(t => ({
        title:   `${t.icon} ${t.label}`,
        address: `${region.charAt(0).toUpperCase()+region.slice(1)}${pc?' · '+pc:''} · Last 14 days`,
        ref:     `Filter: ${t.label} — last 14 days`,
        date:    fmtDisplay(now),
        status:  'Filter',
        link:    t.url(w2From, w1To, pc),
        note:    `Opens portal filtered to ${t.label} only`
      }))
    ];

    res.status(200).json({
      success: true, region, postcode, lpaId, lpaName: cfg.name,
      count: totalCount,
      data: cards,  // Always return cards
      totalCards: cards.length,
      freeMode: true,
      portalLink: cfg.weeklyUrl,
      message: totalCount > 0
        ? `${totalCount} applications in last 14 days — click any card to browse by type`
        : `Click any card below to browse ${region} planning applications on the council portal`,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
}
