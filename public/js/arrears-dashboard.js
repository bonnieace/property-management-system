/**
 * ARREARS DASHBOARD
 * Shows payment arrears for all tenants
 */

const arrearsDashboard = {
  arrearsList: [],
  allContracts: [],

  /**
   * Initialize arrears dashboard
   */
  async init() {
    console.log('📊 [ArrearsDashboard.init] Initializing arrears dashboard');
    await this.loadArrears();
    console.log('📊 [ArrearsDashboard.init] Initialization complete');
  },

  /**
   * Load arrears data
   */
  async loadArrears() {
    try {
      console.log('📊 [ArrearsDashboard.loadArrears] Fetching arrears from API...');
      
      const response = await fetch(`${API_BASE}/api/admin/arrears`);
      if (!response.ok) throw new Error('Arrears could not be loaded');
      this.arrearsList = (await response.json()).data;
      this.allContracts = this.arrearsList;

      this.renderArrearsDashboard();
    } catch (err) {
      console.error('📊 [ArrearsDashboard.loadArrears] Error:', err);
      alert('Failed to load arrears data');
    }
  },

  /**
   * Render arrears dashboard
   */
  renderArrearsDashboard() {
    const container = document.getElementById('arrearsDashboardContainer');
    if (!container) {
      console.warn('❌ [ArrearsDashboard.renderArrearsDashboard] arrearsDashboardContainer element not found!');
      return;
    }

    // Calculate summary stats
    const totalOutstanding = this.arrearsList.reduce((sum, item) => sum + Number(item.total_outstanding_kes), 0);
    const tenantsWithArrears = new Set(this.arrearsList.map(c=>c.tenant_id)).size;

    // Render summary cards
    const summaryHtml = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
        <div style="background: linear-gradient(135deg, var(--rust), var(--earth)); color: white; padding: 20px; border-radius: var(--radius); box-shadow: var(--shadow-md);">
          <div style="font-size: 0.9rem; opacity: 0.9;">Total Outstanding</div>
          <div style="font-size: 2rem; font-weight: 600; margin-top: 8px;">KES ${totalOutstanding.toLocaleString()}</div>
        </div>
        <div style="background: linear-gradient(135deg, var(--earth), var(--earth-light)); color: white; padding: 20px; border-radius: var(--radius); box-shadow: var(--shadow-md);">
          <div style="font-size: 0.9rem; opacity: 0.9;">Tenants in Arrears</div>
          <div style="font-size: 2rem; font-weight: 600; margin-top: 8px;">${tenantsWithArrears}</div>
        </div>
        <div style="background: linear-gradient(135deg, var(--sage), var(--earth-dark)); color: white; padding: 20px; border-radius: var(--radius); box-shadow: var(--shadow-md);">
          <div style="font-size: 0.9rem; opacity: 0.9;">Average Arrears</div>
          <div style="font-size: 2rem; font-weight: 600; margin-top: 8px;">KES ${tenantsWithArrears > 0 ? (totalOutstanding / tenantsWithArrears).toLocaleString() : '0'}</div>
        </div>
      </div>
    `;

    // Render arrears table
    const tableHtml = `
      <h3 style="margin-bottom: 16px; font-size: 1.3rem;">Tenants with Outstanding Payments</h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--cream); border-bottom: 2px solid var(--border-strong);">
              <th style="padding: 12px; text-align: left; font-weight: 600;">Tenant</th>
              <th style="padding: 12px; text-align: left; font-weight: 600;">Unit</th>
              <th style="padding: 12px; text-align: right; font-weight: 600;">Monthly Rent</th>
              <th style="padding: 12px; text-align: right; font-weight: 600;">Outstanding</th>
              <th style="padding: 12px; text-align: center; font-weight: 600;">Months Behind</th>
              <th style="padding: 12px; text-align: center; font-weight: 600;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${this.arrearsList.map(arrears => {
              const monthsBehind = Math.ceil(arrears.total_outstanding_kes / arrears.monthly_rent_kes);
              return `
                <tr style="border-bottom: 1px solid var(--border);">
                  <td style="padding: 12px;"><strong>${escapeHtml(arrears.tenant_name)}</strong></td>
                  <td style="padding: 12px;">${escapeHtml(arrears.unit_code)}</td>
                  <td style="padding: 12px; text-align: right;">KES ${Number(arrears.monthly_rent_kes).toLocaleString()}</td>
                  <td style="padding: 12px; text-align: right; color: var(--rust); font-weight: 600;">KES ${Number(arrears.total_outstanding_kes).toLocaleString()}</td>
                  <td style="padding: 12px; text-align: center;">
                    <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; background: rgba(196,98,45,.1); color: var(--rust); font-weight: 600;">
                      ${monthsBehind} ${monthsBehind === 1 ? 'month' : 'months'}
                    </span>
                  </td>
                  <td style="padding: 12px; text-align: center;">
                    <button onclick="arrearsDashboard.viewTenantArrears('${arrears.id}')" class="btn-icon" title="View Details">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button onclick="arrearsDashboard.recordPaymentForTenant('${arrears.id}')" class="btn-icon" title="Record Payment">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = summaryHtml + tableHtml;
  },

  /**
   * View tenant arrears details
   */
  async viewTenantArrears(contractId) {
    const contract = this.allContracts.find(c => c.id === contractId);
    if (!contract) return;

    // Switch to payments page and filter by contract
    if (paymentsManager) {
      await paymentsManager.loadPayments(contractId);
      showPage('rentalPayments');
      localStorage.setItem('adminLastPage', 'rentalPayments');
    }
  },

  /**
   * Record payment for tenant with arrears
   */
  async recordPaymentForTenant(contractId) {
    const contract = this.allContracts.find(c => c.id === contractId);
    if (!contract) return;

    // Open payment recording modal
    if (paymentsManager) {
      await paymentsManager.loadContracts();
      paymentsManager.openRecordPaymentModal();
      paymentsManager.currentPaymentId = null;
      const modal = document.getElementById('recordPaymentModal') || paymentsManager.createRecordPaymentModal();
      const form = document.getElementById('recordPaymentForm');
      if (form) {
        document.getElementById('recordPaymentContractInput').value = contractId;
        document.getElementById('recordPaymentFormTitle').textContent = `Record Payment - ${escapeHtml(contract.tenant_name)}`;
        document.getElementById('recordPaymentAmountInput').value = '';
      }
      modal.classList.add('open');
    }
  }
};
