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
document.addEventListener('DOMContentLoaded', async () => {
  window.dispatchEvent(new CustomEvent('sessionCheckComplete', { detail: await AuthSessionManager.initSessionCheck() }));
});
window.addEventListener('sessionExpired', () => {
  if (typeof state !== 'undefined') { state.token = null; state.user = {}; }
  document.getElementById('adminPage')?.classList.remove('active');
  document.getElementById('loginPage')?.classList.add('active');
  const error = document.getElementById('loginError');
  error.textContent = 'Your session has expired. Sign in to continue.'; error.classList.add('show');
});
