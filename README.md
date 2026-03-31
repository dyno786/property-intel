# CC Property Intelligence Dashboard

A real-time property intelligence tool for Leeds, Bradford, Wakefield, Sheffield and Huddersfield.

## Live Data Sources

| Panel | Source | API |
|---|---|---|
| Insolvency Notices | The Gazette (Crown Copyright) | Free |
| Planning Applications | api.planning.org.uk | Free (credits for full data) |
| Live Listings | PropertyData API | £28/month |
| Companies | Companies House | Free |
| Email Digest | Brevo | Free tier |

## Setup

### 1. Clone and deploy to Vercel

```bash
git clone https://github.com/YOUR_USERNAME/property-intelligence
cd property-intelligence
vercel --prod
```

### 2. Add Environment Variables in Vercel

Go to: Vercel Dashboard → Your Project → Settings → Environment Variables

| Variable | Where to get it |
|---|---|
| `PROPERTYDATA_API_KEY` | https://propertydata.co.uk/free-trial/10 |
| `PLANNING_API_KEY` | https://api.planning.org.uk/v1/generatekey (free, instant) |
| `COMPANIES_HOUSE_API_KEY` | https://developer.company-information.service.gov.uk/get-started |
| `BREVO_API_KEY` | https://app.brevo.com → Account → SMTP & API → API Keys |
| `DIGEST_EMAIL` | Your email address e.g. mohammed@ccbeauty.co.uk |

### 3. Redeploy after adding env vars

```bash
vercel --prod
```

### 4. Set up daily digest (optional)

**Option A — Vercel Cron (simplest)**  
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/digest",
    "schedule": "0 7 * * *"
  }]
}
```
This calls `/api/digest` every day at 7am UTC (8am UK time).

**Option B — Make.com (free tier)**  
1. Create a new scenario in Make.com
2. Add HTTP module → GET `https://your-app.vercel.app/api/digest`
3. Schedule: Daily at 7:00am

## Project Structure

```
property-intelligence/
├── public/
│   └── index.html          # Main dashboard frontend
├── api/
│   ├── insolvency.js       # The Gazette RSS feed (free)
│   ├── planning.js         # Planning applications API
│   ├── listings.js         # PropertyData listings + stats
│   ├── companies.js        # Companies House API
│   └── digest.js           # Morning email via Brevo
├── vercel.json             # Vercel config
└── package.json
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/insolvency?region=leeds` | Live insolvency notices |
| `GET /api/planning?region=leeds&postcode=LS7` | Planning applications |
| `GET /api/listings?region=leeds&postcode=LS7&type=listings` | For-sale listings |
| `GET /api/companies?type=insolvency&region=leeds` | Companies in liquidation |
| `GET /api/digest` | Trigger morning digest email |

## Regions Supported

- `leeds` — LS1 through LS28
- `bradford` — BD1 through BD18
- `wakefield` — WF1 through WF17
- `sheffield` — S1 through S21
- `huddersfield` — HD1 through HD9
