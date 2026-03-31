// api/digest.js
// Generates and sends morning digest email via Brevo (free tier)
// Add BREVO_API_KEY and DIGEST_EMAIL to Vercel environment variables
// Set up a daily cron via Vercel or Make.com to POST /api/digest each morning at 7am

const BREVO_BASE = 'https://api.brevo.com/v3';

async function fetchEndpoint(baseUrl, path) {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return { data: [] };
    return await res.json();
  } catch {
    return { data: [] };
  }
}

function buildEmailHtml(data, date) {
  const { insolvency, planning, listings } = data;

  const sectionHtml = (title, colour, items, renderItem) => {
    if (!items || items.length === 0) return '';
    return `
      <div style="margin-bottom:28px">
        <div style="background:${colour};color:#0a0c0f;padding:8px 16px;font-weight:700;font-size:13px;letter-spacing:1px;border-radius:4px 4px 0 0">
          ${title} (${items.length})
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 4px 4px;overflow:hidden">
          ${items.map((item, i) => `
            <div style="padding:12px 16px;border-bottom:${i < items.length-1 ? '1px solid #f3f4f6' : 'none'};background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
              ${renderItem(item)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  const insolvencySection = sectionHtml(
    '⚠️ INSOLVENCY NOTICES', '#f04d7a',
    insolvency?.data?.slice(0, 10) || [],
    item => `
      <strong style="font-size:13px;color:#111">${item.title}</strong><br>
      <span style="font-size:12px;color:#6b7280">${item.category} · ${item.date}</span><br>
      <span style="font-size:11px;color:#9ca3af">${item.description?.substring(0, 150) || ''}...</span>
      ${item.link ? `<br><a href="${item.link}" style="font-size:11px;color:#4da8f0">View notice →</a>` : ''}
    `
  );

  const planningSection = sectionHtml(
    '📋 PLANNING APPLICATIONS', '#4da8f0',
    planning?.data?.slice(0, 10) || [],
    item => `
      <strong style="font-size:13px;color:#111">${item.title}</strong><br>
      <span style="font-size:12px;color:#6b7280">${item.address} · ${item.ref}</span><br>
      <span style="font-size:11px;color:${item.status === 'Approved' ? '#059669' : '#d97706'}">${item.status}</span>
      <span style="font-size:11px;color:#9ca3af"> · ${item.date}</span>
      ${item.link ? `<br><a href="${item.link}" style="font-size:11px;color:#4da8f0">View application →</a>` : ''}
    `
  );

  const listingsSection = sectionHtml(
    '🏠 NEW LISTINGS', '#c8f04d',
    listings?.data?.slice(0, 10) || [],
    item => `
      <strong style="font-size:13px;color:#111">${item.title}</strong><br>
      <span style="font-size:12px;color:#6b7280">${item.address} · ${item.type}</span><br>
      <strong style="font-size:14px;color:#059669">${item.price}</strong>
      <span style="font-size:11px;color:#9ca3af"> · Listed ${item.date}</span>
      ${item.link && item.link !== '#' ? `<br><a href="${item.link}" style="font-size:11px;color:#4da8f0">View listing →</a>` : ''}
    `
  );

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif">
      <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

        <!-- HEADER -->
        <div style="background:#0a0c0f;padding:24px 28px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="color:#c8f04d;font-weight:800;font-size:18px;letter-spacing:-0.5px">CC Property Intelligence</div>
            <div style="color:#6b7280;font-size:12px;margin-top:4px">Morning Digest · ${date}</div>
          </div>
          <div style="background:rgba(200,240,77,0.1);border:1px solid rgba(200,240,77,0.3);border-radius:20px;padding:6px 14px">
            <span style="color:#c8f04d;font-size:11px;font-weight:600">DAILY BRIEF</span>
          </div>
        </div>

        <!-- SUMMARY BAR -->
        <div style="display:flex;border-bottom:1px solid #e5e7eb">
          <div style="flex:1;padding:16px;text-align:center;border-right:1px solid #e5e7eb">
            <div style="font-size:24px;font-weight:800;color:#f04d7a">${insolvency?.count || 0}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Insolvencies</div>
          </div>
          <div style="flex:1;padding:16px;text-align:center;border-right:1px solid #e5e7eb">
            <div style="font-size:24px;font-weight:800;color:#4da8f0">${planning?.count || 0}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Planning Apps</div>
          </div>
          <div style="flex:1;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#c8f04d">${listings?.count || 0}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">New Listings</div>
          </div>
        </div>

        <!-- CONTENT -->
        <div style="padding:24px 28px">
          ${insolvencySection}
          ${planningSection}
          ${listingsSection}

          ${(!insolvency?.data?.length && !planning?.data?.length && !listings?.data?.length) ? `
            <div style="text-align:center;padding:40px 0;color:#9ca3af">
              <div style="font-size:32px">◎</div>
              <div style="margin-top:8px">No new activity found today</div>
            </div>
          ` : ''}
        </div>

        <!-- QUICK LINKS -->
        <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px">
          <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Quick Links</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <a href="https://www.sdlauctions.co.uk/property-auctions/yorkshire/" style="font-size:11px;color:#4da8f0;text-decoration:none;padding:4px 10px;border:1px solid #e5e7eb;border-radius:4px">🔨 SDL Auctions</a>
            <a href="https://www.auctionhouse.co.uk/yorkshire" style="font-size:11px;color:#4da8f0;text-decoration:none;padding:4px 10px;border:1px solid #e5e7eb;border-radius:4px">🔨 Auction House</a>
            <a href="https://www.propertylink.estatesgazette.com/search?q=leeds" style="font-size:11px;color:#4da8f0;text-decoration:none;padding:4px 10px;border:1px solid #e5e7eb;border-radius:4px">🏢 EG Propertylink</a>
            <a href="https://www.thegazette.co.uk/insolvency" style="font-size:11px;color:#4da8f0;text-decoration:none;padding:4px 10px;border:1px solid #e5e7eb;border-radius:4px">⚠️ The Gazette</a>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="background:#0a0c0f;padding:16px 28px;text-align:center">
          <span style="color:#4a5060;font-size:11px">CC Property Intelligence · Generated automatically</span>
        </div>

      </div>
    </body>
    </html>
  `;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Allow GET (for testing) or POST (for cron)
  const brevoKey   = process.env.BREVO_API_KEY;
  const digestEmail = process.env.DIGEST_EMAIL;
  const baseUrl    = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

  if (!brevoKey || !digestEmail) {
    return res.status(200).json({
      success: false,
      error: 'BREVO_API_KEY or DIGEST_EMAIL not set in environment variables',
      setupRequired: true
    });
  }

  try {
    // Fetch all data in parallel
    const [insolvency, planning, listings] = await Promise.all([
      fetchEndpoint(baseUrl, '/api/insolvency?region=leeds'),
      fetchEndpoint(baseUrl, '/api/planning?region=leeds'),
      fetchEndpoint(baseUrl, '/api/listings?region=leeds&type=listings')
    ]);

    const date = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const html = buildEmailHtml({ insolvency, planning, listings }, date);

    // Send via Brevo
    const emailRes = await fetch(`${BREVO_BASE}/smtp/email`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender:     { name: 'CC Property Intelligence', email: 'noreply@ccbeauty.co.uk' },
        to:         [{ email: digestEmail }],
        subject:    `Property Digest — ${date}`,
        htmlContent: html
      })
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Brevo error: ${errText}`);
    }

    res.status(200).json({
      success: true,
      message: `Digest sent to ${digestEmail}`,
      summary: {
        insolvency: insolvency?.count || 0,
        planning:   planning?.count || 0,
        listings:   listings?.count || 0
      }
    });

  } catch (err) {
    console.error('Digest error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
