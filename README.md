# CC Property Intelligence

Yorkshire property research dashboard: 19 static pages plus Vercel Node.js API functions.

## Development and checks

Requires Node.js 24.

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm test
```

`build` copies the pinned DOMPurify distribution and licence into `public/vendor`.
`check` validates API syntax, inline JavaScript, script boundaries and HTML rendering sinks.
Tests use mocked providers and a jsdom DOM; they do not send messages or consume paid API credits. GitHub Actions runs these checks on pushes and pull requests.

Deploy this repository with Vercel. `vercel.json` explicitly selects `public` as the output directory. Server functions remain in `api`.

## Server configuration

Set these in Vercel for the environments where each feature is needed. Never put provider keys in browser code or GitHub.

| Variable | Purpose |
| --- | --- |
| `API_ACCESS_TOKEN` | A long random private access token required for AI analysis, paid PropertyData requests and manual message sends |
| `ANTHROPIC_API_KEY` | AI property analysis |
| `PROPERTYDATA_API_KEY` | PropertyData prices, rents, stats and listings |
| `EPC_API_KEY` | Bearer token from https://get-energy-performance-data.communities.gov.uk (legacy EPC_EMAIL is no longer used) |
| `COMPANIES_HOUSE_API_KEY` | Companies House searches |
| `PLANNING_API_KEY` | Planning application counts |
| `BREVO_API_KEY`, `DIGEST_EMAIL` | Email digest |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `ALERT_PHONE_NUMBER` | WhatsApp/SMS alerts |
| `CRON_SECRET` | Optional authenticated Vercel Cron digest trigger |
| `APP_BASE_URL` | Canonical dashboard origin for digest data requests; defaults to the existing production origin |

The browser asks for `API_ACCESS_TOKEN` when a private analysis or listings request receives 401. It retains the token in page memory only. This is shared private access, not multi-user login or per-user authorisation. Keep provider credentials separate from this token.

## Messaging and health checks

- `GET /api/alert` and unauthenticated `GET /api/digest` only report configuration status. They send nothing.
- `GET /api/listings?check=1` checks paid-feature configuration without consuming PropertyData credits.
- To send an alert, POST JSON to `/api/alert` with `Authorization: Bearer <API_ACCESS_TOKEN>`.
- To send a digest, POST to `/api/digest` with the same bearer header.
- An authenticated GET to `/api/digest` is also supported for Vercel Cron, using `Authorization: Bearer <CRON_SECRET>` (or the private access token). Vercel supplies the CRON_SECRET header automatically when configured: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- No cron schedule is added automatically by this change.

## Data limitations

- Flood warnings are current warning information, not a property flood-zone assessment. Flood zones remain unknown until checked against the exact address.
- HMO licensing, Article 4 and ground/radon risk require address-level evidence; postcode-wide heuristics have been removed.
- The old static sentiment score is unavailable until a verified current market dataset is connected. Public RSS news does not invoke paid AI.
- Mortgage examples are historical and unverified, dated 13 April 2026. They are not current quotes. Regeneration and disposal directories are manually curated research references.
- A postcode EPC result is not automatically the certificate for the property being analysed.
- Pipeline and portfolio data are stored in this browser only. Use Export backup before clearing browser data or changing devices.

See [AUDIT.md](AUDIT.md) for findings, fixes and deployment verification limits.

## EPC service migration

Production verification found that the legacy Open Data Communities endpoint redirects to HTML. The adapter now uses the new GOV.UK API base, Bearer authorisation, efficiency_rating[] and page_size filters, camelCase search records and certificateNumber identifiers. Old LMK keys cannot be mapped to new certificate numbers.

Sign in to https://get-energy-performance-data.communities.gov.uk with GOV.UK One Login, get the bearer token from My account, and replace EPC_API_KEY in Vercel. EPC_BEARER_TOKEN is also accepted as an override. A rejected old key now shows explicit setup guidance. Do not replace API_ACCESS_TOKEN: it is the separate private dashboard password.

Reference: https://get-energy-performance-data.communities.gov.uk/api-technical-documentation/making-a-request
