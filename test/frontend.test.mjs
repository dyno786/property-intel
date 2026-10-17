import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';

const analysis={verdict:'HOLD',score:5,headline:'Verified fixture summary',marketContext:'No verified market data',pros:[],cons:[],risks:['Flood risk unknown'],opportunities:[],dueDiligence:['Check exact address'],actionPlan:[]};
const fixtures={
 '/api/sentiment':{success:false,score:null}, '/api/news':{success:true,news:[],construction:[]},
 '/api/epc':{success:true,total:1,data:[{address:'Test house',postcode:'LS7 4EH',currentRating:'F',type:'domestic',motivationScore:50,link:'https://example.com',opportunityFlag:{flag:'HIGH',reason:'Test'}}]},
 '/api/insolvency':{success:true,data:[],count:0}, '/api/pubs':{success:true,companies:[],disposalLinks:[]},
 '/api/analyse':{success:true,analysis,marketData:{}}, '/api/floodrisk':{success:false,error:'Provider failed'},
 '/api/hmo':{success:true,selectiveLicensing:null,article4Direction:null,licensingType:'Address check required'},
 '/api/crime':{success:false,overallRisk:'unknown'}, '/api/schools':{success:false,error:'Provider failed'},
 '/api/comparables':{success:true,sales:[]},'/api/auctions':{success:true,upcomingEvents:[]},
 '/api/mortgage':{success:true,rates:[],bestDeals:{},marketSummary:{},advice:[],disclaimer:'Historical examples'},
 '/api/regeneration':{success:true,schemes:[]},'/api/disposals':{success:true,councils:[],institutional:[]},
 '/api/alerts':{success:true,alerts:[]},'/api/bmv':{success:false,message:'No sold prices'},
};
class LocalResources extends ResourceLoader {
  fetch(url) { const path = new URL(url).pathname; if (['/ui.js', '/vendor/purify.min.js'].includes(path)) return Promise.resolve(fs.readFileSync('public'+path)); return null; }
}
async function load(file, search = '') {
  const errors = [];
  const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync('public/'+file, 'utf8'), {
    url: 'https://property.test/'+file+search, runScripts: 'dangerously', resources: new LocalResources(), virtualConsole: console,
    beforeParse(window) {
      window.fetch = async input => { const path = new URL(input, 'https://property.test').pathname; return new Response(JSON.stringify(fixtures[path] || {success:true,data:[],configured:true}), {headers:{'Content-Type':'application/json'}}); };
      window.open = () => null; window.alert = () => {}; window.prompt = () => ''; window.URL.createObjectURL = () => 'blob:test'; window.URL.revokeObjectURL = () => {};
    },
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve, {once:true}));
  await new Promise(resolve => setTimeout(resolve, 350));
  return { window: dom.window, document: dom.window.document, errors, close: () => dom.window.close() };
}

test('all 19 pages execute without uncaught DOM errors using API fixtures', async () => {
  let count = 0;
  for (const file of fs.readdirSync('public').filter(p=>p.endsWith('.html'))) {
    const page = await load(file);
    try { assert.deepEqual(page.errors, [], file); const visible = page.document.body.cloneNode(true); visible.querySelectorAll('script,style').forEach(el => el.remove()); assert.doesNotMatch(visible.textContent, /async function loadDashboard/); count++; } finally { page.close(); }
  }
  assert.equal(count, 19);
});
test('sourcing tabs and outreach form work after script repairs', async () => {
  const source = await load('sourcing.html');
  source.window.show('supermarkets', source.document.querySelectorAll('.tab')[1]); assert.ok(source.document.querySelector('#panel-supermarkets').classList.contains('active')); source.close();
  const page = await load('outreach.html', '?type=landlord&address=Test%20House&postcode=LS7');
  try { assert.equal(page.document.getElementById('propAddress').value, 'Test House'); page.window.generate(); assert.match(page.document.getElementById('letterPreview').textContent, /Test House/); assert.deepEqual(page.errors, []); } finally { page.close(); }
});
test('risk report renders structured AI summary and never paints missing data low risk', async () => {
  const page = await load('risk.html');
  try { page.document.querySelector('input').value = 'LS7 4EH'; await page.window.runCheck(); assert.match(page.document.getElementById('dd-body').textContent, /Verified fixture summary/); assert.equal(page.document.querySelectorAll('.rb-low').length, 0); assert.deepEqual(page.errors, []); } finally {page.close();}
});
test('pipeline add, edit and move work with sanitized markup', async () => {
  const page = await load('pipeline.html');
  try {
    page.document.querySelector('[data-add-stage]').click(); page.document.getElementById('f-addr').value = 'Test lead'; page.window.saveDeal();
    assert.equal(page.document.querySelectorAll('.deal-card').length, 1); page.document.querySelector('.deal-card').click(); assert.equal(page.document.getElementById('f-addr').value, 'Test lead');
    page.window.closeModal(); page.document.querySelector('[data-move-deal]').click(); assert.equal(page.document.querySelectorAll('.deal-card').length, 1); assert.deepEqual(page.errors, []);
  } finally {page.close();}
});
test('DOMPurify blocks event handlers, script tags and javascript links', async () => {
  const page = await load('index.html');
  try { const element = page.document.createElement('div'); page.document.body.append(element); page.window.setHTML(element, '<img src=x onerror="window.__xss=true"><script>window.__xss=true</script><a href="javascript:window.__xss=true">bad</a>'); assert.equal(element.querySelectorAll('[onerror], script, a[href]').length, 0); assert.equal(page.window.__xss, undefined); } finally {page.close();}
});
test('EPC sorting remains connected after sanitization', async () => {
  const page = await load('epc.html');
  try { assert.equal(page.document.querySelectorAll('.epc-card').length, 1); const select = page.document.querySelector('[data-epc-sort]'); select.value = 'address'; select.dispatchEvent(new page.window.Event('change', {bubbles:true})); assert.equal(page.document.querySelectorAll('.epc-card').length, 1); assert.deepEqual(page.errors, []); } finally {page.close();}
});

 test('refurb checkbox updates the estimate after sanitization', async () => {
  const page = await load('calculators.html');
  try { const item = page.document.querySelector('[data-refurb-item]'); assert.ok(item); item.checked = true; item.dispatchEvent(new page.window.Event('change', { bubbles: true })); assert.notEqual(page.document.getElementById('refurb-breakdown').textContent.trim(), ''); assert.deepEqual(page.errors, []); } finally { page.close(); }
});
