/**
 * PAYMENTS MANAGER
 * Handles rental payment recording and tracking
 */

const paymentsManager = {
  payments: [],
  contracts: [],
  currentPaymentId: null,
  filterContractId: null,

  /**
   * Initialize payments manager
   */
  async init() {

    await this.loadContracts();
    await this.loadPayments();
    this.attachEventListeners();

  },

  /**
   * Load contracts for dropdown
   */
  async loadContracts() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/contracts?limit=1000`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (response.ok) {
        const result = await response.json();
        this.contracts = result.data || [];
      }
    } catch (err) {
      console.error('💰 [PaymentsManager.loadContracts] Error:', err);
    }
  },

  /**
   * Load payments
   */
  async loadPayments(contractId = null) {
    try {

      this.filterContractId = contractId;
      
      let url = `${API_BASE}/api/admin/payments`;
      if (contractId) {
        url += `?contract_id=${contractId}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) {
        console.error('💰 [PaymentsManager.loadPayments] Failed to load payments:', response.status);
        return;
      }

      const result = await response.json();
      this.payments = result.data || [];
      this.renderPaymentsTable();
    } catch (err) {
      console.error('💰 [PaymentsManager.loadPayments] Error:', err);
      alert('Failed to load payments');
    }
  },

  /**
   * Render payments table
   */
  renderPaymentsTable() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) {
      console.warn('❌ [PaymentsManager.renderPaymentsTable] paymentsTableBody element not found!');
      return;
    }

    if (this.payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 32px;">No payments found</td></tr>';
      return;
    }

    tbody.innerHTML = this.payments.map(payment => `
      <tr>
        <td>${payment.id || '—'}</td>
        <td><strong>${escapeHtml(payment.tenant_name || 'N/A')}</strong></td>
        <td>${escapeHtml(payment.unit_code || '—')}</td>
        <td>${(payment.month || '—')}/${(payment.year || '—')}</td>
        <td>KES ${Number(payment.amount_paid_kes || 0).toLocaleString()}</td>
        <td>KES ${Number(payment.amount_outstanding_kes || 0).toLocaleString()}</td>
        <td>
          <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500; background: ${
            payment.status === 'paid' ? 'rgba(122,140,110,.1); color: var(--sage)' :
            payment.status === 'partial' ? 'rgba(196,155,45,.1); color: var(--gold)' :
            'rgba(196,98,45,.1); color: var(--rust)'
          };">
            ${(payment.status || 'pending').charAt(0).toUpperCase() + (payment.status || 'pending').slice(1)}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            ${payment.status !== 'paid' ? `<button onclick="paymentsManager.recordPayment(${payment.id})" class="btn-icon" title="Record Payment">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            </button>` : ''}
            <button onclick="paymentsManager.viewPaymentDetails(${payment.id})" class="btn-icon" title="View Details">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  /**
   * Render payments in modal (for contract details view)
   */
  async renderPaymentsInModal(contractId) {
    try {
      // Fetch payments for this specific contract
      const response = await fetch(`${API_BASE}/api/admin/payments?contract_id=${contractId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) {
        console.error('Failed to load payments:', response.status);
        return;
      }

      const result = await response.json();
      const payments = result.data || [];

      const tbody = document.getElementById('contractPaymentsTableBody');
      if (!tbody) {
        console.warn('contractPaymentsTableBody element not found!');
        return;
      }

      if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 32px;">No payments found for this contract</td></tr>';
        return;
      }

      tbody.innerHTML = payments.map(payment => `
        <tr>
          <td>${payment.id || '—'}</td>
          <td><strong>${escapeHtml(payment.tenant_name || 'N/A')}</strong></td>
          <td>${escapeHtml(payment.unit_code || '—')}</td>
          <td>${(payment.month || '—')}/${(payment.year || '—')}</td>
          <td>KES ${Number(payment.amount_paid_kes || 0).toLocaleString()}</td>
          <td>KES ${Number(payment.amount_outstanding_kes || 0).toLocaleString()}</td>
          <td>
            <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500; background: ${
              payment.status === 'paid' ? 'rgba(122,140,110,.1); color: var(--sage)' :
              payment.status === 'partial' ? 'rgba(196,155,45,.1); color: var(--gold)' :
              'rgba(196,98,45,.1); color: var(--rust)'
            };">
              ${(payment.status || 'pending').charAt(0).toUpperCase() + (payment.status || 'pending').slice(1)}
            </span>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error rendering modal payments:', err);
      const tbody = document.getElementById('contractPaymentsTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--rust);">Failed to load payments</td></tr>';
      }
    }
  },

  /**
   * Open record payment modal
   */
  openRecordPaymentModal() {
    this.paymentRequestKey = null;
    this.currentPaymentId = null;
    const modal = document.getElementById('recordPaymentModal') || this.createRecordPaymentModal();
    
    const form = document.getElementById('recordPaymentForm');
    if (form) {
      form.reset();
      document.getElementById('recordPaymentFormTitle').textContent = 'Record New Payment';
      document.getElementById('recordPaymentSubmitBtn').textContent = 'Record Payment';
    }

    modal.classList.add('open');
  },

  /**
   * Record payment
   */
  async recordPayment(paymentId = null) {
    this.paymentRequestKey = null;
    if (paymentId) {
      // Record additional payment for existing payment
      this.currentPaymentId = paymentId;
      const payment = this.payments.find(p => p.id === paymentId);
      if (!payment) return;

      const modal = document.getElementById('recordPaymentModal') || this.createRecordPaymentModal();
      const form = document.getElementById('recordPaymentForm');
      if (form) {
        document.getElementById('recordPaymentFormTitle').textContent = `Record Additional Payment - ${escapeHtml(payment.tenant_name)}`;
        document.getElementById('recordPaymentContractInput').value = payment.contract_id;
        document.getElementById('recordPaymentMonthInput').value = payment.month;
        document.getElementById('recordPaymentYearInput').value = payment.year;
        document.getElementById('recordPaymentAmountInput').value = '';
        document.getElementById('recordPaymentSubmitBtn').textContent = 'Record Payment';
      }
      modal.classList.add('open');
    } else {
      this.openRecordPaymentModal();
    }
  },

  /**
   * Save recorded payment
   */
  async saveRecordedPayment(e) {
    e.preventDefault();

    const contractId = document.getElementById('recordPaymentContractInput').value;
    const month = Number(document.getElementById('recordPaymentMonthInput').value);
    const year = Number(document.getElementById('recordPaymentYearInput').value);
    const amount = Number(document.getElementById('recordPaymentAmountInput').value);

    if (!contractId || !month || !year || !amount) {
      alert('All fields are required');
      return;
    }

    if (amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }

    try {
      // Find the selected contract to get tenant_id and unit_id
      const contract = this.contracts.find(c => c.id === contractId);
      if (!contract) {
        alert('Contract not found');
        return;
      }

      this.paymentRequestKey ||= crypto.randomUUID();
      const response = await fetch(`${API_BASE}/api/admin/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          idempotency_key: this.paymentRequestKey,
          contract_id: contractId,
          tenant_id: contract.tenant_id,
          unit_id: contract.unit_id,
          month: month,
          year: year,
          amount_paid_kes: amount
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to record payment');
      }

      this.paymentRequestKey = null; alert('Payment recorded successfully');
      this.closeRecordPaymentModal();
      await this.loadPayments(this.filterContractId);
    } catch (err) {
      console.error('Error recording payment:', err);
      alert(err.message);
    }
  },

  /**
   * View payment details
   */
  async viewPaymentDetails(paymentId) {
    const payment = this.payments.find(p => p.id === paymentId);
    if (!payment) return;

    const details = `
Payment Details:
─────────────────────
ID: ${payment.id}
Tenant: ${escapeHtml(payment.tenant_name)}
Unit: ${escapeHtml(payment.unit_code)}
Month/Year: ${payment.month}/${payment.year}
Amount Paid: KES ${Number(payment.amount_paid).toLocaleString()}
Outstanding: KES ${Number(payment.amount_outstanding).toLocaleString()}
Status: ${payment.status}
Recorded: ${new Date(payment.created_at).toLocaleDateString()}
    `;

    alert(details);
  },

  /**
   * Create record payment modal
   */
  createRecordPaymentModal() {
    const contractOptions = this.contracts.map(c => `
      <option value="${c.id}">${escapeHtml(c.tenant_name)} - Unit ${escapeHtml(c.unit_code)} (KES ${Number(c.monthly_rent_kes).toLocaleString()})</option>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'recordPaymentModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width: 500px;">
        <div class="modal-header">
          <h2 class="modal-title" id="recordPaymentFormTitle">Record New Payment</h2>
          <button class="modal-close" onclick="paymentsManager.closeRecordPaymentModal()">×</button>
        </div>
        <div class="modal-body">
          <form id="recordPaymentForm" onsubmit="paymentsManager.saveRecordedPayment(event)">
            <div class="form-group">
              <label for="recordPaymentContractInput">Contract <span style="color: var(--rust);">*</span></label>
              <select id="recordPaymentContractInput" required>${contractOptions}</select>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label for="recordPaymentMonthInput">Month <span style="color: var(--rust);">*</span></label>
                <input type="number" id="recordPaymentMonthInput" min="1" max="12" required>
              </div>
              <div class="form-group">
                <label for="recordPaymentYearInput">Year <span style="color: var(--rust);">*</span></label>
                <input type="number" id="recordPaymentYearInput" min="2020" required>
              </div>
            </div>
            <div class="form-group">
              <label for="recordPaymentAmountInput">Amount (KES) <span style="color: var(--rust);">*</span></label>
              <input type="number" id="recordPaymentAmountInput" min="0" step="0.01" required>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="paymentsManager.closeRecordPaymentModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="recordPaymentSubmitBtn" form="recordPaymentForm">Record Payment</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeRecordPaymentModal();
      }
    });
    document.body.appendChild(modal);
    return modal;
  },

  /**
   * Close record payment modal
   */
  closeRecordPaymentModal() {
    const modal = document.getElementById('recordPaymentModal');
    if (modal) {
      modal.classList.remove('open');
    }
  },

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const modal = document.getElementById('recordPaymentModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.className === 'modal-overlay') {
          this.closeRecordPaymentModal();
        }
      });
    }
  }
};
