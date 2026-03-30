/**
 * ADMIN DASHBOARD JAVASCRIPT
 * Handles authentication, data fetching, and UI interactions
 */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:4000'
  : '';

const state = {
  token: localStorage.getItem('adminToken'),
  user: JSON.parse(localStorage.getItem('adminUser') || '{}'),
  currentPage: 'dashboard',
  units: [],
  bookings: [],
  pricingRules: [],
  blockedDates: [],
  waitlist: [],
};

// ─────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (state.token && state.user.username) {
    showAdminPage();
    loadUnits();
    loadDashboardData();
  } else {
    showLoginPage();
  }
});

// ─────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  const errorEl = document.getElementById('loginError');
  errorEl.classList.remove('show');

  if (!username || !password) {
    errorEl.textContent = 'Please enter username and password';
    errorEl.classList.add('show');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!data.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.classList.add('show');
      return;
    }

    // Store token and user
    state.token = data.token;
    state.user = data.user;

    localStorage.setItem('adminToken', data.token);
    localStorage.setItem('adminUser', JSON.stringify(data.user));

    showAdminPage();
    loadUnits();
    loadDashboardData();
  } catch (err) {
    console.error('Login error:', err);
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.add('show');
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  state.token = null;
  state.user = {};
  showLoginPage();
}

// ─────────────────────────────────────────────────────
// PAGE NAVIGATION
// ─────────────────────────────────────────────────────

function showLoginPage() {
  document.getElementById('loginPage').classList.add('active');
  document.getElementById('adminPage').classList.remove('active');
}

function showAdminPage() {
  document.getElementById('loginPage').classList.remove('active');
  document.getElementById('adminPage').classList.add('active');

  updateUserDisplay();
}

function showPage(page) {
  state.currentPage = page;

  // Hide all pages
  document.querySelectorAll('.page').forEach(el => {
    if (el.id !== 'loginPage' && el.id !== 'adminPage') {
      el.classList.remove('active');
    }
  });

  // Update title
  const titles = {
    'dashboard': 'Dashboard',
    'calendar-manager': 'Calendar Manager',
    'pricing-manager': 'Pricing Rules',
    'blocked-dates': 'Blocked Dates',
    'bookings': 'Bookings',
    'waitlist': 'Waitlist',
    'audit-log': 'Audit Log'
  };

  document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

  // Show current page
  const pageEl = document.getElementById(page + 'Page');
  if (pageEl) {
    pageEl.classList.add('active');

    // Load data
    if (page === 'bookings') loadBookings();
    if (page === 'pricing-manager') loadPricingRules();
    if (page === 'blocked-dates') loadBlockedDates();
    if (page === 'waitlist') loadWaitlist();
    if (page === 'audit-log') loadAuditLog();
    if (page === 'calendar-manager') loadCalendarData();
  }

  // Update nav
  document.querySelectorAll('.nav-link').forEach((link, i) => {
    link.classList.remove('active');
  });
  event.target.closest('.nav-link')?.classList.add('active');
}

function updateUserDisplay() {
  const user = state.user;
  document.getElementById('userName').textContent = user.name || 'Admin User';
  document.getElementById('userProperty').textContent = user.property 
    ? `${user.property.charAt(0).toUpperCase() + user.property.slice(1)} Property`
    : 'Full Access';
  document.getElementById('userBadge').textContent = (user.name || 'A').charAt(0).toUpperCase();
}

// ─────────────────────────────────────────────────────
// DATA FETCHING
// ─────────────────────────────────────────────────────

async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`
    }
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}/api/admin${endpoint}`, options);
  const data = await response.json();

  if (!data.ok && data.error === 'Invalid or expired token') {
    logout();
  }

  return data;
}

async function loadUnits() {
  try {
    const response = await fetch(`${API_BASE}/api/calendar/units`);
    const data = await response.json();

    if (data.ok && data.data) {
      state.units = data.data;
      populateUnitSelects();
    }
  } catch (err) {
    console.error('Load units error:', err);
  }
}

function populateUnitSelects() {
  const select = document.getElementById('unitSelectCal');
  if (!select) return;

  const html = '<option value="">All Units</option>' +
    state.units.map(u => `<option value="${u.unit_id}">${u.unit_name || u.unit_id}</option>`).join('');
  select.innerHTML = html;
}

async function loadDashboardData() {
  try {
    const bookingsData = await apiCall('/bookings?status=confirmed&limit=5');
    const waitlistData = await apiCall('/waitlist?limit=1');
    const pricingData = await apiCall('/pricing-rules');

    const bookings = bookingsData.data || [];
    const waitlist = waitlistData.data || [];
    const pricing = pricingData.data || [];

    // Update stats
    document.getElementById('statMonthlyBookings').textContent = bookings.length;
    document.getElementById('statRevenue').textContent = 
      bookings.reduce((sum, b) => sum + (b.total_kes || 0), 0).toLocaleString();
    document.getElementById('statWaitlist').textContent = waitlist.length;
    document.getElementById('statPricingRules').textContent = pricing.length;

    // Recent bookings
    const recentHtml = bookings.length > 0
      ? bookings.map(b => `
          <div style="padding: 12px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
            <div>
              <div style="font-weight: 500;">${b.guest_name || 'Guest'}</div>
              <div style="font-size: .8rem; color: var(--text-light);">${b.unit_id} • ${b.checkin_date}</div>
            </div>
            <div style="text-align: right; font-weight: 500;">Ksh ${(b.total_kes || 0).toLocaleString()}</div>
          </div>
        `).join('')
      : '<div style="color: var(--text-muted);">No recent bookings</div>';

    document.getElementById('recentBookingsContainer').innerHTML = recentHtml;

  } catch (err) {
    console.error('Load dashboard error:', err);
  }
}

async function loadBookings() {
  try {
    const status = document.getElementById('bookingStatusFilter')?.value || '';
    const endpoint = `/bookings${status ? `?status=${status}` : ''}`;
    const data = await apiCall(endpoint);

    const bookings = data.data || [];
    const html = bookings.length > 0
      ? bookings.map(b => `
          <tr>
            <td><strong>${b.booking_ref || b.id}</strong></td>
            <td>${b.guest_name}</td>
            <td>${b.unit_id}</td>
            <td>${b.checkin_date}</td>
            <td>${b.checkout_date}</td>
            <td><span class="badge badge-${b.status}">${b.status}</span></td>
            <td>Ksh ${(b.total_kes || 0).toLocaleString()}</td>
            <td><a href="#" onclick="viewBookingDetail('${b.id}'); return false;" style="color: var(--earth); text-decoration: none;">View</a></td>
          </tr>
        `).join('')
      : '<tr><td colspan="8" style="text-align: center; padding: 32px;">No bookings found</td></tr>';

    document.getElementById('bookingsTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load bookings error:', err);
    showToast('Failed to load bookings', '⚠️');
  }
}

async function loadPricingRules() {
  try {
    const data = await apiCall('/pricing-rules');
    const rules = data.data || [];

    const html = rules.length > 0
      ? rules.map(r => `
          <tr>
            <td>${r.unit_id}</td>
            <td>${r.start_date} to ${r.end_date}</td>
            <td><strong>Ksh ${r.price_per_night_kes.toLocaleString()}</strong></td>
            <td>${r.reason}</td>
            <td><span class="badge ${r.is_active ? 'badge-confirmed' : ''}" style="opacity: ${r.is_active ? 1 : 0.5}">${r.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>
              <a href="#" onclick="editPricingRule('${r.id}'); return false;" style="color: var(--earth); text-decoration: none; margin-right: 12px;">Edit</a>
              <a href="#" onclick="deletePricingRule('${r.id}'); return false;" style="color: var(--rust); text-decoration: none;">Delete</a>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" style="text-align: center; padding: 32px;">No pricing rules found</td></tr>';

    document.getElementById('pricingTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load pricing rules error:', err);
    showToast('Failed to load pricing rules', '⚠️');
  }
}

async function loadBlockedDates() {
  try {
    const data = await apiCall('/blocked-dates');
    const blocks = data.data || [];

    const html = blocks.length > 0
      ? blocks.map(b => `
          <tr>
            <td>${b.unit_id}</td>
            <td>${b.start_date}</td>
            <td>${b.end_date}</td>
            <td>${b.reason}</td>
            <td>${b.blocked_by || 'System'}</td>
            <td><a href="#" onclick="deleteBlockedDate('${b.id}'); return false;" style="color: var(--rust); text-decoration: none;">Delete</a></td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" style="text-align: center; padding: 32px;">No blocked dates</td></tr>';

    document.getElementById('blockedDatesTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load blocked dates error:', err);
    showToast('Failed to load blocked dates', '⚠️');
  }
}

async function loadWaitlist() {
  try {
    const data = await apiCall('/waitlist');
    const entries = data.data || [];

    const html = entries.length > 0
      ? entries.map(e => `
          <tr>
            <td>${e.guest_name}</td>
            <td>${e.guest_phone}</td>
            <td>${e.unit_id}</td>
            <td>${e.preferred_checkin} to ${e.preferred_checkout}</td>
            <td><span class="badge ${e.notified ? 'badge-confirmed' : 'badge-pending'}">${e.notified ? 'Notified' : 'Pending'}</span></td>
            <td>${new Date(e.created_at).toLocaleDateString()}</td>
            <td><a href="#" onclick="notifyWaitlistEntry('${e.id}'); return false;" style="color: var(--earth); text-decoration: none;">Send SMS</a></td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" style="text-align: center; padding: 32px;">No waitlist entries</td></tr>';

    document.getElementById('waitlistTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load waitlist error:', err);
    showToast('Failed to load waitlist', '⚠️');
  }
}

async function loadAuditLog() {
  try {
    const data = await apiCall('/audit-log?limit=50');
    const logs = data.data || [];

    const html = logs.length > 0
      ? logs.map(log => `
          <tr>
            <td>${new Date(log.created_at).toLocaleString()}</td>
            <td>${log.event_type}</td>
            <td>${log.booking_id || '—'}</td>
            <td style="font-size: .8rem; color: var(--text-muted);">${log.event_data ? log.event_data.substring(0, 50) + '...' : '—'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="text-align: center; padding: 32px;">No audit logs</td></tr>';

    document.getElementById('auditTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load audit log error:', err);
    showToast('Failed to load audit log', '⚠️');
  }
}

async function loadCalendarData() {
  try {
    const data = await apiCall('/blocked-dates');
    const blocks = data.data || [];

    const html = state.units.length > 0
      ? state.units.map(u => {
          const unitBlocks = blocks.filter(b => b.unit_id === u.unit_id).length;
          return `
            <tr>
              <td><strong>${u.unit_name || u.unit_id}</strong></td>
              <td>5 days</td>
              <td>${unitBlocks}</td>
              <td>12 days</td>
              <td style="color: var(--sage); font-weight: 500;">Available</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="5" style="text-align: center; padding: 32px;">Loading...</td></tr>';

    document.getElementById('calendarTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load calendar data error:', err);
  }
}

// ─────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────

function showAddPricingModal() {
  const startDate = prompt('Start date (YYYY-MM-DD):');
  if (!startDate) return;

  const endDate = prompt('End date (YYYY-MM-DD):');
  if (!endDate) return;

  const price = prompt('Price per night (KES):');
  if (!price) return;

  const unitId = prompt('Unit ID (or leave blank for all):');
  if (unitId === null) return;

  addPricingRule(unitId || state.units[0]?.unit_id, startDate, endDate, parseInt(price));
}

async function addPricingRule(unitId, startDate, endDate, price) {
  try {
    const data = await apiCall('/pricing-rules', 'POST', {
      unitId,
      startDate,
      endDate,
      pricePerNightKes: price
    });

    if (data.ok) {
      loadPricingRules();
      showToast('Pricing rule added successfully', '✓');
    } else {
      showToast(data.error || 'Failed to add pricing rule', '⚠️');
    }
  } catch (err) {
    console.error('Add pricing error:', err);
    showToast('Error adding pricing rule', '⚠️');
  }
}

async function deletePricingRule(id) {
  if (!confirm('Delete this pricing rule?')) return;

  try {
    const data = await apiCall(`/pricing-rules/${id}`, 'DELETE');
    if (data.ok) {
      loadPricingRules();
      showToast('Pricing rule deleted', '✓');
    } else {
      showToast(data.error || 'Failed to delete', '⚠️');
    }
  } catch (err) {
    showToast('Error deleting rule', '⚠️');
  }
}

function showAddBlockModal() {
  const startDate = prompt('Start date (YYYY-MM-DD):');
  if (!startDate) return;

  const endDate = prompt('End date (YYYY-MM-DD):');
  if (!endDate) return;

  const reason = prompt('Reason (e.g., Maintenance):');
  if (reason === null) return;

  const unitId = prompt('Unit ID:');
  if (!unitId) return;

  addBlockedDate(unitId, startDate, endDate, reason);
}

async function addBlockedDate(unitId, startDate, endDate, reason) {
  try {
    const data = await apiCall('/blocked-dates', 'POST', {
      unitId,
      startDate,
      endDate,
      reason
    });

    if (data.ok) {
      loadBlockedDates();
      showToast('Blocked date added', '✓');
    } else {
      showToast(data.error || 'Failed to add blocked date', '⚠️');
    }
  } catch (err) {
    showToast('Error adding blocked date', '⚠️');
  }
}

async function deleteBlockedDate(id) {
  if (!confirm('Remove this blocked date?')) return;

  try {
    const data = await apiCall(`/blocked-dates/${id}`, 'DELETE');
    if (data.ok) {
      loadBlockedDates();
      showToast('Blocked date removed', '✓');
    } else {
      showToast(data.error || 'Failed to remove', '⚠️');
    }
  } catch (err) {
    showToast('Error removing blocked date', '⚠️');
  }
}

async function notifyWaitlistEntry(id) {
  try {
    const data = await apiCall(`/waitlist/${id}/notify`, 'POST');
    if (data.ok) {
      loadWaitlist();
      showToast('Notification queued', '✓');
    } else {
      showToast(data.error || 'Failed to notify', '⚠️');
    }
  } catch (err) {
    showToast('Error notifying', '⚠️');
  }
}

function viewBookingDetail(id) {
  alert('Booking detail view coming soon. ID: ' + id);
}

function editPricingRule(id) {
  alert('Pricing rule edit coming soon. ID: ' + id);
}

function loadUnitCalendar() {
  loadCalendarData();
}

// ─────────────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────

function showToast(msg, icon) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastIcon').textContent = icon || '✓';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}
