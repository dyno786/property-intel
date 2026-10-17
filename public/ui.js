/* All dynamically rendered markup passes through DOMPurify. */
function setHTML(element, markup) {
  if (!element) return;
  element.innerHTML = DOMPurify.sanitize(String(markup ?? ''), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
  });
  element.querySelectorAll('a[target="_blank"]').forEach(link => { link.rel = 'noopener noreferrer'; });
}
function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function loadSavedList(key) {
  try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
document.addEventListener('click', event => {
  const link = event.target.closest('[data-open-url]');
  if (link && !event.target.closest('a,button')) {
    try { const url = new URL(link.dataset.openUrl, location.origin); if (['https:', 'http:'].includes(url.protocol)) window.open(url.href, '_blank', 'noopener,noreferrer'); } catch {}
  }
});
// Credentials stay in memory for this page; they are never put in a URL or saved to storage.
const nativeFetch = window.fetch.bind(window);
let accessToken = '';
window.fetch = async function(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.origin !== location.origin || !['/api/analyse', '/api/listings'].includes(url.pathname) || url.searchParams.get('check') === '1') return nativeFetch(input, init);
  const send = () => nativeFetch(input, { ...init, headers: { ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
  let response = await send();
  if (response.status === 401) {
    accessToken = window.prompt('Enter your Property Intel access token to use private analysis:') || '';
    if (accessToken) response = await send();
  }
  return response;
};

function exportSavedData(key) {
  const blob = new Blob([JSON.stringify(loadSavedList(key), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = key + '.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
