// api/disposals.js - Public Sector & Institutional Disposals
// Leeds Council page + static curated lists for NHS, Govt, Universities, Supermarkets

const SUPERMARKET_SOURCES = [
  { name:'Aldi', status:'active', url:'https://www.aldi.co.uk/corporate/property/sites-for-sale', contact:'RealEstateDisposals@aldi.co.uk', notes:'Updated quarterly. Email directly.' },
  { name:'Lidl', status:'active', url:'https://www.realestate-lidl.co.uk/sites-for-sale-and-to-let', contact:'Via website', notes:'National disposal list published every 6 months.' },
  { name:'Asda', status:'hot',    url:'https://www.asda.com/property', contact:'Newsteer (car parks) · Eastdil Secured (stores)', notes:'£568m sold Nov 2025. More coming. TDR Capital driving disposals.' },
  { name:'Morrisons', status:'hot', url:'https://www.morrisons-property.com', contact:'Bradford HQ directly', notes:'CD&R raised £3.2bn. Bradford-based — approach direct.' },
  { name:'Co-op', status:'active', url:'https://www.coop.co.uk/corporate/property', contact:'Via website', notes:'Ongoing convenience store closures.' },
  { name:'Tesco', status:'occasional', url:'https://www.tesco.com/property', contact:'CBRE / Savills', notes:'Selective — surplus car parks and Express sites.' },
  { name:'Wilko (former)', status:'hot', url:'https://www.hilco.com/', contact:'Hilco (administrators)', notes:'Former Wilko units 5,000-15,000 sq ft across Yorkshire.' },
];

const COUNCIL_SOURCES = [
  { name:'Leeds City Council',    status:'active', url:'https://www.leeds.gov.uk/commercial-opportunities/council-owned-land-and-property-for-sale-or-to-let', notes:'40-50 sites/yr. Capital Receipts programme.' },
  { name:'Bradford MDC',          status:'active', url:'https://www.bradford.gov.uk/business/property-for-sale-or-rent', notes:'City Village regeneration creating surplus land.' },
  { name:'Wakefield MDC',         status:'active', url:'https://www.wakefield.gov.uk/business/property-for-sale', notes:'Former mining communities land. Brownfield opportunities.' },
  { name:'Sheffield CC',          status:'active', url:'https://www.sheffield.gov.uk/property-for-sale', notes:'Heart of the City — adjacent sites becoming available.' },
  { name:'Kirklees (Huddersfield)',status:'active',url:'https://www.kirklees.gov.uk/council-and-democracy/property', notes:'Town centre civic buildings.' },
  { name:'Calderdale',            status:'active', url:'https://www.calderdale.gov.uk/v2/residents/council-and-democracy/land-property', notes:'Flood zone land disposals ongoing.' },
];

const INSTITUTIONAL_SOURCES = [
  { name:'NHS Surplus Land Register', status:'active', url:'https://digital.nhs.uk/data-and-information/publications/statistical/nhs-surplus-land', notes:'£717m nationally. Updated bi-annually. Free open data.' },
  { name:'NHS Property Services',     status:'active', url:'https://www.property.nhs.uk/', notes:'600+ disposals. Former GP surgeries, health centres.' },
  { name:'Government Property Finder',status:'active', url:'https://www.gov.uk/find-property', notes:'40-day advance window before open market.' },
  { name:'HS2 Surplus Land',          status:'active', url:'https://www.find-tender.service.gov.uk/', notes:'Route to Leeds. Active disposal programme Dec 2025.' },
  { name:'Network Rail Property',     status:'active', url:'https://www.networkrailproperty.co.uk/', notes:'Former goods yards, lineside land, urban sites.' },
  { name:'Sheffield Hallam University',status:'hot',   url:'https://www.shu.ac.uk/about-us', notes:'Actively selling listed Victorian buildings now — Collegiate Crescent Campus.' },
  { name:'Church of England',         status:'active', url:'https://www.churchofengland.org/about/church-commissioners/property', notes:'3rd largest UK landowner. Hundreds of redundant churches annually.' },
  { name:'MoD / DIO Disposals',       status:'active', url:'https://www.gov.uk/guidance/estate-disposals', notes:'Former drill halls, TA centres, barracks.' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const type = (req.query.type || 'all').toLowerCase();

  const response = {
    success: true,
    supermarkets:   type === 'all' || type === 'supermarkets'  ? SUPERMARKET_SOURCES  : [],
    councils:       type === 'all' || type === 'councils'      ? COUNCIL_SOURCES      : [],
    institutional:  type === 'all' || type === 'institutional' ? INSTITUTIONAL_SOURCES: [],
    totalHot:       [...SUPERMARKET_SOURCES, ...COUNCIL_SOURCES, ...INSTITUTIONAL_SOURCES].filter(s=>s.status==='hot').length,
    totalActive:    [...SUPERMARKET_SOURCES, ...COUNCIL_SOURCES, ...INSTITUTIONAL_SOURCES].filter(s=>s.status==='active').length,
    fetchedAt: new Date().toISOString(),
  };

  res.status(200).json(response);
}
