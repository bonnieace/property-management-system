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

const SIDEBAR_COLLAPSE_KEY = 'adminSidebarCollapsed';

function installDesktopSidebarCollapse() {
  const adminPage = document.getElementById('adminPage');
  const wrapper = adminPage?.querySelector('.admin-wrapper');
  const sidebar = adminPage?.querySelector('.admin-sidebar');
  if (!adminPage || !wrapper || !sidebar || document.getElementById('sidebarCollapseBtn')) return;

  const style = document.createElement('style');
  style.id = 'sidebarCollapseStyles';
  style.textContent = `
    @media (min-width: 1024px) {
      .admin-sidebar,
      .admin-main,
      .sidebar-collapse-btn {
        transition: width .25s ease, margin-left .25s ease, max-width .25s ease, left .25s ease;
      }

      .admin-sidebar {
        overflow-x: hidden;
      }

      .sidebar-collapse-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        top: 28px;
        left: 280px;
        transform: translateX(-50%);
        width: 32px;
        height: 32px;
        padding: 0;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 999px;
        background: var(--charcoal);
        color: rgba(255,255,255,.82);
        box-shadow: 0 4px 14px rgba(28,26,23,.2);
        cursor: pointer;
        z-index: 1960;
      }

      .sidebar-collapse-btn:hover,
      .sidebar-collapse-btn:focus-visible {
        color: #fff;
        background: var(--earth-dark);
        border-color: var(--earth-light);
      }

      .sidebar-collapse-btn svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        transition: transform .25s ease;
      }

      body.admin-sidebar-collapsed .admin-sidebar {
        width: 84px;
      }

      body.admin-sidebar-collapsed .admin-main {
        margin-left: 84px;
        max-width: calc(100vw - 84px);
      }

      body.admin-sidebar-collapsed .sidebar-collapse-btn {
        left: 84px;
      }

      body.admin-sidebar-collapsed .sidebar-collapse-btn svg {
        transform: rotate(180deg);
      }

      body.admin-sidebar-collapsed .admin-sidebar .logo {
        font-size: 0;
        padding: 0;
        text-align: center;
        margin-bottom: 32px;
      }

      body.admin-sidebar-collapsed .admin-sidebar .logo::after {
        content: 'NH';
        display: inline-block;
        font-family: var(--font-display);
        font-size: 1.2rem;
        color: #fff;
        letter-spacing: .04em;
      }

      body.admin-sidebar-collapsed .admin-sidebar .nav-section-title,
      body.admin-sidebar-collapsed .admin-sidebar .nav-link span {
        display: none;
      }

      body.admin-sidebar-collapsed .admin-sidebar .nav-section {
        margin-bottom: 18px;
      }

      body.admin-sidebar-collapsed .admin-sidebar .nav-link {
        justify-content: center;
        gap: 0;
        padding: 13px 0;
        border-left: 0;
        border-right: 3px solid transparent;
      }

      body.admin-sidebar-collapsed .admin-sidebar .nav-link:hover {
        transform: none;
        border-left-color: transparent;
        border-right-color: rgba(196,168,130,.55);
      }

      body.admin-sidebar-collapsed .admin-sidebar .nav-link.active {
        border-left-color: transparent;
        border-right-color: var(--earth-light);
      }

      body.admin-sidebar-collapsed .admin-sidebar .nav-icon {
        width: 22px;
        height: 22px;
      }
    }

    @media (max-width: 1023px) {
      .sidebar-collapse-btn { display: none !important; }
      body.admin-sidebar-collapsed .admin-sidebar { width: auto; }
      body.admin-sidebar-collapsed .admin-main { margin-left: 0; max-width: none; }
    }
  `;
  document.head.appendChild(style);

  sidebar.querySelectorAll('.nav-link').forEach(link => {
    const label = link.querySelector('span')?.textContent?.trim();
    if (label && !link.title) link.title = label;
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'sidebarCollapseBtn';
  button.className = 'sidebar-collapse-btn';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  wrapper.appendChild(button);

  const desktop = window.matchMedia('(min-width: 1024px)');

  const apply = (collapsed, persist = true) => {
    const active = desktop.matches && collapsed;
    document.body.classList.toggle('admin-sidebar-collapsed', active);
    button.setAttribute('aria-expanded', String(!active));
    button.setAttribute('aria-label', active ? 'Expand sidebar' : 'Collapse sidebar');
    button.title = active ? 'Expand sidebar' : 'Collapse sidebar';
    if (persist) localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
  };

  button.addEventListener('click', () => {
    apply(!document.body.classList.contains('admin-sidebar-collapsed'));
  });

  const restore = () => apply(localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1', false);
  if (typeof desktop.addEventListener === 'function') desktop.addEventListener('change', restore);
  else if (typeof desktop.addListener === 'function') desktop.addListener(restore);
  restore();
}

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
  installDesktopSidebarCollapse();
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