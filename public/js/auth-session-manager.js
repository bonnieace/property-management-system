const AuthSessionManager = {
  async verifySession() {
    const response = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await response.json();
    if (response.status !== 401 && !response.ok) throw new Error('Session could not be checked');
    return data.ok ? { valid: true, user: data.user } : { valid: false };
  },
  async initSessionCheck() {
    document.getElementById('initialLoadingOverlay')?.classList.add('show');
    try {
      const result = await this.verifySession();
      return { authenticated: result.valid, token: result.valid ? 'cookie' : null, user: result.user };
    } catch {
      const error = document.getElementById('loginError');
      error.textContent = 'Could not check your session. Check your connection and reload.'; error.classList.add('show');
      return { authenticated: false };
    } finally { document.getElementById('initialLoadingOverlay')?.classList.remove('show'); }
  },
  resetSession() {}, getSessionStatus() { return { isChecked: true, isChecking: false }; }
};

function releaseAdminInteraction() {
  document.getElementById('initialLoadingOverlay')?.classList.remove('show');

  const drawer = document.getElementById('adminDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  if (!drawer?.classList.contains('open')) {
    drawerOverlay?.classList.remove('open');
    document.getElementById('hamburgerBtn')?.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function installAdminInteractionGuard() {
  const adminPage = document.getElementById('adminPage');
  if (!adminPage) return;

  const releaseWhenVisible = () => {
    if (adminPage.classList.contains('active')) queueMicrotask(releaseAdminInteraction);
  };

  const observer = new MutationObserver(releaseWhenVisible);
  observer.observe(adminPage, { attributes: true, attributeFilter: ['class'] });
  releaseWhenVisible();

  // Use one delegated navigation handler for desktop sidebar, drawer and bottom nav.
  // This avoids navigation depending solely on inline onclick handlers and ensures
  // a stale mobile drawer cannot leave an invisible layer blocking later clicks.
  adminPage.addEventListener('click', event => {
    const navItem = event.target.closest('.nav-link, .admin-nav-bottom-item');
    if (!navItem || !adminPage.contains(navItem)) return;

    const inlineAction = navItem.getAttribute('onclick') || '';
    const pageMatch = inlineAction.match(/showPage\('([^']+)'\)/);
    if (!pageMatch || typeof window.showPage !== 'function') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.showPage(pageMatch[1]);

    if (navItem.closest('#adminDrawer') && typeof window.closeDrawer === 'function') {
      window.closeDrawer();
    }
  }, true);
}

document.addEventListener('DOMContentLoaded', async () => {
  installAdminInteractionGuard();
  window.dispatchEvent(new CustomEvent('sessionCheckComplete', { detail: await AuthSessionManager.initSessionCheck() }));
});
window.addEventListener('sessionExpired', () => {
  if (typeof state !== 'undefined') { state.token = null; state.user = {}; }
  document.getElementById('adminPage')?.classList.remove('active');
  document.getElementById('loginPage')?.classList.add('active');
  const error = document.getElementById('loginError');
  error.textContent = 'Your session has expired. Sign in to continue.'; error.classList.add('show');
});
