/**
 * CALENDAR MANAGER - FullCalendar v6 Integration
 * Manages the admin calendar view for bookings, blocked dates, and pricing
 */

const calendarManager = {
  calendar: null,
  currentUnitId: null,
  selectedEvent: null,
  initialized: false,
  units: [],

  /**
   * Initialize FullCalendar instance
   */
  init() {
    console.log('[Calendar Manager] init() called');
    
    // Prevent double initialization
    if (this.initialized) {
      console.log('[Calendar Manager] Already initialized, refreshing...');
      this.refreshCalendar();
      return;
    }

    const calendarEl = document.getElementById('calendarContainer');
    if (!calendarEl) {
      console.error('[Calendar Manager] Calendar container not found');
      return;
    }

    // Check if FullCalendar is available
    if (typeof FullCalendar === 'undefined') {
      console.error('[Calendar Manager] FullCalendar library not loaded');
      showToast('Calendar library failed to load', '⚠️');
      return;
    }

    try {
      console.log('[Calendar Manager] Creating FullCalendar instance...');
      this.calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        headerToolbar: {
          left: 'prev,next today addEventButton',
          center: 'title',
          right: 'dayGridMonth'
        },
        height: 'auto',
        contentHeight: 'auto',
        editable: false,
        eventClick: (info) => this.handleEventClick(info),
        datesSet: (info) => this.onDatesSet(info),
        customButtons: {
          addEventButton: {
            text: '+ Create Booking',
            click: () => this.openQuickBookingModal()
          }
        },
        eventDidMount: (info) => this.styleEvent(info),
      });

      this.calendar.render();
      console.log('[Calendar Manager] FullCalendar rendered successfully');
      
      this.initialized = true;
      this.loadUnits();
      this.refreshCalendar();
    } catch (err) {
      console.error('[Calendar Manager] Failed to initialize calendar:', err);
      showToast('Failed to initialize calendar', '⚠️');
    }
  },

  /**
   * Load available units for dropdown
   */
  async loadUnits() {
    try {
      const response = await fetch('/api/calendar/units');
      const data = await response.json();

      if (data.ok && data.data) {
        this.units = data.data;
        this.populateUnitSelect();
      }
    } catch (err) {
      console.error('Failed to load units:', err);
      showToast('Failed to load units', '⚠️');
    }
  },

  /**
   * Populate unit dropdown
   */
  populateUnitSelect() {
    const select = document.getElementById('unitSelectCal');
    if (!select) return;

    select.innerHTML = '<option value="">All Units</option>' +
      (this.units || [])
        .map(u => `<option value="${u.unit_id}">${u.name || u.unit_id}</option>`)
        .join('');
  },

  /**
   * Refresh calendar data
   */
  async refreshCalendar() {
    const unitId = document.getElementById('unitSelectCal')?.value || '';
    this.currentUnitId = unitId;

    // Get date range for current calendar view
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    await this.fetchCalendarEvents(startDate, endDate, unitId);
  },

  /**
   * Fetch calendar events from API
   */
  async fetchCalendarEvents(startDate, endDate, unitId) {
    try {
      const start = this.formatDate(startDate);
      const end = this.formatDate(endDate);

      // Build query params
      let bookingsUrl = `/api/admin/bookings?startDate=${start}&endDate=${end}`;
      let blockedUrl = `/api/admin/blocked-dates?startDate=${start}&endDate=${end}`;

      if (unitId) {
        bookingsUrl += `&unitId=${unitId}`;
        blockedUrl += `&unitId=${unitId}`;
      }

      // Get token from global state
      const token = window.state?.token || localStorage.getItem('adminToken');
      const headers = {
        'Authorization': `Bearer ${token}`
      };

      // Fetch both bookings and blocked dates in parallel
      const [bookingsRes, blockedRes] = await Promise.all([
        fetch(bookingsUrl, { headers }),
        fetch(blockedUrl, { headers })
      ]);

      const bookingsData = await bookingsRes.json();
      const blockedData = await blockedRes.json();

      // Convert to FullCalendar events
      const events = [];

      // Add booking events
      if (bookingsData.ok && bookingsData.data) {
        bookingsData.data.forEach(booking => {
          events.push({
            id: `booking-${booking.id}`,
            title: `${booking.guest_name || 'Guest'} • ${booking.unit_id}`,
            start: booking.checkin_date,
            end: new Date(new Date(booking.checkout_date).getTime() + 86400000).toISOString().split('T')[0],
            backgroundColor: '#7A8C6E',
            borderColor: '#7A8C6E',
            extendedProps: {
              type: 'booking',
              bookingId: booking.id,
              guestName: booking.guest_name,
              guestPhone: booking.guest_phone,
              unitId: booking.unit_id,
              status: booking.status,
              totalKes: booking.total_kes,
              checkinDate: booking.checkin_date,
              checkoutDate: booking.checkout_date,
            }
          });
        });
      }

      // Add blocked date events
      if (blockedData.ok && blockedData.data) {
        blockedData.data.forEach(block => {
          events.push({
            id: `blocked-${block.id}`,
            title: `🔒 Blocked (${block.reason || 'Maintenance'})`,
            start: block.start_date,
            end: new Date(new Date(block.end_date).getTime() + 86400000).toISOString().split('T')[0],
            backgroundColor: '#6B6358',
            borderColor: '#6B6358',
            display: 'background',
            extendedProps: {
              type: 'blocked',
              blockedId: block.id,
              reason: block.reason,
              unitId: block.unit_id,
            }
          });
        });
      }

      // Update calendar with events
      if (this.calendar) {
        this.calendar.removeAllEvents();
        events.forEach(event => this.calendar.addEvent(event));
      }

    } catch (err) {
      console.error('Failed to fetch calendar events:', err);
      showToast('Failed to load calendar data', '⚠️');
    }
  },

  /**
   * Handle event click
   */
  handleEventClick(info) {
    const event = info.event;
    const ext = event.extendedProps;

    if (ext.type === 'booking') {
      this.showEventDetail(event);
    } else if (ext.type === 'blocked') {
      showToast(`Blocked period: ${ext.reason}`, 'ℹ️');
    }
  },

  /**
   * Show event detail modal
   */
  showEventDetail(event) {
    const ext = event.extendedProps;
    this.selectedEvent = event;

    const modal = document.getElementById('eventDetailModal');
    const content = document.getElementById('eventDetailsContent');

    const nights = Math.ceil(
      (new Date(event.extendedProps.checkoutDate) - new Date(event.extendedProps.checkinDate)) / (1000 * 60 * 60 * 24)
    );

    content.innerHTML = `
      <div style="background: var(--cream); padding: 16px; border-radius: var(--radius); margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: .9rem;">
          <div>
            <div style="color: var(--text-muted); margin-bottom: 4px;">Guest</div>
            <div style="font-weight: 500;">${ext.guestName || 'Unknown'}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); margin-bottom: 4px;">Phone</div>
            <div style="font-weight: 500;">${ext.guestPhone || '—'}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); margin-bottom: 4px;">Unit</div>
            <div style="font-weight: 500;">${ext.unitId}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); margin-bottom: 4px;">Status</div>
            <div style="font-weight: 500; text-transform: uppercase; font-size: .8rem;">
              <span class="badge badge-${ext.status}">${ext.status}</span>
            </div>
          </div>
          <div>
            <div style="color: var(--text-muted); margin-bottom: 4px;">Check-in</div>
            <div style="font-weight: 500;">${ext.checkinDate}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); margin-bottom: 4px;">Check-out</div>
            <div style="font-weight: 500;">${ext.checkoutDate}</div>
          </div>
          <div colspan="2" style="grid-column: 1/-1;">
            <div style="color: var(--text-muted); margin-bottom: 4px;">Duration & Total</div>
            <div style="font-weight: 500; font-size: 1.1rem;">
              ${nights} night${nights !== 1 ? 's' : ''} • <span style="color: var(--earth);">Ksh ${(ext.totalKes || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Show edit/delete buttons only for pending/confirmed bookings
    if (ext.status === 'pending' || ext.status === 'confirmed') {
      document.getElementById('eventEditBtn').style.display = 'inline-flex';
      document.getElementById('eventDeleteBtn').style.display = 'inline-flex';
    } else {
      document.getElementById('eventEditBtn').style.display = 'none';
      document.getElementById('eventDeleteBtn').style.display = 'none';
    }

    modal.style.display = 'flex';
  },

  /**
   * Style event element
   */
  styleEvent(info) {
    const ext = info.event.extendedProps;
    
    if (ext.type === 'booking') {
      info.el.style.cursor = 'pointer';
      info.el.classList.add('booking-event');
    } else if (ext.type === 'blocked') {
      info.el.classList.add('blocked-event');
    }
  },

  /**
   * Open quick booking modal
   */
  openQuickBookingModal() {
    const modal = document.getElementById('quickBookingModal');
    const unitSelect = document.getElementById('quickBookingUnit');

    // Populate unit select
    unitSelect.innerHTML = '<option value="">Select Unit</option>' +
      (this.units || [])
        .map(u => `<option value="${u.unit_id}">${u.name || u.unit_id}</option>`)
        .join('');

    // If a unit is already selected in the main filter, pre-fill it
    if (this.currentUnitId) {
      unitSelect.value = this.currentUnitId;
    }

    // Clear form
    document.getElementById('quickBookingCheckin').value = '';
    document.getElementById('quickBookingCheckout').value = '';
    document.getElementById('quickBookingGuestName').value = '';
    document.getElementById('quickBookingGuestPhone').value = '';
    document.getElementById('quickBookingTotal').value = '';

    modal.style.display = 'flex';
  },

  /**
   * Format date to YYYY-MM-DD
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * On calendar dates change (month/year navigation)
   */
  onDatesSet(info) {
    // Optionally refresh events when calendar view changes
    // Currently events remain static, but this hook can be used for lazy loading
  }
};

/**
 * UI Helper Functions
 */

function toggleCalendarLegend() {
  const legend = document.getElementById('calendarLegend');
  legend.style.display = legend.style.display === 'none' ? 'block' : 'none';
}

function closeEventModal() {
  document.getElementById('eventDetailModal').style.display = 'none';
  calendarManager.selectedEvent = null;
}

function editCalendarEvent() {
  if (!calendarManager.selectedEvent) return;
  const ext = calendarManager.selectedEvent.extendedProps;
  
  // For now, show a simple alert
  // In a full implementation, this would open an edit modal
  alert(`Edit booking ${ext.bookingId} - Feature coming soon`);
}

async function deleteCalendarEvent() {
  if (!calendarManager.selectedEvent) return;
  
  const ext = calendarManager.selectedEvent.extendedProps;
  if (!confirm('Are you sure you want to delete this booking?')) return;

  try {
    const token = window.state?.token || localStorage.getItem('adminToken');
    const response = await fetch(`/api/admin/bookings/${ext.bookingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.ok) {
      closeEventModal();
      calendarManager.refreshCalendar();
      showToast('Booking deleted successfully', '✓');
    } else {
      showToast(data.error || 'Failed to delete booking', '⚠️');
    }
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Error deleting booking', '⚠️');
  }
}

function closeQuickBookingModal() {
  document.getElementById('quickBookingModal').style.display = 'none';
}

async function submitQuickBooking(event) {
  event.preventDefault();

  const unitId = document.getElementById('quickBookingUnit').value;
  const checkin = document.getElementById('quickBookingCheckin').value;
  const checkout = document.getElementById('quickBookingCheckout').value;
  const guestName = document.getElementById('quickBookingGuestName').value;
  const guestPhone = document.getElementById('quickBookingGuestPhone').value;
  const total = parseFloat(document.getElementById('quickBookingTotal').value) || 0;

  if (!unitId || !checkin || !checkout || !guestName || !guestPhone) {
    showToast('Please fill in all required fields', '⚠️');
    return;
  }

  if (new Date(checkout) <= new Date(checkin)) {
    showToast('Check-out date must be after check-in date', '⚠️');
    return;
  }

  try {
    const token = window.state?.token || localStorage.getItem('adminToken');
    if (!token) {
      showToast('Authentication failed. Please log in again.', '⚠️');
      return;
    }

    const response = await fetch('/api/admin/bookings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        unitId,
        checkinDate: checkin,
        checkoutDate: checkout,
        guestName,
        guestPhone,
        totalKes: total
      })
    });

    const data = await response.json();

    if (data.ok) {
      closeQuickBookingModal();
      calendarManager.refreshCalendar();
      showToast('Booking created successfully', '✓');
    } else {
      showToast(data.error || 'Failed to create booking', '⚠️');
    }
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Error creating booking', '⚠️');
  }
}

// Note: Calendar initialization is triggered when user navigates to Calendar Manager page
// via loadCalendarData() in admin.js, which is called from showPage('calendar-manager')
