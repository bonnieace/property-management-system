/**
 * CONTRACTS MANAGER
 * Handles rental contract CRUD operations and lifecycle
 */

const contractsManager = {
  contracts: [],
  units: [],
  tenants: [],
  currentContractId: null,
  filterTenantId: null,

  /**
   * Initialize contracts manager
   */
  async init() {
    console.log('📋 [ContractsManager.init] Initializing contracts manager');
    await this.loadTenants();
    await this.loadUnits();
    await this.loadContracts();
    this.attachEventListeners();
    console.log('📋 [ContractsManager.init] Initialization complete');
  },

  /**
   * Load all tenants for dropdown
   */
  async loadTenants() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/tenants?limit=1000`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (response.ok) {
        const result = await response.json();
        this.tenants = result.data || [];
      }
    } catch (err) {
      console.error('📋 [ContractsManager.loadTenants] Error:', err);
    }
  },

  /**
   * Load all units for dropdown
   */
  async loadUnits() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/units`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (response.ok) {
        const result = await response.json();
        this.units = result.data || [];
      }
    } catch (err) {
      console.error('📋 [ContractsManager.loadUnits] Error:', err);
    }
  },

  /**
   * Load contracts
   */
  async loadContracts(tenantId = null) {
    try {
      console.log('📋 [ContractsManager.loadContracts] Fetching contracts from API...');
      this.filterTenantId = tenantId;
      
      let url = `${API_BASE}/api/admin/contracts`;
      if (tenantId) {
        url += `?tenant_id=${tenantId}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) {
        console.error('📋 [ContractsManager.loadContracts] Failed to load contracts:', response.status);
        return;
      }

      const result = await response.json();
      this.contracts = result.data || [];
      this.renderContractsTable();
    } catch (err) {
      console.error('📋 [ContractsManager.loadContracts] Error:', err);
      alert('Failed to load contracts');
    }
  },

  /**
   * Render contracts table
   */
  renderContractsTable() {
    const tbody = document.getElementById('contractsTableBody');
    if (!tbody) {
      console.warn('❌ [ContractsManager.renderContractsTable] contractsTableBody element not found!');
      return;
    }

    if (this.contracts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 32px;">No contracts found</td></tr>';
      return;
    }

    tbody.innerHTML = this.contracts.map(contract => `
      <tr>
        <td>${contract.id || '—'}</td>
        <td><strong>${contract.tenant_name || 'N/A'}</strong></td>
        <td>${contract.unit_code || '—'}</td>
        <td>KES ${Number(contract.monthly_rent_kes || 0).toLocaleString()}</td>
        <td>${contract.start_date ? new Date(contract.start_date).toLocaleDateString() : '—'}</td>
        <td>
          <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500; background: ${
            contract.status === 'active' ? 'rgba(122,140,110,.1); color: var(--sage)' :
            contract.status === 'ended' ? 'rgba(196,98,45,.1); color: var(--rust)' :
            'rgba(196,98,45,.1); color: var(--rust)'
          };">
            ${(contract.status || 'unknown').charAt(0).toUpperCase() + (contract.status || 'unknown').slice(1)}
          </span>
        </td>
        <td>${contract.notes ? contract.notes.substring(0, 30) + '...' : '—'}</td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button onclick="contractsManager.openEditModal('${contract.id}')" class="btn-icon" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button onclick="contractsManager.viewPayments('${contract.id}')" class="btn-icon" title="View Payments">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
            </button>
            ${contract.status === 'active' ? `<button onclick="contractsManager.endContract('${contract.id}')" class="btn-icon" title="End Contract" style="color: var(--rust);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  /**
   * Open create contract modal
   */
  openCreateModal() {
    this.currentContractId = null;
    const modal = document.getElementById('contractFormModal') || this.createFormModal();
    
    const form = document.getElementById('contractForm');
    if (form) {
      form.reset();
      document.getElementById('contractFormTitle').textContent = 'Create New Contract';
      document.getElementById('contractFormSubmitBtn').textContent = 'Create Contract';
    }

    modal.classList.add('open');
  },

  /**
   * Open edit contract modal
   */
  async openEditModal(contractId) {
    this.currentContractId = contractId;
    const contract = this.contracts.find(c => c.id === contractId);
    if (!contract) return;

    const modal = document.getElementById('contractFormModal') || this.createFormModal();
    
    const form = document.getElementById('contractForm');
    if (form) {
      document.getElementById('contractFormTitle').textContent = `Edit Contract - ${contract.tenant_name}`;
      document.getElementById('contractTenantInput').value = contract.tenant_id;
      document.getElementById('contractUnitInput').value = contract.unit_id;
      document.getElementById('contractStartDateInput').value = contract.start_date;
      document.getElementById('contractEndDateInput').value = contract.end_date || '';
      document.getElementById('contractRentInput').value = contract.monthly_rent_kes;
      document.getElementById('contractSecurityDepositInput').value = contract.security_deposit_kes || 0;
      document.getElementById('contractUtilitiesDepositInput').value = contract.utilities_deposit_kes || 0;
      document.getElementById('contractNotesInput').value = contract.notes || '';
      document.getElementById('contractFormSubmitBtn').textContent = 'Update Contract';
    }

    modal.classList.add('open');
  },

  /**
   * Save contract (create or update)
   */
  async saveContract(e) {
    e.preventDefault();

    const tenantId = Number(document.getElementById('contractTenantInput').value);
    const unitId = Number(document.getElementById('contractUnitInput').value);
    const startDate = document.getElementById('contractStartDateInput').value;
    const endDate = document.getElementById('contractEndDateInput').value || null;
    const rent = Number(document.getElementById('contractRentInput').value);
    const securityDeposit = Number(document.getElementById('contractSecurityDepositInput').value) || 0;
    const utilitiesDeposit = Number(document.getElementById('contractUtilitiesDepositInput').value) || 0;
    const notes = document.getElementById('contractNotesInput').value.trim();

    if (!tenantId || !unitId || !startDate || !rent) {
      alert('Tenant, Unit, Start Date, and Rent are required');
      return;
    }

    try {
      const url = this.currentContractId 
        ? `${API_BASE}/api/admin/contracts/${this.currentContractId}`
        : `${API_BASE}/api/admin/contracts`;
      
      const method = this.currentContractId ? 'PUT' : 'POST';

      // Get property_id from the selected unit
      const selectedUnit = this.units.find(u => u.id === unitId);
      const propertyId = selectedUnit?.property_id || null;
      
      if (!propertyId) {
        alert('Unable to determine property for selected unit');
        return;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          unit_id: unitId,
          property_id: propertyId,
          start_date: startDate,
          end_date: endDate,
          monthly_rent_kes: rent,
          security_deposit_kes: securityDeposit,
          utilities_deposit_kes: utilitiesDeposit,
          notes
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save contract');
      }

      alert(this.currentContractId ? 'Contract updated successfully' : 'Contract created successfully');
      this.closeModal();
      await this.loadContracts(this.filterTenantId);
    } catch (err) {
      console.error('Error saving contract:', err);
      alert(err.message);
    }
  },

  /**
   * End contract
   */
  async endContract(contractId) {
    const reason = prompt('Enter termination reason:');
    if (reason === null) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/contracts/${contractId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ termination_reason: reason })
      });

      if (!response.ok) {
        throw new Error('Failed to end contract');
      }

      alert('Contract ended successfully');
      await this.loadContracts(this.filterTenantId);
    } catch (err) {
      console.error('Error ending contract:', err);
      alert(err.message);
    }
  },

  /**
   * View payments for a contract in modal
   */
  async viewPayments(contractId) {
    try {
      // Find contract details
      const contract = this.contracts.find(c => c.id === contractId);
      if (!contract) {
        alert('Contract not found');
        return;
      }

      // Update modal title with contract info
      document.getElementById('contractPaymentsSubtitle').textContent = 
        `Tenant: ${contract.tenant_name || 'N/A'} • Unit: ${contract.unit_id || 'N/A'} • Rent: KES ${contract.monthly_rent_kes || 0}`;

      // Load and display payments in modal
      if (paymentsManager) {
        await paymentsManager.renderPaymentsInModal(contractId);
        document.getElementById('contractPaymentsModalOverlay').classList.add('open');
      }
    } catch (err) {
      console.error('Error viewing payments:', err);
      alert('Failed to load payments for this contract');
    }
  },

  /**
   * Create form modal element
   */
  createFormModal() {
    const tenantOptions = this.tenants.map(t => `
      <option value="${t.id}">${t.tenant_name} (${t.tenant_phone})</option>
    `).join('');

    const unitOptions = this.units.map(u => `
      <option value="${u.id}">${u.unit_id}</option>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'contractFormModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
          <h2 class="modal-title" id="contractFormTitle">Create New Contract</h2>
          <button class="modal-close" onclick="contractsManager.closeModal()">×</button>
        </div>
        <div class="modal-body">
          <form id="contractForm" onsubmit="contractsManager.saveContract(event)">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label for="contractTenantInput">Tenant <span style="color: var(--rust);">*</span></label>
                <select id="contractTenantInput" required>${tenantOptions}</select>
              </div>
              <div class="form-group">
                <label for="contractUnitInput">Unit <span style="color: var(--rust);">*</span></label>
                <select id="contractUnitInput" required>${unitOptions}</select>
              </div>
              <div class="form-group">
                <label for="contractStartDateInput">Start Date <span style="color: var(--rust);">*</span></label>
                <input type="date" id="contractStartDateInput" required>
              </div>
              <div class="form-group">
                <label for="contractEndDateInput">End Date</label>
                <input type="date" id="contractEndDateInput">
              </div>
              <div class="form-group">
                <label for="contractRentInput">Monthly Rent (KES) <span style="color: var(--rust);">*</span></label>
                <input type="number" id="contractRentInput" min="0" step="0.01" required>
              </div>
              <div class="form-group">
                <label for="contractSecurityDepositInput">Security Deposit (KES)</label>
                <input type="number" id="contractSecurityDepositInput" min="0" step="0.01">
              </div>
              <div class="form-group" style="grid-column: 1 / -1;">
                <label for="contractUtilitiesDepositInput">Utilities Deposit (KES)</label>
                <input type="number" id="contractUtilitiesDepositInput" min="0" step="0.01">
              </div>
            </div>
            <div class="form-group">
              <label for="contractNotesInput">Notes</label>
              <textarea id="contractNotesInput" placeholder="Contract notes" rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--border-strong); border-radius: var(--radius);"></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="contractsManager.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="contractFormSubmitBtn" form="contractForm">Create Contract</button>
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });
    document.body.appendChild(modal);
    return modal;
  },

  /**
   * Close modal
   */
  closeModal() {
    const modal = document.getElementById('contractFormModal');
    if (modal) {
      modal.classList.remove('open');
    }
  },

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const modal = document.getElementById('contractFormModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.className === 'modal-overlay') {
          this.closeModal();
        }
      });
    }
  }
};
