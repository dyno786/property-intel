// api/auctions.js - Yorkshire Auction Calendar
// Scrapes RSS / public pages from SDL, Auction House, Allsop, Pugh

const AUCTION_SOURCES = [
  {
    name: 'SDL Auctions',
    rssUrl: 'https://www.sdlauctions.co.uk/feed/',
    region: 'Yorkshire',
    upcomingUrl: 'https://www.sdlauctions.co.uk/property-auctions/yorkshire/',
    colour: '#d4a843',
  },
  {
    name: 'Auction House Yorkshire',
    rssUrl: 'https://www.auctionhouse.co.uk/rss/yorkshire',
    region: 'Yorkshire',
    upcomingUrl: 'https://www.auctionhouse.co.uk/yorkshire',
    colour: '#3b82f6',
  },
  {
    name: 'Allsop',
    rssUrl: 'https://www.allsop.co.uk/rss/residential',
    region: 'National',
    upcomingUrl: 'https://www.allsop.co.uk/auction-residential/',
    colour: '#8b5cf6',
  },
  {
    name: 'Pugh Auctions',
    rssUrl: 'https://www.pugh-auctions.com/feed',
    region: 'Yorkshire',
    upcomingUrl: 'https://www.pugh-auctions.com/upcoming-auctions',
    colour: '#22c55e',
  },
];

// Known upcoming auction dates (manually maintained as RSS is unreliable)
const UPCOMING_EVENTS = [
  { auctioneer:'SDL Auctions Yorkshire',    date:'2026-04-24', day:'24', month:'Apr', time:'9:00am', location:'Online + Leeds', lots:85, url:'https://www.sdlauctions.co.uk/property-auctions/yorkshire/' },
  { auctioneer:'Auction House Yorkshire',   date:'2026-04-30', day:'30', month:'Apr', time:'11:00am', location:'Leeds', lots:52, url:'https://www.auctionhouse.co.uk/yorkshire' },
  { auctioneer:'Allsop (National)',         date:'2026-05-06', day:'6',  month:'May', time:'10:00am', location:'London + Online', lots:200, url:'https://www.allsop.co.uk/auction-residential/' },
  { auctioneer:'SDL Auctions Yorkshire',    date:'2026-05-22', day:'22', month:'May', time:'9:00am', location:'Online + Leeds', lots:90, url:'https://www.sdlauctions.co.uk/property-auctions/yorkshire/' },
  { auctioneer:'Pugh Auctions',             date:'2026-05-28', day:'28', month:'May', time:'2:00pm', location:'Online', lots:40, url:'https://www.pugh-auctions.com/upcoming-auctions' },
  { auctioneer:'Auction House Yorkshire',   date:'2026-06-04', day:'4',  month:'Jun', time:'11:00am', location:'Leeds', lots:60, url:'https://www.auctionhouse.co.uk/yorkshire' },
];

async function fetchRSS(source) {
  try {
    const r = await fetch(source.rssUrl, {
      headers: { 'User-Agent':'Mozilla/5.0', 'Accept':'application/rss+xml,*/*', 'Accept-Encoding':'identity' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const xml  = await r.text();
    const items = [];
    const parts = xml.split(/<item[\s>]/i).slice(1);
    for (const part of parts.slice(0,8)) {
      const get = tag => {
        const m = part.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
        return m ? m[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').trim() : '';
      };
      const title = get('title');
      if (!title || title.length < 4) continue;

      // Try to extract price from title/description
      const priceMatch = (title + get('description')).match(/£([\d,]+)/);
      const price = priceMatch ? '£' + priceMatch[1] : '—';

      items.push({
        title,
        description: get('description').substring(0,200),
        link: (get('link') || '').trim(),
        pubDate: get('pubDate') || '',
        auctioneer: source.name,
        guidePrice: price,
        source: source.name,
      });
    }
    return items;
  } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const region = (req.query.region || 'yorkshire').toLowerCase();

  // Fetch RSS in parallel
  const rssResults = await Promise.all(
    AUCTION_SOURCES.filter(s => region === 'national' || s.region === 'Yorkshire')
      .map(fetchRSS)
  );
  const lots = rssResults.flat();

  res.status(200).json({
    success:   true,
    region,
    upcomingEvents: UPCOMING_EVENTS,
    lots,
    lotCount:  lots.length,
    tips: [
      'Download legal pack BEFORE auction day — no cooling off period after the hammer falls.',
      'Set your maximum bid before you enter the room — bridging costs £1,000+/month.',
      'Book a viewing — never bid without seeing the property.',
      'Pre-arrange bridging finance — you typically complete within 20-28 days.',
      'Run AI Deal Analyser on the address + guide price before attending.',
    ],
    sources: AUCTION_SOURCES.map(s => ({ name:s.name, url:s.upcomingUrl })),
    fetchedAt: new Date().toISOString(),
  });
}
