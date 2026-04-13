// api/directmail.js - Bulk Direct Mail Campaign Builder
// Takes EPC data or postcode list → generates personalised letters → returns CSV for mail merge

const TEMPLATES = {
  epc: {
    subject: 'Your Property at {address}',
    body: `Dear {salutation},

I am writing regarding your property at {address}.

I am a local property investor based in Yorkshire and I am currently looking to purchase properties in your area.

Having researched the local market, I would be very interested in discussing a potential purchase of your property. I am a cash buyer and can move quickly, meaning a hassle-free sale without the uncertainty of a property chain.

If you have ever considered selling — whether now or in the future — I would be grateful for the opportunity to have a brief conversation.

There is absolutely no obligation and I would be happy to make you an offer on a completely confidential basis.

Please feel free to contact me at your convenience.

Yours sincerely,

Mohammed Adris
CC Properties Leeds
Tel: [YOUR NUMBER]
Email: [YOUR EMAIL]

P.S. If you are not considering selling at this time, please disregard this letter. If you know of anyone who may be interested in selling, I would be grateful for any introduction.`,
  },
  probate: {
    subject: 'Property Purchase — Confidential Enquiry',
    body: `Dear {salutation},

I hope this letter finds you well at what may be a difficult time.

I am a local property investor based in Yorkshire, and I am writing to enquire whether the property at {address} may be available for sale.

I understand that administering an estate can be a complex and time-consuming process. As a cash buyer with no chain, I am in a position to proceed quickly and with minimum fuss, which may be of assistance during this period.

I would be very happy to make a confidential offer, and there is absolutely no obligation on your part.

Please do not hesitate to contact me if you would like to discuss further.

Yours sincerely,

Mohammed Adris
CC Properties Leeds
Tel: [YOUR NUMBER]`,
  },
  commercial: {
    subject: 'Commercial Property Enquiry — {address}',
    body: `Dear {salutation},

I am a commercial property investor based in Leeds, and I am writing to enquire whether the property at {address} might be available for purchase or long-term lease.

I have significant experience in commercial property across Yorkshire and I am actively looking to expand my portfolio in your area.

I would welcome the opportunity to discuss your property on a completely confidential basis, whether you are considering a sale now, in the near future, or would prefer to explore a lease arrangement.

Please feel free to contact me at your earliest convenience.

Yours sincerely,

Mohammed Adris
CC Properties Leeds`,
  },
};

function generateLetter(template, property) {
  const salutation = property.ownerName ? `Mr/Ms ${property.ownerName.split(' ').pop()}` : 'Sir/Madam';
  return template.body
    .replace(/{address}/g, property.address || 'the above property')
    .replace(/{salutation}/g, salutation)
    .replace(/{postcode}/g, property.postcode || '');
}

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape  = v => '"' + String(v || '').replace(/"/g, '""') + '"';
  return [
    headers.map(escape).join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET') {
    // Return template list and usage info
    return res.status(200).json({
      success:   true,
      templates: Object.keys(TEMPLATES),
      usage: {
        method:      'POST',
        body:        '{ "template": "epc", "properties": [{ "address": "...", "postcode": "LS7 4EH", "ownerName": "..." }] }',
        returns:     'JSON with letters array + CSV download',
        maxBatch:    200,
      },
      csvColumns: ['address','postcode','ownerName','salutation','letter','subject'],
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error:'Invalid JSON body' }); }

  const templateName = body.template || 'epc';
  const properties   = (body.properties || []).slice(0, 200);
  const template     = TEMPLATES[templateName] || TEMPLATES.epc;

  if (!properties.length) {
    return res.status(400).json({ error:'No properties provided. Send array of { address, postcode, ownerName }' });
  }

  const letters = properties.map(prop => ({
    address:    prop.address    || '',
    postcode:   prop.postcode   || '',
    ownerName:  prop.ownerName  || '',
    salutation: prop.ownerName ? `Mr/Ms ${prop.ownerName.split(' ').pop()}` : 'Sir/Madam',
    subject:    template.subject.replace(/{address}/g, prop.address || 'the property'),
    letter:     generateLetter(template, prop),
  }));

  const csv = toCSV(letters);

  res.status(200).json({
    success:    true,
    count:      letters.length,
    template:   templateName,
    letters,
    csv,
    usage: 'Copy the csv field into a .csv file and use with Word Mail Merge or any mail merge tool.',
    tip:  '1% typical response rate — send minimum 200 letters per campaign for reliable results.',
    fetchedAt:  new Date().toISOString(),
  });
}
