import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import alert from '../api/alert.js';
import digest from '../api/digest.js';
import analyse from '../api/analyse.js';
import listings from '../api/listings.js';
import directmail from '../api/directmail.js';
import landregistry from '../api/landregistry.js';
import comparables from '../api/comparables.js';
import crime from '../api/crime.js';
import schools from '../api/schools.js';
import flood from '../api/floodrisk.js';
import hmo from '../api/hmo.js';
import subsidence from '../api/subsidence.js';
import epc from '../api/epc.js';
import sentiment from '../api/sentiment.js';
import { median, propertyType, postcodeValue } from '../lib/http.js';

const originalEnv = { ...process.env };
afterEach(() => { for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]; Object.assign(process.env, originalEnv); });
function invoke(handler, { method = 'GET', query = {}, body, headers = {} } = {}) {
  const response = { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  return Promise.resolve(handler({ method, query, body, headers }, response)).then(() => response);
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('health GETs never invoke messaging providers, even when configured', async t => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'test', TWILIO_AUTH_TOKEN: 'test', TWILIO_WHATSAPP_FROM: 'test', ALERT_PHONE_NUMBER: 'test', API_ACCESS_TOKEN: 'test-secret', BREVO_API_KEY: 'test', DIGEST_EMAIL: 'test@example.invalid' });
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not send'); });
  for (const handler of [alert, digest]) { const response = await invoke(handler); assert.equal(response.body.statusOnly, true); assert.equal(response.body.configured, true); }
  assert.equal(fetch.mock.callCount(), 0);
});
test('messaging and paid APIs reject unauthenticated requests before fetching', async t => {
  process.env.API_ACCESS_TOKEN = 'test-secret';
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not fetch'); });
  for (const handler of [alert, digest, analyse, listings]) {
    const response = await invoke(handler, { method: 'POST', body: {}, headers: {} });
    assert.ok([401, 405].includes(response.code));
  }
  assert.equal((await invoke(listings)).code, 401);
  assert.equal(fetch.mock.callCount(), 0);
});
test('authorized alert sends once; unsupported methods never send', async t => {
  Object.assign(process.env, { API_ACCESS_TOKEN: 'test-secret', TWILIO_ACCOUNT_SID: 'test', TWILIO_AUTH_TOKEN: 'test', TWILIO_WHATSAPP_FROM: 'test', ALERT_PHONE_NUMBER: 'private-recipient' });
  const fetch = t.mock.method(globalThis, 'fetch', async () => json({ sid: 'message-id' }));
  const r = await invoke(alert, { method: 'POST', body: { type: 'custom', message: 'test' }, headers: { authorization: 'Bearer test-secret' } });
  assert.equal(r.body.success, true); assert.equal(r.body.to, undefined); assert.equal(fetch.mock.callCount(), 1);
  assert.equal((await invoke(alert, { method: 'DELETE' })).code, 405); assert.equal(fetch.mock.callCount(), 1);
});
test('missing secure setup fails closed', async () => {
  delete process.env.API_ACCESS_TOKEN;
  assert.equal((await invoke(analyse, { method: 'POST', body: { address: 'Test' } })).code, 503);
});
test('invalid JSON, arrays and repeated query params return 400', async () => {
  assert.equal((await invoke(directmail, { method: 'POST', body: '{' })).code, 400);
  assert.equal((await invoke(directmail, { method: 'POST', body: [] })).code, 400);
  assert.equal((await invoke(comparables, { query: { postcode: ['LS7', 'LS8'] } })).code, 400);
  assert.equal((await invoke(directmail, { method: 'POST', body: { properties: 'bad' } })).code, 400);
});
test('CSV cells neutralise formulas and retain normal text', async () => {
  const r = await invoke(directmail, { method: 'POST', body: { properties: [{ address: '=HYPERLINK("evil")', postcode: 'LS7 4EH', ownerName: 'Test' }] } });
  assert.equal(r.code, 200); assert.match(r.body.csv, /"'=HYPERLINK/); assert.equal(r.body.letters[0].address, '=HYPERLINK("evil")');
});
test('Land Registry validates input before interpolating SPARQL', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not fetch'); });
  for (const handler of [landregistry, comparables]) {
    for (const query of [{ postcode: 'LS7" } UNION {' }, { postcode: 'LS7 4EH', months: 'NaN' }, { postcode: 'LS7 4EH', months: '-2' }]) assert.equal((await invoke(handler, { query })).code, 400);
  }
  assert.equal(fetch.mock.callCount(), 0); assert.equal(postcodeValue('ls74eh'), 'LS7 4EH');
});
test('Land Registry district query has declared prefixes and correct type/median', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => json({ results: { bindings: [100, 200].map(amount => ({ amount: { value: String(amount) }, propertyType: { value: 'http://landregistry.data.gov.uk/def/ppi/semi-detached' }, postcode: { value: 'LS7 4EH' } })) } }));
  const r = await invoke(landregistry, { query: { postcode: 'LS7', type: 'residential' } });
  const query = new URL(fetch.mock.calls[0].arguments[0]).searchParams.get('query');
  assert.match(query, /PREFIX lrppi:/); assert.match(query, /STRSTARTS/); assert.equal(r.body.count, 2); assert.equal(r.body.data[0].propertyType, 'Semi-detached'); assert.equal(r.body.stats.medianPrice, '£150');
  assert.equal(median([40, 10, 30, 20]), 25); assert.equal(propertyType('http://example/SemiDetached'), 'Semi-detached');
});
test('crime provider failures never become zero-crime low-risk results', async t => {
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('postcodes.io') ? json({ result: { latitude: 53, longitude: -1 } }) : json({}, 503));
  const r = await invoke(crime, { query: { postcode: 'LS7 4EH' } });
  assert.equal(r.code, 502); assert.equal(r.body.overallRisk, 'unknown');
});
test('geocoding failure is handled as a provider error', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network failed'); });
  const r = await invoke(crime, { query: { postcode: 'LS7 4EH' } });
  assert.equal(r.code, 502); assert.equal(r.body.success, false);
});
test('school upstream failures are explicit', async t => {
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('postcodes.io') ? json({ result: { latitude: 53, longitude: -1 } }) : json({}, 503));
  const r = await invoke(schools, { query: { postcode: 'LS7 4EH' } }); assert.equal(r.code, 502); assert.equal(r.body.success, false);
});
test('flood warnings are not treated as flood zone evidence', async t => {
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('postcodes.io') ? json({ result: { latitude: 53, longitude: -1 } }) : json({ items: [] }));
  const r = await invoke(flood, { query: { postcode: 'LS7 4EH' } }); assert.equal(r.body.floodRisk.zone, null); assert.equal(r.body.floodRisk.colour, 'unknown');
});
test('licensing and ground risks remain unknown without address-level evidence', async () => {
  const h = await invoke(hmo, { query: { postcode: 'LS8 1AA' } }); assert.equal(h.body.selectiveLicensing, null); assert.equal(h.body.article4Direction, null);
  const s = await invoke(subsidence, { query: { postcode: 'LS8 1AA' } }); assert.equal(s.body.overallRisk, 'unknown'); assert.ok(s.body.checks.every(c => c.risk === 'unknown'));
});
test('EPC provider failure never becomes an all-clear', async t => {
  process.env.EPC_EMAIL = 'test@example.invalid'; process.env.EPC_API_KEY = 'test';
  t.mock.method(globalThis, 'fetch', async () => json({}, 401));
  const r = await invoke(epc, { query: { postcode: 'LS7' } }); assert.equal(r.code, 502); assert.equal(r.body.success, false);
});
test('AI receives due-diligence context and invalid output returns an error', async t => {
  process.env.API_ACCESS_TOKEN = 'test-secret'; process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.PROPERTYDATA_API_KEY;
  const fetch = t.mock.method(globalThis, 'fetch', async () => json({ content: [{ text: 'not json' }] }));
  const r = await invoke(analyse, { method: 'POST', headers: { authorization: 'Bearer test-secret' }, body: { address: 'Test', ddContext: 'Flood unknown' } });
  assert.equal(r.code, 502); assert.match(fetch.mock.calls[0].arguments[1].body, /Flood unknown/);
});
test('no fabricated sentiment score on missing evidence', async () => { const r = await invoke(sentiment); assert.equal(r.body.score, null); assert.equal(r.body.success, false); });
