/**
 * AUTH SESSION MANAGER
 * Handles session validation, prevents auth flickering, and manages initial loading state
 */

const AuthSessionManager = (() => {
  let isSessionChecked = false;
  let sessionCheckInProgress = false;

  const loadingObserver = () => {
    return {
      show: () => document.getElementById('initialLoadingOverlay')?.classList.add('show'),
      hide: () => document.getElementById('initialLoadingOverlay')?.classList.remove('show'),
      isVisible: () => document.getElementById('initialLoadingOverlay')?.classList.contains('show')
    };
  };

  /**
   * Verify session token validity with backend
   * This prevents showing login page then immediately switching to dashboard
   */
  async function verifySession(token) {
    try {
      const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:4000'
        : '';

      const response = await fetch(`${API_BASE}/api/admin/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      return data.ok ? { valid: true, user: data.user || data.data } : { valid: false };
    } catch (err) {
      console.error('Session verification error:', err);
      return { valid: false };
    }
  }

  /**
   * Initialize session check on page load
   * Shows loading state while verifying, then displays appropriate page
   */
  async function initSessionCheck() {
    if (sessionCheckInProgress || isSessionChecked) return;
    sessionCheckInProgress = true;

    try {
      const loader = loadingObserver();
      loader.show();

      // Small artificial delay to ensure UI is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      const storedToken = localStorage.getItem('adminToken');
      const storedUser = localStorage.getItem('adminUser');

      // No token = go to login
      if (!storedToken) {
        isSessionChecked = true;
        sessionCheckInProgress = false;
        loader.hide();
        return { authenticated: false };
      }

      // Token exists = verify it's still valid
      const verification = await verifySession(storedToken);

      if (verification.valid) {
        // Token is valid, user is authenticated
        isSessionChecked = true;
        sessionCheckInProgress = false;
        loader.hide();
        return { 
          authenticated: true, 
          token: storedToken,
          user: verification.user || JSON.parse(storedUser || '{}')
        };
      } else {
        // Token exists but is invalid/expired, clear storage and show login
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        isSessionChecked = true;
        sessionCheckInProgress = false;
        loader.hide();
        return { authenticated: false };
      }
    } catch (err) {
      console.error('Session initialization error:', err);
      isSessionChecked = true;
      sessionCheckInProgress = false;
      loadingObserver().hide();
      return { authenticated: false };
    }
  }

  /**
   * Get current session status without re-checking
   */
  function getSessionStatus() {
    return {
      isChecked: isSessionChecked,
      isChecking: sessionCheckInProgress
    };
  }

  /**
   * Reset session (on logout)
   */
  function resetSession() {
    isSessionChecked = false;
    sessionCheckInProgress = false;
  }

  return {
    initSessionCheck,
    getSessionStatus,
    resetSession,
    verifySession
  };
})();

// Auto-initialize on DOMContentLoaded (will be called after this script loads)
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🔐 Starting auth session check...');
  const result = await AuthSessionManager.initSessionCheck();
  console.log('🔐 Session check complete:', result);

  // Dispatch event so admin.js can respond to auth status
  window.dispatchEvent(new CustomEvent('sessionCheckComplete', { detail: result }));
});
