/**
 * TENANTS MANAGER
 * Handles rental tenant CRUD operations and management
 */

const tenantsManager = {
  tenants: [],
  currentTenantId: null,

  /**
   * Initialize tenants manager
   */
  async init() {
    console.log('👤 [TenantsManager.init] Initializing tenants manager');
    console.log('👤 [TenantsManager.init] Current state:', { token: state.token ? '✓ SET' : '✗ MISSING', API_BASE });
    await this.loadTenants();
    this.attachEventListeners();
    console.log('👤 [TenantsManager.init] Initialization complete');
  },

  /**
   * Load all tenants
   */
  async loadTenants() {
    try {
      console.log('👤 [TenantsManager.loadTenants] Fetching tenants from API...');
      
      // Check if token exists
      if (!state.token) {
        console.error('👤 [TenantsManager.loadTenants] ❌ NO AUTH TOKEN - User not logged in!');
        const tbody = document.getElementById('rentalTenantsTableBody');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--rust);">❌ Not logged in. Please login first.</td></tr>';
        }
        return;
      }

      console.log(`👤 [TenantsManager.loadTenants] Auth token present (${state.token.substring(0, 20)}...)`);
      console.log(`👤 [TenantsManager.loadTenants] Calling: ${API_BASE}/api/admin/tenants`);

      const response = await fetch(`${API_BASE}/api/admin/tenants`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      console.log(`👤 [TenantsManager.loadTenants] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('👤 [TenantsManager.loadTenants] ❌ API Error:', { status: response.status, body: errorBody });
        const tbody = document.getElementById('rentalTenantsTableBody');
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--rust);">❌ Error loading tenants (${response.status}). Check console for details.</td></tr>`;
        }
        return;
      }

      const result = await response.json();
      console.log(`👤 [TenantsManager.loadTenants] ✓ Loaded ${result.data?.length || 0} tenants`);
      this.tenants = result.data || [];
      this.renderTenantsTable();
    } catch (err) {
      console.error('👤 [TenantsManager.loadTenants] ❌ Exception:', err);
      const tbody = document.getElementById('rentalTenantsTableBody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--rust);">❌ Error: ${err.message}</td></tr>`;
      }
    }
  },

  /**
   * Render tenants table
   */
  renderTenantsTable() {
    const tbody = document.getElementById('rentalTenantsTableBody');
    if (!tbody) {
      console.error('❌ [TenantsManager.renderTenantsTable] tenantsTableBody element not found!');
      console.log('Available elements:', {
        ids: Array.from(document.querySelectorAll('[id*="tenant"]')).map(el => el.id)
      });
      return;
    }

    console.log(`👤 [TenantsManager.renderTenantsTable] Rendering ${this.tenants.length} tenants`);

    if (this.tenants.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px;">No tenants found</td></tr>';
      return;
    }

    tbody.innerHTML = this.tenants.map(tenant => `
      <tr>
        <td>${tenant.id || '—'}</td>
        <td><strong>${tenant.tenant_name || 'N/A'}</strong></td>
        <td>${tenant.tenant_phone || '—'}</td>
        <td>${tenant.tenant_email || '—'}</td>
        <td>${tenant.notes ? tenant.notes.substring(0, 30) + '...' : '—'}</td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button onclick="tenantsManager.openEditModal(${tenant.id})" class="btn-icon" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button onclick="tenantsManager.viewTenantContracts(${tenant.id})" class="btn-icon" title="View Contracts">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </button>
            <button onclick="tenantsManager.deleteTenant(${tenant.id})" class="btn-icon" title="Delete" style="color: var(--rust);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  /**
   * Open create tenant modal
   */
  openCreateModal() {
    this.currentTenantId = null;
    const modal = document.getElementById('tenantFormModal') || this.createFormModal();
    
    const form = document.getElementById('tenantForm');
    if (form) {
      form.reset();
      document.getElementById('tenantFormTitle').textContent = 'Create New Tenant';
      document.getElementById('tenantFormSubmitBtn').textContent = 'Create Tenant';
    }

    modal.classList.add('open');
  },

  /**
   * Open edit tenant modal
   */
  async openEditModal(tenantId) {
    this.currentTenantId = tenantId;
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    const modal = document.getElementById('tenantFormModal') || this.createFormModal();
    
    const form = document.getElementById('tenantForm');
    if (form) {
      document.getElementById('tenantFormTitle').textContent = `Edit ${tenant.tenant_name}`;
      document.getElementById('tenantNameInput').value = tenant.tenant_name || '';
      document.getElementById('tenantPhoneInput').value = tenant.tenant_phone;
      document.getElementById('tenantEmailInput').value = tenant.tenant_email || '';
      document.getElementById('tenantNotesInput').value = tenant.notes || '';
      document.getElementById('tenantFormSubmitBtn').textContent = 'Update Tenant';
    }

    modal.classList.add('open');
  },

  /**
   * Save tenant (create or update)
   */
  async saveTenant(e) {
    e.preventDefault();

    const name = document.getElementById('tenantNameInput').value.trim();
    const phone = document.getElementById('tenantPhoneInput').value.trim();
    const email = document.getElementById('tenantEmailInput').value.trim();
    const notes = document.getElementById('tenantNotesInput').value.trim();

    if (!name || !phone) {
      alert('Name and phone are required');
      return;
    }

    try {
      const url = this.currentTenantId 
        ? `${API_BASE}/api/admin/tenants/${this.currentTenantId}`
        : `${API_BASE}/api/admin/tenants`;
      
      const method = this.currentTenantId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          tenant_name: name,
          tenant_phone: phone,
          tenant_email: email,
          tenant_notes: notes
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save tenant');
      }

      alert(this.currentTenantId ? 'Tenant updated successfully' : 'Tenant created successfully');
      this.closeModal();
      await this.loadTenants();
    } catch (err) {
      console.error('Error saving tenant:', err);
      alert(err.message);
    }
  },

  /**
   * Delete tenant
   */
  async deleteTenant(tenantId) {
    if (!confirm('Are you sure you want to delete this tenant?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to delete tenant');
      }

      alert('Tenant deleted successfully');
      await this.loadTenants();
    } catch (err) {
      console.error('Error deleting tenant:', err);
      alert(err.message);
    }
  },

  /**
   * View contracts for a tenant
   */
  async viewTenantContracts(tenantId) {
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return;

    // Switch to contracts page and filter by tenant
    if (contractsManager) {
      await contractsManager.loadContracts(tenantId);
      showPage('contracts');
      localStorage.setItem('adminLastPage', 'contracts');
    }
  },

  /**
   * Create form modal element
   */
  createFormModal() {
    const modal = document.createElement('div');
    modal.id = 'tenantFormModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="tenantFormTitle">Create New Tenant</h2>
          <button class="modal-close" onclick="tenantsManager.closeModal()">×</button>
        </div>
        <div class="modal-body">
          <form id="tenantForm" onsubmit="tenantsManager.saveTenant(event)">
            <div class="form-group">
              <label for="tenantNameInput">Tenant Name <span style="color: var(--rust);">*</span></label>
              <input type="text" id="tenantNameInput" placeholder="Full name" required>
            </div>
            <div class="form-group">
              <label for="tenantPhoneInput">Phone Number <span style="color: var(--rust);">*</span></label>
              <input type="tel" id="tenantPhoneInput" placeholder="+254712345678" required>
            </div>
            <div class="form-group">
              <label for="tenantEmailInput">Email</label>
              <input type="email" id="tenantEmailInput" placeholder="tenant@example.com">
            </div>
            <div class="form-group">
              <label for="tenantNotesInput">Notes</label>
              <textarea id="tenantNotesInput" placeholder="Additional notes" rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--border-strong); border-radius: var(--radius);"></textarea>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="tenantsManager.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="tenantFormSubmitBtn" form="tenantForm">Create Tenant</button>
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
    const modal = document.getElementById('tenantFormModal');
    if (modal) {
      modal.classList.remove('open');
    }
  },

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const modal = document.getElementById('tenantFormModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.className === 'modal-overlay') {
          this.closeModal();
        }
      });
    }
  }
};
