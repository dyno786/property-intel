// api/alert.js
// Sends WhatsApp or SMS alerts via Twilio
// Add to Vercel env vars:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM  (e.g. whatsapp:+14155238886)
//   ALERT_PHONE_NUMBER    (e.g. whatsapp:+447700000000 or +447700000000 for SMS)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET');

  const sid      = process.env.TWILIO_ACCOUNT_SID;
  const token    = process.env.TWILIO_AUTH_TOKEN;
  const from     = process.env.TWILIO_WHATSAPP_FROM;
  const to       = process.env.ALERT_PHONE_NUMBER;

  // Build alert message from query or body
  const data = req.method === 'POST' ? req.body : req.query;
  const { type, message, count, region } = data;

  if (!sid || !token || !from || !to) {
    return res.status(200).json({
      success: false,
      error: 'Twilio credentials not set. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, ALERT_PHONE_NUMBER to Vercel env vars.',
      setupRequired: true,
      setupGuide: 'https://www.twilio.com/try-twilio — free trial gives you £15 credit'
    });
  }

  const alertMessages = {
    planning:   `🏗️ *CC Property Intel*\n📋 *${count || 'New'} Planning Applications* in ${region || 'Leeds'}\nNew applications in the last 24hrs — check your dashboard now.\n\nhttps://property-intel.vercel.app`,
    insolvency: `⚠️ *CC Property Intel*\n🚨 *${count || 'New'} Insolvency Alerts* in ${region || 'Leeds'}\nNew companies in distress — potential property opportunities.\n\nhttps://property-intel.vercel.app`,
    pub:        `🍺 *CC Property Intel*\n🔔 *New Pub Disposal Alert*\n${message || 'A new pub has appeared on a disposal list in your target area.'}\n\nhttps://property-intel.vercel.app/pubs`,
    auction:    `🔨 *CC Property Intel*\n📅 *New Auction Catalogue*\n${message || 'New Yorkshire auction lots have been published.'}\n\nhttps://www.sdlauctions.co.uk/property-auctions/yorkshire/`,
    digest:     buildDailyDigest(data),
    custom:     message || 'CC Property Intelligence Alert'
  };

  const body = alertMessages[type] || alertMessages.custom;

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ From: from, To: to, Body: body }).toString()
      }
    );

    if (!twilioRes.ok) {
      const err = await twilioRes.text();
      throw new Error(`Twilio error: ${err}`);
    }

    const twilioData = await twilioRes.json();

    res.status(200).json({
      success: true,
      messageSid: twilioData.sid,
      to,
      type,
      sentAt: new Date().toISOString()
    });

  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function buildDailyDigest(data) {
  const date = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
  return `📊 *CC Property Intelligence*
*Morning Digest — ${date}*

📋 Planning: ${data.planning || '—'} new applications
⚠️ Insolvency: ${data.insolvency || '—'} alerts
🍺 Pub Disposals: ${data.pubs || '—'} new listings
🏠 Properties: ${data.listings || '—'} for sale

Open dashboard:
https://property-intel.vercel.app

_CC Properties Leeds_`;
}
