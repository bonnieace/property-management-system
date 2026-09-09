/**
 * ADMIN DASHBOARD JAVASCRIPT
 * Handles authentication, data fetching, and UI interactions
 */

const API_BASE = '';

const state = {
  token: null,
  user: {},
  currentPage: 'dashboard',
  units: [],
  bookings: [],
  pricingRules: [],
  blockedDates: [],
  waitlist: [],
};

// ─────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return dateString;
  }
}

// ─────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────

/**
 * Handle session check complete event from AuthSessionManager
 * This prevents auth flickering and shows the correct page immediately
 */
window.addEventListener('sessionCheckComplete', async (event) => {

  const { authenticated, token, user } = event.detail;

  if (authenticated && token) {
    // Session is valid, restore state and show admin page
    state.token = token;
    state.user = user || {};

    showAdminPageSecurely();
  } else {
    // No valid session, show login page

    showLoginPage();
  }
});

/**
 * Safely show admin page with proper initialization
 */
async function showAdminPageSecurely() {



  try {
    await Workspace.init(state.user);
    showAdminPage();

  } catch(e) {
    showLoginPage(); const error=document.getElementById('loginError');error.textContent=e.message || 'Could not load your workspace';error.classList.add('show');return;
  }
  
  // Show skeletons while initial data loads

  SkeletonLoader.showDashboardSkeleton();
  
  try {
    // Restore the last viewed page or default to dashboard
    const lastPage = localStorage.getItem('adminLastPage') || 'dashboard';

    // Load initial data concurrently with timeout protection

    const unitsPromise = loadUnits().catch(err => {
      console.error('❌ [showAdminPageSecurely] Error loading units:', err);
      return null; // Don't fail entire flow for units
    });
    
    const dashboardPromise = lastPage === 'dashboard' 
      ? loadDashboardData().catch(err => {
          console.error('❌ [showAdminPageSecurely] Error loading dashboard:', err);
          return null; // Don't fail entire flow for dashboard
        })
      : Promise.resolve();
    
    await Promise.all([unitsPromise, dashboardPromise]);

    // Show the page after data is loaded

    showPage(lastPage);

  } catch (err) {
    console.error('❌ [showAdminPageSecurely] Error loading initial admin data:', err);
    showPage('dashboard');
  }
}

// REMOVED original DOMContentLoaded - now handled by session manager event

// ─────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

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
    state.token = 'cookie';
    state.user = data.user;

    document.getElementById('password').value = '';

    // Show loading overlay while transitioning
    const loader = document.getElementById('initialLoadingOverlay');
    if (loader) {
      loader.classList.add('show');

    }

    // Transition to admin page with proper initialization
    await showAdminPageSecurely();

    // Hide overlay after page is ready
    if (loader) {
      setTimeout(() => {
        loader.classList.remove('show');

      }, 500);
    }
  } catch (err) {
    console.error('❌ [handleLogin] Login error:', err);
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.add('show');
    
    // Hide overlay on error
    const loader = document.getElementById('initialLoadingOverlay');
    if (loader) {
      loader.classList.remove('show');
    }
  }
}

/**
 * Drawer Navigation Functions
 */
let touchStartX = 0;
let isDrawerTransitioning = false;

function toggleDrawer() {
  const drawer = document.getElementById('adminDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  
  if (drawer.classList.contains('open')) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

function openDrawer() {
  const drawer = document.getElementById('adminDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  
  drawer.classList.add('open');
  overlay.classList.add('open');
  hamburger.classList.add('active');
  
  // Prevent body scroll when drawer is open
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const drawer = document.getElementById('adminDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  hamburger.classList.remove('active');
  
  // Restore body scroll
  document.body.style.overflow = '';
}

/**
 * Initialize touch events for drawer swipe
 */
function initDrawerTouchListener() {
  const drawer = document.getElementById('adminDrawer');
  const main = document.querySelector('.admin-main');
  
  if (!drawer || !main) return;
  
  // Listen for touch events on main content to swipe open drawer
  main.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, false);
  
  main.addEventListener('touchmove', (e) => {
    if (isDrawerTransitioning) return;
    
    const touchX = e.touches[0].clientX;
    const diff = touchX - touchStartX;
    
    // Swipe right from left edge (0-50px) to open drawer
    if (touchStartX < 50 && diff > 50 && !drawer.classList.contains('open')) {
      e.preventDefault();
      openDrawer();
    }
  }, { passive: false });
  
  // Swipe left to close drawer
  let swipeStartX = 0;
  drawer.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
  }, false);
  
  drawer.addEventListener('touchmove', (e) => {
    if (isDrawerTransitioning) return;
    
    const touchX = e.touches[0].clientX;
    const diff = swipeStartX - touchX;
    
    // Swipe left from drawer content to close
    if (diff > 50 && drawer.classList.contains('open')) {
      e.preventDefault();
      closeDrawer();
    }
  }, { passive: false });
}

async function logout() {
  try { await fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); } catch { showToast('Could not sign out. Check your connection.'); return; }
  sessionStorage.removeItem('activeProperty');
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  state.token = null;
  state.user = {};
  
  // Reset auth session manager state
  if (typeof AuthSessionManager !== 'undefined') {
    AuthSessionManager.resetSession();
  }
  
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
  
  // Initialize drawer touch listeners for mobile/tablet
  setTimeout(() => {
    initDrawerTouchListener();
  }, 100);
}

function showPage(page) {

  if (['tank-manager', 'dvr-manager', 'access-control'].includes(page)) { showToast('Device integrations are not configured for this property.'); return; }
  if (page === 'admin-users' && state.user.role !== 'full_admin') page = 'dashboard';
  if (Workspace.dirty && state.currentPage === 'workspace' && page !== 'workspace') { if (!confirm('Discard unsaved website changes?')) return; Workspace.dirty = false; }
  state.currentPage = page;
  
  // Save current page to localStorage for persistence
  localStorage.setItem('adminLastPage', page);

  // Map page names to actual element IDs
  const pageMap = {
    'dashboard': 'dashboardPage',
    'workspace': 'workspacePage',
    'properties': 'propertiesPage',
    'units': 'unitsPage',
    'calendar-manager': 'calendarManagerPage',
    'pricing-manager': 'pricingManagerPage',
    'blocked-dates': 'blockedDatesPage',
    'tank-manager': 'tankManagerPage',
    'dvr-manager': 'dvrManagerPage',
    'access-control': 'accessControlPage',
    'admin-users': 'adminUsersPage',
    'bookings': 'bookingsPage',
    'tenants': 'tenantsPage',
    'waitlist': 'waitlistPage',
    'audit-log': 'auditLogPage',
    'rentalTenants': 'rentalTenantsPage',
    'rentalContracts': 'rentalContractsPage',
    'rentalPayments': 'rentalPaymentsPage',
    'rentalArrears': 'rentalArrearsPage'
  };

  const pageId = pageMap[page];
  if (!pageId) {
    console.error('❌ Unknown page:', page);
    return;
  }

  // Hide all pages
  document.querySelectorAll('.page').forEach(el => {
    if (el.id !== 'loginPage' && el.id !== 'adminPage') {
      el.classList.remove('active');
    }
  });

  // Update title
  const titles = {
    'dashboard': 'Dashboard',
    'workspace': 'Property workspace',
    'properties': 'Properties & Buildings',
    'units': 'Units & Rooms',
    'calendar-manager': 'Calendar Manager',
    'pricing-manager': 'Pricing Rules',
    'blocked-dates': 'Blocked Dates',
    'tank-manager': 'Tank Management',
    'dvr-manager': 'DVR Surveillance',
    'access-control': 'Access Control',
    'admin-users': 'Admin Users',
    'bookings': 'Bookings',
    'tenants': 'Tenants',
    'waitlist': 'Waitlist',
    'audit-log': 'Audit Log',
    'rentalTenants': 'Rental Tenants',
    'rentalContracts': 'Rental Contracts',
    'rentalPayments': 'Rental Payments',
    'rentalArrears': 'Payment Arrears'
  };

  document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

  // Update navigation active states (sidebar, drawer, and bottom nav)
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  document.querySelectorAll('.admin-nav-bottom-item').forEach(item => item.classList.remove('active'));
  
  // Find and activate the matching nav links
  const navLinks = Array.from(document.querySelectorAll('.nav-link, .admin-nav-bottom-item'));
  const matchingLink = navLinks.find(link => {
    const onclick = link.getAttribute('onclick');
    return onclick && onclick.includes(`showPage('${page}')`);
  });
  if (matchingLink) {
    matchingLink.classList.add('active');
  }

  // Show current page
  const pageEl = document.getElementById(pageId);
  if (pageEl) {

    pageEl.classList.add('active');

    // Show skeleton loaders while loading data
    showSkeletonForPage(page);

    // Load data
    if (page === 'workspace') Workspace.open();
    if (page === 'dashboard') loadDashboardData();
    if (page === 'properties') initPropertiesManager();
    if (page === 'units') initUnitsManager();
    if (page === 'bookings') loadBookings();
    if (page === 'tenants') loadTenants();
    if (page === 'pricing-manager') loadPricingRules();
    if (page === 'blocked-dates') loadBlockedDates();
    if (page === 'tank-manager') initializeTankManager();
    if (page === 'dvr-manager') initializeDVRManager();
    if (page === 'access-control') accessManager.init();
    if (page === 'waitlist') loadWaitlist();
    if (page === 'audit-log') loadAuditLog();
    if (page === 'admin-users') adminUsersManager.init();
    if (page === 'rentalTenants') tenantsManager.init();
    if (page === 'rentalContracts') contractsManager.init();
    if (page === 'rentalPayments') paymentsManager.init();
    if (page === 'rentalArrears') arrearsDashboard.init();
    if (page === 'calendar-manager') {

      loadCalendarData();
    }
  } else {
    console.error('❌ Page element not found:', pageId);
  }
}

/**
 * Show skeleton loading UI for the given page
 */
function showSkeletonForPage(page) {
  if (typeof SkeletonLoader === 'undefined') return;

  switch (page) {
    case 'dashboard':
      SkeletonLoader.showDashboardSkeleton();
      break;
    case 'bookings':
    case 'tenants':
      SkeletonLoader.showTableSkeleton(page === 'bookings' ? 'bookingsTableBody' : 'tenantsTableBody', 8, 8);
      break;
    case 'units':
      SkeletonLoader.showTableSkeleton('unitsTableBody', 8, 8);
      break;
    case 'properties':
      SkeletonLoader.showTableSkeleton('propertiesTableBody', 8, 6);
      break;
    case 'pricing-manager':
      SkeletonLoader.showTableSkeleton('pricingTableBody', 8, 6);
      break;
    case 'tank-manager':
      SkeletonLoader.showGridSkeleton('tanksContainer', 4);
      break;
    case 'dvr-manager':
      SkeletonLoader.showGridSkeleton('dvrCamerasContainer', 4);
      break;
    case 'rentalTenants':
      SkeletonLoader.showTableSkeleton('rentalTenantsTableBody', 8, 6);
      break;
    case 'rentalContracts':
      SkeletonLoader.showTableSkeleton('contractsTableBody', 8, 8);
      break;
    case 'rentalPayments':
      SkeletonLoader.showTableSkeleton('paymentsTableBody', 8, 8);
      break;
    case 'rentalArrears':
      // Dashboard shows loading text
      break;
  }
}

function updateUserDisplay() {
  const user = state.user;


  document.getElementById('userName').textContent = user.name || 'Admin User';

  // Show role and properties in user display
  let userPropertyText = 'Full Access';
  if (user.role === 'property_admin' && user.properties && user.properties.length > 0) {
    const propNames = user.properties.map(p => p.name).join(', ');
    userPropertyText = propNames || 'Property Admin';
  } else if (user.role === 'property_admin') {
    userPropertyText = 'Property Admin (no properties assigned)';
  }

  document.getElementById('userProperty').textContent = userPropertyText;
  document.getElementById('userBadge').textContent = (user.name || 'A').charAt(0).toUpperCase();

  // Show admin users section only for full_admin role
  const shouldShowAdmin = user.role === 'full_admin';
  
  // Desktop: Show/hide Administration section in sidebar
  const adminSidebarSection = document.getElementById('adminSidebarSection');

  if (adminSidebarSection) {

    adminSidebarSection.style.display = shouldShowAdmin ? 'block' : 'none';

  } else {

  }

  // Mobile/Tablet: Show/hide Administration section in drawer
  const adminUsersDrawerSection = document.getElementById('adminUsersDrawerSection');

  if (adminUsersDrawerSection) {

    adminUsersDrawerSection.style.display = shouldShowAdmin ? 'block' : 'none';

  } else {

  }
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

  if (response.status === 401) {
    logout();
  }

  return data;
}

async function loadUnits() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/units`);
    const data = await response.json();


    if (data.ok && data.data) {
      state.units = data.data;

    } else {

    }
  } catch (err) {
    console.error('Load units error:', err);
  }
}

async function loadDashboardData() {
  try {
    const response = await apiCall('/dashboard');
    if (!response.ok) throw new Error(response.error || 'Dashboard could not be loaded');
    const d = response.data;
    for (const [id, value] of Object.entries({statBnbBookings:d.bookings,statBnbRevenue:d.bookingValue,statRentalBookings:d.activeLeases,statRentalRevenue:d.rentReceived})) {
      const el=document.getElementById(id);el.classList.remove('skeleton-loading');el.removeAttribute('style');el.textContent=Number(value).toLocaleString();
    }
    updateRevenueChartData(d.chart, 'week');
    const bookingRows = rows => rows.map(b=>`<div class="list-item"><div class="list-item-content"><div class="list-item-title">${escapeHtml(b.guest_name)}</div><div class="list-item-subtitle">${escapeHtml(b.checkin_date)} · ${escapeHtml(b.checkout_date)}</div></div><div class="list-item-value">KES ${Number(b.total_amount_kes).toLocaleString()}</div></div>`).join('');
    const recent=document.getElementById('recentBookingsContainer');recent.innerHTML=bookingRows(d.recent)||'<p class="field-hint">No confirmed bookings yet.</p>';recent.style.opacity='1';
    const upcoming=document.getElementById('upcomingEventsContainer');upcoming.innerHTML=bookingRows(d.upcoming)||'<p class="field-hint">No upcoming check-ins.</p>';upcoming.style.opacity='1';
    document.getElementById('occupancyContainer').innerHTML=d.occupancy.map(u=>`<div class="list-item"><div class="list-item-content"><div class="list-item-title">${escapeHtml(u.name)}</div><div class="progress-bar-container"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:${u.percentage}%"></div></div><div class="progress-bar-value">${u.percentage}%</div></div></div></div>`).join('')||'<p class="field-hint">Add your first unit to track occupancy.</p>';
  } catch (err) {
    document.querySelectorAll('#dashboardPage .stat-value').forEach(el=>{el.classList.remove('skeleton-loading');el.textContent='—';});
    showToast(err.message || 'Dashboard could not be loaded', '!');
  }
}

async function loadBookings() {
  try {
    const status = document.getElementById('bookingStatusFilter')?.value || '';
    const endpoint = `/api/bookings?bookingType=bnb${status ? `&status=${status}` : ''}`;
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    const data = await response.json();

    const bookings = data.data || [];
    const html = bookings.length > 0
      ? bookings.map(b => `
          <tr>
            <td><strong>${b.reference || b.id}</strong></td>
            <td>${escapeHtml(b.guest_name)}</td>
            <td>${b.unit_id}</td>
            <td>${formatDate(b.checkin_date)}</td>
            <td>${formatDate(b.checkout_date)}</td>
            <td><span class="badge badge-${b.status}">${b.status}</span></td>
            <td>Ksh ${(b.total_amount_kes || 0).toLocaleString()}</td>
            <td>
              <a href="#" onclick="openEditBookingModal('${b.id}'); return false;" style="color: var(--earth); text-decoration: none; margin-right: 8px;">Edit</a>
              <a href="#" onclick="deleteBooking('${b.id}'); return false;" style="color: var(--rust); text-decoration: none;">Delete</a>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="8" style="text-align: center; padding: 32px;">No bookings found</td></tr>';

    document.getElementById('bookingsTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load bookings error:', err);
    showToast('Failed to load bookings', '⚠️');
  }
}

async function loadTenants() {
  try {
    const status = document.getElementById('tenantStatusFilter')?.value || '';
    const endpoint = `/api/bookings?bookingType=rental${status ? `&status=${status}` : ''}`;
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    const data = await response.json();

    const tenants = data.data || [];
    const html = tenants.length > 0
      ? tenants.map(r => `
          <tr>
            <td><strong>${r.reference || r.id}</strong></td>
            <td>${escapeHtml(r.guest_name)}</td>
            <td>${r.unit_id}</td>
            <td>${formatDate(r.checkin_date)}</td>
            <td>${formatDate(r.checkout_date)}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td>Ksh ${(r.total_amount_kes || 0).toLocaleString()}</td>
            <td>
              <a href="#" onclick="openEditBookingModal('${r.id}'); return false;" style="color: var(--earth); text-decoration: none; margin-right: 8px;">Edit</a>
              <a href="#" onclick="deleteBooking('${r.id}'); return false;" style="color: var(--rust); text-decoration: none;">Delete</a>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="8" style="text-align: center; padding: 32px;">No tenants found</td></tr>';

    document.getElementById('tenantsTableBody').innerHTML = html;
  } catch (err) {
    console.error('Load tenants error:', err);
    showToast('Failed to load tenants', '⚠️');
  }
}

async function openCreateBookingModal(bookingType) {

  // Reset form
  document.getElementById('bookingForm').reset();
  document.getElementById('bookingId').value = '';
  document.getElementById('bookingType').value = bookingType;
  document.getElementById('bookingFormError').classList.remove('show');
  
  // Show/hide payment mode section
  document.getElementById('paymentModeSection').style.display = 'block';
  document.getElementById('statusSection').style.display = 'none';
  
  // Update title
  const title = bookingType === 'bnb' ? 'Create B&B Booking' : 'Create Rental';
  document.getElementById('bookingFormTitle').textContent = title;
  
  // Populate units dropdown (filter by booking type - this is frontend logic)

  await populateUnitsDropdown(bookingType);
  
  // Open modal

  document.getElementById('bookingFormModalOverlay').classList.add('open');

}

async function openEditBookingModal(bookingId) {
  try {
    // Fetch booking details
    const response = await fetch(`${API_BASE}/api/bookings/${bookingId}`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    const bookingdata = await response.json();
    const booking = bookingdata.data;
    
    if (!booking) {
      showToast('Booking not found', '❌');
      return;
    }

    // Populate form
    document.getElementById('bookingId').value = booking.id;
    document.getElementById('bookingType').value = booking.booking_type;
    document.getElementById('bookingUnitId').value = booking.unit_id;
    document.getElementById('bookingCheckinDate').value = booking.checkin_date;
    document.getElementById('bookingCheckoutDate').value = booking.checkout_date;
    document.getElementById('bookingGuestName').value = booking.guest_name;
    document.getElementById('bookingGuestPhone').value = booking.guest_phone;
    document.getElementById('bookingGuestEmail').value = booking.guest_email || '';
    document.getElementById('bookingTotalAmount').value = booking.total_amount_kes;
    document.getElementById('bookingNotes').value = booking.notes || '';
    document.getElementById('bookingStatus').value = booking.status;
    
    // Hide payment mode, show status
    document.getElementById('paymentModeSection').style.display = 'none';
    document.getElementById('statusSection').style.display = 'block';
    
    // Update title
    const title = booking.booking_type === 'bnb' ? 'Edit B&B Booking' : 'Edit Rental';
    document.getElementById('bookingFormTitle').textContent = title;
    document.getElementById('bookingFormError').classList.remove('show');
    
    // Populate units dropdown
    await populateUnitsDropdown(booking.booking_type);
    
    // Open modal
    document.getElementById('bookingFormModalOverlay').classList.add('open');
  } catch (err) {
    console.error('Load booking error:', err);
    showToast('Failed to load booking', '❌');
  }
}

async function populateUnitsDropdown(bookingType) {
  try {

    const response = await fetch(`${API_BASE}/api/admin/units`);

    const data = await response.json();

    const units = data.data || [];
    
    // Keep state.units in sync with fresh data
    state.units = units;
    
    // Filter units by property access & booking type
    const filteredUnits = units.filter(u => {
      // Check property access: if admin has specific property, only show that property's units
      if (state.user.property && u.property_id !== state.user.property) {
        return false; // Admin not allowed to book for this property
      }
      
      // Filter by booking type
      if (bookingType === 'bnb') {
        // B&B: only bnb type units
        return u.type === 'bnb';
      } else {
        // Rental: only apartments
        return ['bedsit', '1bed', '2bed'].includes(u.type);
      }
    });


    const select = document.getElementById('bookingUnitId');

    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Select a unit...</option>' +
      filteredUnits.map(u => `<option value="${u.id}">${u.property_id} - ${escapeHtml(u.name || u.unit_id)}</option>`).join('');

    if (currentValue) {
      select.value = currentValue;
    }
  } catch (err) {
    console.error('🔴 Load units error:', err);
  }
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  
  const bookingId = document.getElementById('bookingId').value;
  const bookingType = document.getElementById('bookingType').value;
  const isEdit = !!bookingId;
  
  try {
    const formData = {
      checkin_date: document.getElementById('bookingCheckinDate').value,
      checkout_date: document.getElementById('bookingCheckoutDate').value,
      guest_name: document.getElementById('bookingGuestName').value,
      guest_phone: document.getElementById('bookingGuestPhone').value,
      guest_email: document.getElementById('bookingGuestEmail').value,
      total_guests: parseInt(document.getElementById('bookingTotalGuests').value),
      total_amount_kes: parseInt(document.getElementById('bookingTotalAmount').value),
      notes: document.getElementById('bookingNotes').value,
    };
    
    if (isEdit) {
      // Edit mode
      if (document.getElementById('statusSection').style.display !== 'none') {
        formData.status = document.getElementById('bookingStatus').value;
      }
      
      const response = await fetch(`${API_BASE}/api/bookings/${bookingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(formData)
      });
      const result = await response.json();
      
      if (result.ok) {
        showToast('Booking updated successfully', '✓');
        closeBookingFormModal();
        bookingType === 'bnb' ? loadBookings() : loadTenants();
      } else {
        throw new Error(result.error || 'Failed to update booking');
      }
    } else {
      // Create mode
      const paymentMode = document.getElementById('bookingPaymentMode').value;
      const selectedUnitId = document.getElementById('bookingUnitId').value;
      
      // Find the selected unit to get property_id
      const selectedUnit = state.units.find(u => u.id == selectedUnitId);
      if (!selectedUnit) {
        throw new Error('Selected unit not found');
      }
      
      formData.unit_id = selectedUnitId;
      formData.property_id = selectedUnit.property_id;
      formData.booking_type = bookingType;
      formData.reference = `NYH-${Date.now()}`;
      
      if (paymentMode === 'stk') {
        // Initiate M-Pesa STK Push (if implemented)
        formData.status = 'pending';
        showToast('M-Pesa STK feature coming soon', 'ℹ️');
      } else if (paymentMode === 'confirmed') {
        formData.status = 'confirmed';
      } else {
        formData.status = 'pending';
      }
      
      // Create booking via POST
      const response = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(formData)
      });
      const result = await response.json();
      
      if (result.ok) {
        showToast(`Booking created: ${result.data.reference}`, '✓');
        closeBookingFormModal();
        bookingType === 'bnb' ? loadBookings() : loadTenants();
      } else {
        throw new Error(result.error || 'Failed to create booking');
      }
    }
  } catch (err) {
    console.error('Booking submit error:', err);
    const errorEl = document.getElementById('bookingFormError');
    errorEl.textContent = err.message || 'Failed to save booking';
    errorEl.classList.add('show');
  }
}

async function deleteBooking(bookingId) {
  if (!confirm('Are you sure you want to delete this booking?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/bookings/${bookingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    const result = await response.json();
    
    if (result.ok) {
      showToast('Booking deleted', '✓');
      // Reload current page
      if (state.currentPage === 'bookings') {
        loadBookings();
      } else if (state.currentPage === 'tenants') {
        loadTenants();
      }
    } else {
      throw new Error(result.error || 'Failed to delete booking');
    }
  } catch (err) {
    console.error('Delete booking error:', err);
    showToast('Failed to delete booking', '❌');
  }
}

function closeBookingFormModal() {

  document.getElementById('bookingFormModalOverlay').classList.remove('open');
  document.getElementById('bookingForm').reset();

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
            <td>${escapeHtml(r.reason)}</td>
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
            <td>${escapeHtml(b.reason)}</td>
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
            <td>${escapeHtml(e.guest_name)}</td>
            <td>${escapeHtml(e.guest_phone)}</td>
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
            <td>${escapeHtml(log.event_type)}</td>
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

/**
 * Load calendar data - delegates to calendarManager
 * This is the entry point when user navigates to Calendar page
 */
async function loadCalendarData() {
  try {

    await calendarManager.init();
  } catch (err) {
    console.error('[Calendar] Error in loadCalendarData:', err);
    showToast('Failed to load calendar', '⚠️');
  }
}



async function handleUnitFilterChange() {

  await calendarManager.refreshCalendar();
}

function switchCalendarView(viewType) {

  if (calendarManager?.calendar) {
    calendarManager.calendar.changeView(viewType);
    
    // Update active button
    document.querySelectorAll('.view-buttons button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`.view-buttons button[data-view="${viewType}"]`)?.classList.add('active');
  } else {
    console.error('[Calendar View] calendarManager.calendar is not initialized');
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

async function viewBookingDetail(bookingId) {
  try {
    // Fetch booking details
    const bookingData = await apiCall(`/bookings/${bookingId}`);
    if (!bookingData.ok) {
      showToast('Failed to load booking details', '⚠️');
      return;
    }

    const booking = bookingData.data;
    state.currentBookingId = bookingId;

    // Populate booking detail modal
    document.getElementById('detailReference').textContent = booking.reference || booking.id;
    document.getElementById('detailStatus').innerHTML = `<span class="badge badge-${booking.status}">${booking.status}</span>`;
    document.getElementById('detailBookingType').textContent = (booking.booking_type || 'bnb').toUpperCase();

    // Guest info
    document.getElementById('detailGuestName').textContent = booking.guest_name || '—';
    document.getElementById('detailGuestEmail').textContent = booking.guest_email || '—';
    document.getElementById('detailGuestPhone').textContent = booking.guest_phone || '—';

    // Stay details
    document.getElementById('detailUnit').textContent = booking.unit_id || '—';
    document.getElementById('detailCheckin').textContent = formatDate(booking.checkin_date);
    document.getElementById('detailCheckout').textContent = formatDate(booking.checkout_date);
    document.getElementById('detailGuests').textContent = booking.total_guests || '—';

    // Payment info
    formatPricingBreakdown(booking);
    document.getElementById('detailMpesaReceipt').textContent = booking.mpesa_receipt_number || 'Not yet received';
    document.getElementById('detailPaymentStatus').textContent = booking.status || '—';

    // Show/hide notes
    if (booking.notes) {
      document.getElementById('notesSection').style.display = 'block';
      document.getElementById('detailNotes').textContent = booking.notes;
    } else {
      document.getElementById('notesSection').style.display = 'none';
    }

    // Show cancel button only for confirmed bookings
    const cancelBtn = document.getElementById('cancelBookingBtn');
    if (booking.status === 'confirmed') {
      cancelBtn.style.display = 'inline-flex';
    } else {
      cancelBtn.style.display = 'none';
    }

    // Load audit trail
    loadBookingAuditTrail(bookingId);

    // Show modal
    document.getElementById('bookingDetailModalOverlay').classList.add('open');
  } catch (err) {
    console.error('Error viewing booking detail:', err);
    showToast('Error loading booking details', '⚠️');
  }
}

function formatPricingBreakdown(booking) {
  const container = document.getElementById('pricingBreakdown');
  let html = '';

  if (booking.pricing_breakdown) {
    try {
      const breakdown = typeof booking.pricing_breakdown === 'string' 
        ? JSON.parse(booking.pricing_breakdown) 
        : booking.pricing_breakdown;

      if (breakdown.base_price) {
        html += `<div class="pricing-row">
          <span>Base Price (${breakdown.nights || '?'} nights)</span>
          <span>Ksh ${(breakdown.base_price).toLocaleString()}</span>
        </div>`;
      }
      if (breakdown.taxes && breakdown.taxes > 0) {
        html += `<div class="pricing-row">
          <span>Taxes & Fees</span>
          <span>Ksh ${(breakdown.taxes).toLocaleString()}</span>
        </div>`;
      }
      if (breakdown.discount && breakdown.discount > 0) {
        html += `<div class="pricing-row" style="color: var(--sage);">
          <span>Discount</span>
          <span>-Ksh ${(breakdown.discount).toLocaleString()}</span>
        </div>`;
      }
    } catch (e) {

    }
  }

  html += `<div class="pricing-row total">
    <span>Total</span>
    <span>Ksh ${(booking.total_amount_kes || 0).toLocaleString()}</span>
  </div>`;

  container.innerHTML = html;
}

async function loadBookingAuditTrail(bookingId) {
  try {
    const auditData = await apiCall(`/bookings/${bookingId}/audit`);
    const audits = auditData.data || [];
    const container = document.getElementById('auditTrail');

    if (audits.length === 0) {
      container.innerHTML = '<div class="audit-item" style="justify-content: center; color: var(--text-muted);">No audit entries found</div>';
      return;
    }

    let html = '';
    audits.forEach(audit => {
      const timestamp = new Date(audit.created_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const event = audit.event_type || audit.event || 'Unknown event';
      html += `<div class="audit-item">
        <span class="audit-event">${event}</span>
        <span class="audit-timestamp">${timestamp}</span>
      </div>`;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading audit trail:', err);
    document.getElementById('auditTrail').innerHTML = '<div class="audit-item" style="justify-content: center; color: var(--text-muted);">Failed to load audit trail</div>';
  }
}

function closeBookingDetailModal() {
  document.getElementById('bookingDetailModalOverlay').classList.remove('show');
  state.currentBookingId = null;
}

function showCancelBookingModal() {
  if (!state.currentBookingId) return;
  
  const ref = document.getElementById('detailReference').textContent;
  document.getElementById('cancelRefDisplay').textContent = ref;
  document.getElementById('cancellationReason').value = '';
  
  // Hide detail modal, show cancel modal
  document.getElementById('bookingDetailModalOverlay').classList.remove('open');
  document.getElementById('cancelBookingModalOverlay').classList.add('open');
}

function closeCancelBookingModal() {
  document.getElementById('cancelBookingModalOverlay').classList.remove('open');
  // Reopen detail modal
  if (state.currentBookingId) {
    document.getElementById('bookingDetailModalOverlay').classList.add('open');
  }
}

async function confirmCancelBooking() {
  const reason = document.getElementById('cancellationReason').value.trim();
  
  if (!reason) {
    showToast('Please provide a cancellation reason', '⚠️');
    return;
  }

  const confirmBtn = document.getElementById('confirmCancelBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Processing...';

  try {
    const response = await apiCall(`/bookings/${state.currentBookingId}`, 'DELETE', { reason: reason });
    
    if (response.ok) {
      showToast('Booking cancelled successfully', '✓');
      closeCancelBookingModal();
      closeBookingDetailModal();
      // Refresh bookings table
      loadBookings();
    } else {
      const errorMsg = response.error || 'Failed to cancel booking';
      showToast(errorMsg, '⚠️');
    }
  } catch (err) {
    console.error('Error cancelling booking:', err);
    showToast('Error cancelling booking', '⚠️');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Cancellation';
  }
}

// Close modals when clicking outside (on overlay)
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('bookingDetailModalOverlay')?.addEventListener('click', function(e) {
    if (e.target === this) {
      closeBookingDetailModal();
    }
  });

  document.getElementById('cancelBookingModalOverlay')?.addEventListener('click', function(e) {
    if (e.target === this) {
      closeCancelBookingModal();
    }
  });

  // Close modals with ESC key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeBookingDetailModal();
      closeCancelBookingModal();
    }
  });
});

function editPricingRule(id) {
  alert('Pricing rule edit coming soon. ID: ' + id);
}

function loadUnitCalendar() {
  loadCalendarData();
}

// ─────────────────────────────────────────────────────
// CONTRACT PAYMENTS MODAL
// ─────────────────────────────────────────────────────

function closeContractPaymentsModal() {
  document.getElementById('contractPaymentsModalOverlay').classList.remove('open');
}

function goToAllPayments() {
  // Close modal and navigate to full payments view
  closeContractPaymentsModal();
  
  // Reset filter and show all payments
  if (paymentsManager) {
    paymentsManager.filterContractId = null;
    paymentsManager.loadPayments();
  }
  
  showPage('rentalPayments');
  localStorage.setItem('adminLastPage', 'rentalPayments');
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
