# Property Intel audit — 17 October 2026

Audited repository: `dyno786/property-intel`, starting at commit `0c459ae330fe1f929e9dfbd6eaa9bf794ca1bb48`.

## Findings addressed

| Priority | Confirmed issue | Change |
| --- | --- | --- |
| High | Health checks call email and WhatsApp handlers that send real messages on GET | Status-only public GETs; authenticated sends; explicit method guards |
| High | Anonymous requests can consume AI and PropertyData credits | Private bearer token on analysis/listings; public news no longer runs paid AI |
| High | RSS, AI, API and saved property fields reach HTML sinks without sanitisation | Pinned local DOMPurify, shared safe renderer, safe delegated controls, print output via textContent |
| High | Dashboard, rates, BMV, alerts, direct mail, disposal and regeneration JavaScript appears as page text | Restored script boundaries and initialisers; removed truncated Cloudflare script on sourcing page |
| High | Outreach script is truncated and cannot execute | Repaired print function/script; restored navigation and query-string prefills |
| High | Missing crime/school/EPC data can appear as zero results or low risk | Explicit upstream failure/unknown states; partial crime periods identified |
| High | Flood warning areas and rain gauges treated as flood-zone evidence | Warning API uses actual warning records; long-term flood zone remains unknown |
| High | HMO district table contains duplicate LS8 key and gives address-level legal conclusions from broad postcode areas | Removed unsupported classification; exact-address council verification required |
| High | Ground-risk/radon defaults assert low risk without property evidence | Replaced with explicit unverified checklist and official search links |
| Medium | Risk summary calls string replace on the analysis object; DD context ignored by API | Structured response rendered as text; supplied DD findings included in prompt |
| Medium | Land Registry query omits prefixes and requires optional metadata; district query uses exact postcode equality | Explicit prefixes, optional metadata and district prefix filtering |
| Medium | Semi-detached labels misclassified; commercial filter mismatched; even-number median incorrect | Shared canonical type mapping and correct median across sold-price endpoints |
| Medium | Unvalidated postcode interpolation and malformed/array parameters can break SPARQL or handlers | Postcode normalisation, bounded date windows, scalar query and body validation |
| Medium | Hardcoded BOE/inflation, fabricated sentiment fallback and past auction dates presented as current | Removed fabricated fallbacks/score; dated mortgage examples; past auctions filtered; research references labelled |
| Medium | CSV mail-merge fields can contain spreadsheet formulas | CSV formula prefixes neutralised; batch/type/text validation |
| Medium | Provider fetches can hang; several network failures escape the handlers | Bounded fetch timeout and shared handler error boundary |
| Medium | Public directory contains a duplicate server analysis file | Removed unused public/analyse.js |
| Medium | No regression checks or dependency lock | Pinned dependencies, lockfile, API/DOM tests, script validation, GitHub Actions |
| Medium | Portfolio/pipeline storage can fail on malformed JSON; users may assume server persistence | Safe list loading, local-storage notice and JSON backup export; removed automatic sample records that reappeared after deleting the last item |

## Validation

- 26 automated tests in total, including EPC migration cases.
- API regression tests use mocked providers, including failure responses, authentication checks and messaging spies. No real email, SMS, WhatsApp or paid AI request was made.
- DOM tests execute all 19 pages with provider fixtures and exercise repaired controls, structured risk summaries and malicious HTML payloads. These are jsdom checks, not a real-browser rendering certification.
- API and page syntax/script-boundary checks and production asset build are included in CI.
- Production dependency audit is run separately from tests.

## Deployment and remaining work

The Vercel connector identifies project `property-intel` (`prj_akzbJsgHJHN15mcyMMbiRhNDl8jT`) but project/deployment reads and protected-site access return 403 for team `mohammed-adris-projects` (`team_HfmB2PjNljfRHGyByQLu18Tb`). No authenticated Vercel CLI was available. GitHub reports that the pre-audit main commit deployed successfully, which does not establish that the application flows work.

Production runtime logs, environment configuration, provider credentials, protected live requests and a deployed preview have not been verified. The local browser installation could not download a valid browser archive; DOM tests provide the available frontend evidence.

Before enabling the fixed private features, configure API_ACCESS_TOKEN and the appropriate provider keys in Vercel. Authorise the Vercel connection for the project's team so deployment logs and live behavior can be checked. Do not remove the authentication gates to work around missing configuration.

Verified address-level licensing/ground-risk datasets, current mortgage feeds and a sourced market-sentiment model are still needed for those assessments to be live. The existing GIAS and economic provider endpoints need live validation; failures now remain visible. Regeneration/disposal directories and calculator assumptions have not been independently revalidated as current legal or financial guidance. Multi-user login, distributed per-user rate limits and server-backed portfolio storage are separate unfinished capabilities.

Technical references consulted: Environment Agency API reference (https://environment.data.gov.uk/flood-monitoring/doc/reference), Vercel Cron security (https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Production verification follow-up

PR #1 was merged as fdb71edfdeff870e2ecb881bb6629f1a0b0d0cd5 and deployed to production. Vercel access is restored. Production homepage, rates, outreach and shared renderer return 200; private analysis returns 401 without authentication; invalid comparable input returns 400. API_ACCESS_TOKEN is configured for Production. These checks do not certify a completed paid AI request.

Runtime logs exposed an additional EPC migration: the retired API returns HTML. The follow-up adapter targets the official replacement API with Bearer authentication and the new search response fields. EPC_API_KEY must contain the replacement service's bearer token; legacy credentials are not automatically converted. Runtime logs also contain Node DEP0169 deprecation warnings; no project code calls url.parse().
