// api/hmo.js - Leeds HMO & Selective Licensing Checker
// Leeds City Council selective licensing zones
// No external API - hardcoded zone data from council

// Leeds selective licensing postcodes (from LCC published data)
// Article 4 Direction removes permitted development rights for HMOs in these areas
const SELECTIVE_LICENSING_ZONES = {
  // Beeston & Holbeck
  LS11: { name:'Beeston & Holbeck', licensed:true, type:'Selective Licensing', fee:900, link:'https://www.leeds.gov.uk/planning/selective-licensing', notes:'Full selective licensing area. All private rented properties need licence.' },
  // Harehills
  LS8:  { name:'Harehills',         licensed:true, type:'Selective Licensing', fee:900, link:'https://www.leeds.gov.uk/planning/selective-licensing', notes:'High demand area. HMO Article 4 applies. Licence required before letting.' },
  LS9:  { name:'East Leeds',        licensed:true, type:'Selective Licensing', fee:900, link:'https://www.leeds.gov.uk/planning/selective-licensing', notes:'Selective licensing zone. Check specific street with LCC before purchase.' },
  // Hyde Park / Headingley (student areas)
  LS6:  { name:'Hyde Park / Headingley', licensed:true, type:'Additional Licensing (HMO)', fee:1200, link:'https://www.leeds.gov.uk/planning/licensing-of-houses-in-multiple-occupation', notes:'Major student HMO area. Article 4 Direction applies — planning needed to convert to HMO. Additional licensing scheme in force.' },
  // City centre / Burmantofts
  LS2:  { name:'City Centre South', licensed:true, type:'Selective Licensing', fee:900, link:'https://www.leeds.gov.uk/planning/selective-licensing', notes:'Selective licensing. High rental demand. Check exact street.' },
  LS3:  { name:'Woodhouse',         licensed:true, type:'Additional Licensing', fee:1200, link:'https://www.leeds.gov.uk/planning/licensing-of-houses-in-multiple-occupation', notes:'Near university. HMO Article 4 applies.' },
  // Chapeltown
  LS7:  { name:'Chapeltown / Chapel Allerton', licensed:true, type:'Selective Licensing', fee:900, link:'https://www.leeds.gov.uk/planning/selective-licensing', notes:'Selective licensing active. Popular BTL area. Licence required.' },
  // Armley
  LS12: { name:'Armley',            licensed:true, type:'Selective Licensing', fee:900, link:'https://www.leeds.gov.uk/planning/selective-licensing', notes:'Selective licensing zone. Good yields. Licence required.' },
  // Bramley
  LS13: { name:'Bramley',           licensed:false, type:'Standard HMO',       fee:0,   link:'https://www.leeds.gov.uk/planning/licensing-of-houses-in-multiple-occupation', notes:'No selective licensing. Standard mandatory HMO licence applies if 5+ tenants from 2+ households.' },
  // Morley
  LS27: { name:'Morley',            licensed:false, type:'Standard HMO',       fee:0,   link:'https://www.leeds.gov.uk/planning/licensing-of-houses-in-multiple-occupation', notes:'No selective licensing. Good commuter area. Standard rules apply.' },
  // Roundhay
  LS8:  { name:'Roundhay',          licensed:false, type:'Standard HMO',       fee:0,   link:'https://www.leeds.gov.uk/planning/licensing-of-houses-in-multiple-occupation', notes:'No selective licensing in Roundhay section of LS8. Higher value area.' },
};

// Article 4 Direction areas (need planning permission for HMO conversion)
const ARTICLE_4_AREAS = ['LS6','LS3','LS2','LS4','LS5'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const postcode = (req.query.postcode || '').trim().toUpperCase();
  if (!postcode) return res.status(400).json({ success:false, error:'Postcode required' });

  // Extract district (e.g. LS7 from LS7 3AH)
  const districtMatch = postcode.match(/^([A-Z]{1,2}\d{1,2})/);
  const district = districtMatch ? districtMatch[1] : '';

  const zone = SELECTIVE_LICENSING_ZONES[district];
  const article4 = ARTICLE_4_AREAS.includes(district);

  const result = {
    postcode,
    district,
    selectiveLicensing: zone?.licensed || false,
    licensingType:      zone?.type || 'Standard HMO Rules',
    zoneName:           zone?.name || district,
    licenceFee:         zone?.fee || 0,
    article4Direction:  article4,
    notes:              zone?.notes || 'No selective licensing in this district. Standard mandatory HMO licence (£1,000-1,500) required for properties with 5+ people from 2+ households.',
    hmoRules: {
      mandatory:  '5+ tenants from 2+ households — mandatory HMO licence required everywhere in England',
      additional: zone?.licensed ? `Additional/selective licensing applies in ${district} — ALL private rented properties need a licence` : 'No additional licensing in this district',
      article4:   article4 ? `Article 4 Direction applies in ${district} — you need PLANNING PERMISSION before converting to an HMO. Check with Leeds Planning before buying.` : 'No Article 4 Direction — change to HMO use is permitted development (still need HMO licence)',
    },
    costs: {
      licenceFee:    zone?.fee > 0 ? `£${zone.fee}/property (selective licensing)` : 'No selective licensing fee',
      hmoLicence:    'Mandatory HMO licence: ~£1,000-1,500 if 5+ tenants',
      planningFee:   article4 ? '~£206 planning application fee for HMO conversion (Article 4 area)' : 'No planning fee — HMO conversion is permitted development',
      inspectionFreq:'Typically 5-year licence period',
    },
    investorNote: zone?.licensed
      ? `Factor in the £${zone.fee} selective licence fee and annual compliance costs. ${article4 ? 'Planning permission needed before converting to HMO — add 3-6 months and ~£3,000 to project timeline.' : ''}`
      : 'No selective licensing — lower compliance burden. HMO conversion permitted without planning (standard licence still required for 5+ tenants).',
    link: zone?.link || 'https://www.leeds.gov.uk/planning/licensing-of-houses-in-multiple-occupation',
    source:    'Leeds City Council Licensing Data',
    fetchedAt: new Date().toISOString(),
  };

  res.status(200).json({ success:true, ...result });
}
