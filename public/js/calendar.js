/**
 * NYATHIRA CALENDAR WIDGET
 * Interactive availability calendar with pricing integration
 * Fetches real-time data from /api/calendar endpoints
 */

const CalendarWidget = {
  state: {
    currentDate: new Date(),
    selectedStart: null,
    selectedEnd: null,
    unitId: null,
    availabilityData: null,
    pricingData: null,
    loading: false,
    error: null
  },

  /**
   * Initialize calendar for specific unit
   */
  async init(unitId, containerId) {
    this.state.unitId = unitId;
    this.state.loading = true;

    try {
      // Fetch availability and pricing data
      const [availability, pricing] = await Promise.all([
        this.fetchAvailability(unitId),
        this.fetchPricing(unitId)
      ]);

      this.state.availabilityData = availability;
      this.state.pricingData = pricing;
      this.state.loading = false;

      // Render calendar
      this.render(containerId);
    } catch (err) {
      console.error('Calendar init error:', err);
      this.state.error = 'Failed to load calendar data';
      this.state.loading = false;
    }
  },

  /**
   * Fetch availability data from API
   */
  async fetchAvailability(unitId) {
    const startDate = this.formatDate(new Date());
    const endDate = this.formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)); // 60 days ahead

    const response = await fetch(`/api/calendar/availability/${unitId}?startDate=${startDate}&endDate=${endDate}`);
    
    if (!response.ok) throw new Error('Failed to fetch availability');
    
    const data = await response.json();
    return data.data || {};
  },

  /**
   * Fetch pricing rules from API
   */
  async fetchPricing(unitId) {
    const startDate = this.formatDate(new Date());
    const endDate = this.formatDate(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

    const response = await fetch(`/api/calendar/pricing/${unitId}?startDate=${startDate}&endDate=${endDate}`);
    
    if (!response.ok) throw new Error('Failed to fetch pricing');
    
    const data = await response.json();
    return data.data || {};
  },

  /**
   * Render the calendar
   */
  render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const html = `
      <div class="calendar-widget">
        <div class="calendar-header">
          <div class="calendar-nav">
            <button class="cal-nav-btn" onclick="CalendarWidget.previousMonth()">‹</button>
            <div class="cal-month-year" id="calMonthYear"></div>
            <button class="cal-nav-btn" onclick="CalendarWidget.nextMonth()">›</button>
          </div>
        </div>

        <div class="calendar-grid">
          <div class="cal-weekdays">
            <div class="cal-weekday">Sun</div>
            <div class="cal-weekday">Mon</div>
            <div class="cal-weekday">Tue</div>
            <div class="cal-weekday">Wed</div>
            <div class="cal-weekday">Thu</div>
            <div class="cal-weekday">Fri</div>
            <div class="cal-weekday">Sat</div>
          </div>
          <div class="cal-days" id="calDays"></div>
        </div>

        <div class="calendar-selection" id="calSelection" style="display:none">
          <div class="selection-header">Selected Dates</div>
          <div class="selection-dates">
            <span id="selStart">—</span> to <span id="selEnd">—</span>
          </div>
          <div class="selection-nights" id="selNights" style="display:none">
            <span id="nightsCount">0</span> nights
          </div>
          <div class="selection-price" id="selPrice" style="display:none">
            <div style="font-size:.8rem;color:var(--text-muted)">Estimated total</div>
            <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--earth)">Ksh <span id="priceTotal">0</span></div>
          </div>
          <button class="btn btn-primary" onclick="CalendarWidget.applySelection()" style="width:100%;margin-top:12px;justify-content:center">Use These Dates</button>
        </div>

        <div class="calendar-legend">
          <div class="legend-item">
            <div class="legend-color available"></div>
            <span>Available</span>
          </div>
          <div class="legend-item">
            <div class="legend-color booked"></div>
            <span>Booked</span>
          </div>
          <div class="legend-item">
            <div class="legend-color blocked"></div>
            <span>Maintenance</span>
          </div>
          <div class="legend-item">
            <div class="legend-color priced"></div>
            <span>Peak Price</span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.renderDays();
  },

  /**
   * Render calendar days grid
   */
  renderDays() {
    const year = this.state.currentDate.getFullYear();
    const month = this.state.currentDate.getMonth();
    
    // Update month/year header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calMonthYear').textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const daysContainer = document.getElementById('calDays');
    daysContainer.innerHTML = '';

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'cal-day-empty';
      daysContainer.appendChild(emptyCell);
    }

    // Add days
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      const dateStr = this.formatDate(date);

      const dayCell = document.createElement('div');
      dayCell.className = 'cal-day';

      // Disable past dates
      if (date < today) {
        dayCell.classList.add('past');
        dayCell.innerHTML = `<span>${day}</span>`;
        daysContainer.appendChild(dayCell);
        continue;
      }

      // Check availability status
      const status = this.getDayStatus(dateStr);
      dayCell.classList.add(`status-${status}`);
      
      // Add price indicator if available
      let priceLabel = '';
      if (status === 'available' || status === 'priced') {
        const price = this.getDayPrice(dateStr);
        if (price) priceLabel = `<div class="day-price">Ksh ${price}</div>`;
      }

      dayCell.innerHTML = `<span>${day}</span>${priceLabel}`;
      dayCell.onclick = () => this.selectDate(date);

      // Highlight selected range
      if (this.state.selectedStart && this.state.selectedEnd &&
          date >= this.state.selectedStart && date <= this.state.selectedEnd) {
        dayCell.classList.add('in-range');
      }
      if (this.state.selectedStart && this.formatDate(date) === this.formatDate(this.state.selectedStart)) {
        dayCell.classList.add('range-start');
      }
      if (this.state.selectedEnd && this.formatDate(date) === this.formatDate(this.state.selectedEnd)) {
        dayCell.classList.add('range-end');
      }

      daysContainer.appendChild(dayCell);
    }
  },

  /**
   * Get availability status for specific date
   */
  getDayStatus(dateStr) {
    const data = this.state.availabilityData || {};

    if (data.bookedDates && data.bookedDates.includes(dateStr)) {
      return 'booked';
    }
    
    if (data.blockedDates && data.blockedDates.includes(dateStr)) {
      return 'blocked';
    }

    // Check if date has pricing override (indicates peak pricing)
    if (data.pricingRules) {
      for (let rule of data.pricingRules) {
        if (dateStr >= rule.start_date && dateStr <= rule.end_date) {
          return 'priced';
        }
      }
    }

    return 'available';
  },

  /**
   * Get price for specific date
   */
  getDayPrice(dateStr) {
    const data = this.state.availabilityData || {};

    if (data.pricingRules) {
      for (let rule of data.pricingRules) {
        if (dateStr >= rule.start_date && dateStr <= rule.end_date) {
          return rule.price_per_night_kes || rule.price;
        }
      }
    }

    if (data.basePrice) {
      return data.basePrice;
    }

    return null;
  },

  /**
   * Handle date selection
   */
  selectDate(date) {
    const dateStr = this.formatDate(date);
    const status = this.getDayStatus(dateStr);

    // Can't select unavailable dates
    if (status === 'booked' || status === 'blocked') {
      return;
    }

    // First date selection
    if (!this.state.selectedStart || this.state.selectedEnd) {
      this.state.selectedStart = new Date(date);
      this.state.selectedEnd = null;
    }
    // Second date selection
    else if (date < this.state.selectedStart) {
      // Swap if selected end is before start
      this.state.selectedEnd = this.state.selectedStart;
      this.state.selectedStart = new Date(date);
    }
    else {
      this.state.selectedEnd = new Date(date);
    }

    // Validate minimum stay
    if (this.state.selectedStart && this.state.selectedEnd) {
      const nights = Math.ceil((this.state.selectedEnd - this.state.selectedStart) / (24 * 60 * 60 * 1000));
      const minStay = this.state.availabilityData?.minStay || 1;

      if (nights < minStay) {
        this.state.selectedEnd = null;
      }
    }

    // Update UI
    this.renderDays();
    this.updateSelectionDisplay();
  },

  /**
   * Update selection display panel
   */
  updateSelectionDisplay() {
    const selPanel = document.getElementById('calSelection');
    
    if (!this.state.selectedStart) {
      selPanel.style.display = 'none';
      return;
    }

    selPanel.style.display = 'block';
    
    // Update dates
    document.getElementById('selStart').textContent = this.formatDateDisplay(this.state.selectedStart);
    
    if (this.state.selectedEnd) {
      document.getElementById('selEnd').textContent = this.formatDateDisplay(this.state.selectedEnd);
      
      // Calculate nights and price
      const nights = Math.ceil((this.state.selectedEnd - this.state.selectedStart) / (24 * 60 * 60 * 1000));
      document.getElementById('nightsCount').textContent = nights;
      document.getElementById('selNights').style.display = 'block';

      // Calculate total price
      const totalPrice = this.calculateTotalPrice(this.state.selectedStart, this.state.selectedEnd);
      document.getElementById('priceTotal').textContent = totalPrice.toLocaleString();
      document.getElementById('selPrice').style.display = 'block';
    } else {
      document.getElementById('selEnd').textContent = '—';
      document.getElementById('selNights').style.display = 'none';
      document.getElementById('selPrice').style.display = 'none';
    }
  },

  /**
   * Calculate total price for date range
   */
  calculateTotalPrice(startDate, endDate) {
    let total = 0;
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate < endDate) {
      const dateStr = this.formatDate(currentDate);
      const price = this.getDayPrice(dateStr);
      
      if (price) {
        total += price;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return total;
  },

  /**
   * Apply selected dates to booking modal
   */
  applySelection() {
    if (!this.state.selectedStart || !this.state.selectedEnd) {
      alert('Please select both check-in and check-out dates');
      return;
    }

    // Update booking state
    if (window.state) {
      window.state.bookingUnit = this.state.unitId || 'bnb1b-nyathira';
      
      // Set booking modal dates
      const checkinEl = document.getElementById('checkinDate');
      const checkoutEl = document.getElementById('checkoutDate');
      
      if (checkinEl) checkinEl.value = this.formatDate(this.state.selectedStart);
      if (checkoutEl) checkoutEl.value = this.formatDate(this.state.selectedEnd);
      
      // Update guest count display
      const nightsCount = Math.ceil((this.state.selectedEnd - this.state.selectedStart) / (24 * 60 * 60 * 1000));
      console.log(`Calendar: ${nightsCount} nights selected at Ksh ${this.calculateTotalPrice(this.state.selectedStart, this.state.selectedEnd).toLocaleString()}`);
    }

    // Trigger booking summary update
    if (window.updateBookingSummary) {
      setTimeout(() => window.updateBookingSummary(), 100);
    }

    // Close calendar modal after short delay
    const calendarModal = document.getElementById('calendarModal');
    if (calendarModal) {
      calendarModal.classList.remove('open');
    }

    // Open booking modal to booking step 2
    setTimeout(() => {
      const bookingModal = document.getElementById('bookingModal');
      if (bookingModal) {
        bookingModal.classList.add('open');
        // Navigate to date step (which is already populated)
        if (window.goBookingStep) {
          window.goBookingStep(2);
        }
      }
    }, 200);

    // Show success message
    const nights = Math.ceil((this.state.selectedEnd - this.state.selectedStart) / (24 * 60 * 60 * 1000));
    const total = this.calculateTotalPrice(this.state.selectedStart, this.state.selectedEnd);
    
    if (window.showToast) {
      window.showToast(`✓ ${nights} nights selected – Ksh ${total.toLocaleString()} estimated`, '✓');
    }
  },

  /**
   * Navigate to previous month
   */
  previousMonth() {
    this.state.currentDate.setMonth(this.state.currentDate.getMonth() - 1);
    this.renderDays();
  },

  /**
   * Navigate to next month
   */
  nextMonth() {
    this.state.currentDate.setMonth(this.state.currentDate.getMonth() + 1);
    this.renderDays();
  },

  /**
   * Format date to YYYY-MM-DD string
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Format date for display (e.g., "Mar 15")
   */
  formatDateDisplay(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }
};

/**
 * CSS Styles for Calendar Widget
 * Add to <style> section if not already defined
 */
const calendarStyles = `
  .calendar-widget {
    background: #fff;
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .calendar-header {
    padding: 20px;
    background: rgba(139,111,71,.03);
    border-bottom: 1px solid var(--border);
  }

  .calendar-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .cal-nav-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: #fff;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: var(--transition);
  }

  .cal-nav-btn:hover {
    border-color: var(--earth);
    color: var(--earth);
  }

  .cal-month-year {
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 400;
    color: var(--charcoal);
  }

  .calendar-grid {
    padding: 16px;
  }

  .cal-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    margin-bottom: 8px;
  }

  .cal-weekday {
    text-align: center;
    font-size: .75rem;
    font-weight: 600;
    color: var(--text-light);
    letter-spacing: .05em;
    text-transform: uppercase;
    padding: 8px 4px;
  }

  .cal-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
  }

  .cal-day, .cal-day-empty {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    transition: var(--transition);
    border: 1px solid transparent;
    font-size: .8rem;
    font-weight: 500;
    position: relative;
    overflow: hidden;
  }

  .cal-day-empty {
    cursor: default;
    background: transparent;
  }

  .cal-day.past {
    background: var(--cream);
    color: var(--text-light);
    cursor: not-allowed;
  }

  .cal-day.status-available {
    background: rgba(122,140,110,.08);
    border-color: rgba(122,140,110,.2);
    color: var(--charcoal);
  }

  .cal-day.status-available:hover {
    background: rgba(122,140,110,.15);
    border-color: var(--sage);
  }

  .cal-day.status-booked {
    background: var(--cream);
    color: var(--text-light);
    cursor: not-allowed;
    border-color: rgba(196,98,45,.2);
  }

  .cal-day.status-blocked {
    background: rgba(139,111,71,.12);
    color: var(--text-muted);
    cursor: not-allowed;
    border-color: rgba(139,111,71,.2);
  }

  .cal-day.status-priced {
    background: rgba(196,168,130,.15);
    border-color: var(--gold);
    color: var(--earth-dark);
  }

  .cal-day.status-priced:hover {
    background: rgba(196,168,130,.25);
  }

  .cal-day.range-start,
  .cal-day.range-end {
    background: var(--earth);
    color: #fff;
    border-color: var(--earth-dark);
  }

  .cal-day.in-range {
    background: rgba(139,111,71,.15);
    border-color: rgba(139,111,71,.3);
  }

  .day-price {
    font-size: .6rem;
    color: var(--rust);
    margin-top: 2px;
    font-weight: 600;
  }

  .calendar-selection {
    padding: 20px;
    background: rgba(139,111,71,.03);
    border-top: 1px solid var(--border);
  }

  .selection-header {
    font-size: .7rem;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--text-light);
    margin-bottom: 8px;
    font-weight: 600;
  }

  .selection-dates {
    font-size: .9rem;
    color: var(--charcoal);
    margin-bottom: 12px;
  }

  .selection-nights {
    font-size: .82rem;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .selection-price {
    background: #fff;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .calendar-legend {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    padding: 16px;
    background: var(--cream);
    border-top: 1px solid var(--border);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: .8rem;
    color: var(--text-muted);
  }

  .legend-color {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(139,111,71,.2);
  }

  .legend-color.available {
    background: rgba(122,140,110,.15);
  }

  .legend-color.booked {
    background: var(--cream);
    border-color: rgba(196,98,45,.2);
  }

  .legend-color.blocked {
    background: rgba(139,111,71,.12);
  }

  .legend-color.priced {
    background: rgba(196,168,130,.15);
    border-color: var(--gold);
  }

  @media (max-width: 600px) {
    .calendar-legend {
      grid-template-columns: 1fr;
    }
  }
`;

// Inject styles if not already present
if (!document.querySelector('style[data-calendar]')) {
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-calendar', 'true');
  styleEl.textContent = calendarStyles;
  document.head.appendChild(styleEl);
}
