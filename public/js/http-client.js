/* Same-origin requests, bounded waits, and one property context per page lifetime. */
(() => {
  localStorage.removeItem('adminToken'); localStorage.removeItem('adminUser');
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
    if (url.origin !== location.origin) return nativeFetch(input, options);
    const headers = new Headers(options.headers || {});
    const isAdmin = url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/api/bookings');
    const property = sessionStorage.getItem('activeProperty');
    const globalPath = /^\/api\/admin\/(login|logout|verify|onboard|admins|invitations|account)(\/|$)/.test(url.pathname) || url.pathname === '/api/admin/properties';
    if (isAdmin && property && !globalPath) headers.set('X-Property-ID', property);
    headers.delete('Authorization');
    const response = await nativeFetch(input, { ...options, headers, credentials: 'same-origin', signal: options.signal || AbortSignal.timeout(25000) });
    if (response.status === 401 && isAdmin && !globalPath) window.dispatchEvent(new Event('sessionExpired'));
    return response;
  };
})();
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
