// api/insolvency.js
// The Gazette insolvency notices — uses their linked data API (not RSS)
// Free, Crown Copyright, Open Government Licence

const GAZETTE_BASE = 'https://www.thegazette.co.uk';

const REGION_SEARCH = {
  leeds:        'leeds',
  bradford:     'bradford',
  wakefield:    'wakefield',
  sheffield:    'sheffield',
  huddersfield: 'huddersfield'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const region = (req.query.region || 'leeds').toLowerCase();
  const searchTerm = REGION_SEARCH[region] || 'leeds';

  try {
    // Use The Gazette's linked data search API — returns JSON-LD
    // This endpoint is public and free
    const url = `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(searchTerm)}&notice-type=2100,2150,2160&format=json`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json, application/ld+json, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // If JSON endpoint fails, try the search page API
    if (!response.ok) {
      // Fallback: use Gazette search with location filter
      const fallbackUrl = `${GAZETTE_BASE}/all-notices/notice?text=${encodeURIComponent(searchTerm)}&notice-type=2100&format=json&start-publish-date=${getDateDaysAgo(30)}`;
      const fb = await fetch(fallbackUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, */*' }
      });

      if (!fb.ok) {
        return res.status(200).json({
          success: false,
          error: `Gazette returned ${response.status} — their RSS may be geo-blocking Vercel IPs. Try The Gazette directly: https://www.thegazette.co.uk/insolvency`,
          data: [],
          gazetteBlocked: true,
          workaround: 'Visit https://www.thegazette.co.uk/insolvency and search manually for ' + searchTerm
        });
      }

      const fbText = await fb.text();
      return res.status(200).json({
        success: false,
        error: 'Gazette primary endpoint unavailable — using fallback',
        raw: fbText.substring(0, 500),
        data: []
      });
    }

    const text = await response.text();

    // Try parse as JSON
    let notices = [];
    try {
      const json = JSON.parse(text);
      // Handle various Gazette JSON formats
      const items = json['@graph'] || json.items || json.notices || json.results || [];
      notices = items.slice(0, 20).map(item => ({
        title:       item.title || item['schema:name'] || item.name || 'Insolvency Notice',
        description: (item.description || item['schema:description'] || item.content || '').replace(/<[^>]+>/g,'').substring(0,300),
        link:        item['@id'] || item.url || item.link || `${GAZETTE_BASE}/insolvency`,
        date:        item.publishedDate || item['schema:datePublished'] || item.date || '—',
        category:    item.noticeType || item.type || 'Corporate Insolvency',
        source:      'The Gazette'
      }));
    } catch(e) {
      // If not JSON, it's probably HTML or XML — Gazette is blocking
      return res.status(200).json({
        success: false,
        error: 'Gazette returned non-JSON response — their API may be blocking server requests',
        gazetteBlocked: true,
        responsePreview: text.substring(0, 200),
        data: [],
        workaround: `Visit https://www.thegazette.co.uk/insolvency and search for "${searchTerm}" manually`
      });
    }

    res.status(200).json({
      success: true, region, searchTerm,
      count: notices.length,
      totalFetched: notices.length,
      data: notices,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      gazetteBlocked: true,
      data: [],
      workaround: `The Gazette may be blocking automated requests. Visit https://www.thegazette.co.uk/insolvency directly.`
    });
  }
}

function getDateDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}
