// api/planning.js
// Leeds planning portal - weekly list URLs actually work and show results
// Free - no credits used

const PLANNING_BASE = 'https://api.planning.org.uk/v1';

const REGIONS = {
  leeds: {
    name: 'leeds', lpaId: '205',
    // Weekly list URLs that ACTUALLY work on Leeds portal
    types: [
      {
        label: 'This Week — All Applications',
        icon: '📋',
        desc: 'All planning applications validated this week',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek`
      },
      {
        label: 'Last Week — All Applications',
        icon: '📋',
        desc: 'All planning applications validated last week',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList&week=lastWeek`
      },
      {
        label: 'Change of Use Applications',
        icon: '🔄',
        desc: 'Properties changing use — retail, residential, commercial',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Change+of+Use`
      },
      {
        label: 'New Build / Full Planning',
        icon: '🏗️',
        desc: 'Full planning permission applications — new developments',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Full+Application`
      },
      {
        label: 'Prior Approval',
        icon: '✅',
        desc: 'Prior approval — office to residential conversions etc',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Prior+Approval`
      },
      {
        label: 'Demolition Notices',
        icon: '🔨',
        desc: 'Demolition applications — motivated sellers',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Demolition`
      },
      {
        label: 'Enforcement Notices',
        icon: '⚠️',
        desc: 'Planning enforcement — often signals distressed owners',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=search&searchType=Enforcement`
      },
      {
        label: 'Listed Building Consent',
        icon: '🏛️',
        desc: 'Listed building applications',
        getUrl: () => `https://publicaccess.leeds.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Listed+Building+Consent`
      }
    ]
  },
  bradford: {
    name: 'bradford', lpaId: '106',
    types: [
      { label: 'This Week — All Applications', icon: '📋', desc: 'Bradford planning applications this week', getUrl: () => `https://planning.bradford.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek` },
      { label: 'Change of Use', icon: '🔄', desc: 'Change of use applications', getUrl: () => `https://planning.bradford.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Change+of+Use` },
      { label: 'Full Planning Applications', icon: '🏗️', desc: 'New build and development', getUrl: () => `https://planning.bradford.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Full+Application` },
    ]
  },
  wakefield: {
    name: 'wakefield', lpaId: '245',
    types: [
      { label: 'This Week — All Applications', icon: '📋', desc: 'Wakefield planning applications', getUrl: () => `https://planning.wakefield.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek` },
      { label: 'Change of Use', icon: '🔄', desc: 'Change of use applications', getUrl: () => `https://planning.wakefield.gov.uk/online-applications/search.do?action=weeklyList&week=thisWeek&applicationType=Change+of+Use` },
    ]
  },
  sheffield: {
    name: 'sheffield', lpaId: '213',
    types: [
      { label: 'This Week — All Applications', icon: '📋', desc: 'Sheffield planning applications', getUrl: () => `https://planningregister.sheffield.gov.uk` },
      { label: 'Weekly List', icon: '📋', desc: 'Sheffield weekly planning list', getUrl: () => `https://planningregister.sheffield.gov.uk` },
    ]
  },
  huddersfield: {
    name: 'kirklees', lpaId: '175',
    types: [
      { label: 'This Week — All Applications', icon: '📋', desc: 'Kirklees planning applications', getUrl: () => `https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx` },
      { label: 'Change of Use', icon: '🔄', desc: 'Change of use applications', getUrl: () => `https://www.kirklees.gov.uk/beta/planning-applications/search-for-planning-applications/default.aspx` },
    ]
  }
};

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

function fmtDisplay(d) {
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region  = (req.query.region  || 'leeds').toLowerCase();
  const apiKey  = process.env.PLANNING_API_KEY;
  const cfg     = REGIONS[region] || REGIONS.leeds;
  const now     = new Date();

  if (!apiKey) {
    return res.status(200).json({ success:false, error:'PLANNING_API_KEY not set', data:[], setupRequired:true });
  }

  // Get count from API (free - no credits)
  let totalCount = 0;
  try {
    const lpa = await getLpaId(cfg.name, apiKey);
    const lpaId = lpa?.id || cfg.lpaId;
    const isoFrom = new Date(Date.now() - 14*864e5).toISOString().split('T')[0];
    const isoTo   = now.toISOString().split('T')[0];
    const cr = await fetch(`${PLANNING_BASE}/search?key=${apiKey}&lpa_id=${lpaId}&date_from=${isoFrom}&date_to=${isoTo}&return_data=0`, { headers:{'Accept':'application/json'} });
    if (cr.ok) { const cj = await cr.json(); totalCount = cj.response?.application_count || 0; }
  } catch(e) {}

  // Build cards using working weekly list URLs
  const cards = cfg.types.map((t, i) => ({
    title:   `${t.icon} ${t.label}`,
    address: t.desc,
    ref:     i === 0 && totalCount > 0 ? `${totalCount} applications found in last 14 days` : 'Click to browse on council portal',
    date:    fmtDisplay(now),
    status:  i < 2 ? 'Current' : 'Filter',
    link:    t.getUrl(),
    note:    '→ Opens Leeds planning portal with results'
  }));

  res.status(200).json({
    success: true, region,
    count: totalCount,
    data: cards,
    totalCards: cards.length,
    freeMode: true,
    message: totalCount > 0
      ? `${totalCount} applications in last 14 days — click any card to browse`
      : `Click any card to browse ${region} planning applications`,
    fetchedAt: new Date().toISOString()
  });
}
