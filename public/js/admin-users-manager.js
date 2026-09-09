/**
 * ADMIN USERS MANAGER
 * Handles admin user CRUD operations and property assignments
 */

const adminUsersManager = {
  admins: [],
  allProperties: [],
  currentAdminId: null,

  /**
   * Initialize admin users manager
   */
  async init() {


    await this.loadProperties();
    await this.loadAdmins();
    this.attachEventListeners();

  },

  /**
   * Load all properties for assignments
   */
  async loadProperties() {
    try {
      const response = await fetch(`${API_BASE}/api/admin/properties`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      
      if (response.ok) {
        const result = await response.json();
        this.allProperties = result.data || [];
      }
    } catch (err) {
      console.error('[AdminUsersManager] Error loading properties:', err);
    }
  },

  /**
   * Load all admin users
   */
  async loadAdmins() {
    try {

      const response = await fetch(`${API_BASE}/api/admin/admins`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) {
        console.error('👥 [AdminUsersManager.loadAdmins] Failed to load admins:', response.status);
        return;
      }

      const result = await response.json();

      this.admins = result.data || [];
      this.renderAdminTable();
    } catch (err) {
      console.error('👥 [AdminUsersManager.loadAdmins] Error:', err);
    }
  },

  /**
   * Render admin users table
   */
  renderAdminTable() {

    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) {
      console.warn('❌ [AdminUsersManager.renderAdminTable] adminUsersTableBody element not found!');
      return;
    }

    if (this.admins.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 32px;">No admins found</td></tr>';
      return;
    }

    tbody.innerHTML = this.admins.map(admin => `
      <tr>
        <td>${admin.id}</td>
        <td><strong>${escapeHtml(admin.username)}</strong></td>
        <td>${escapeHtml(admin.name)}</td>
        <td>${escapeHtml(admin.email)}</td>
        <td>${admin.role === 'full_admin' ? 'Full Access' : 'Property Admin'}</td>
        <td>
          <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500; background: ${admin.status === 'active' ? 'rgba(122,140,110,.1); color: var(--sage)' : 'rgba(196,98,45,.1); color: var(--rust)'};">
            ${admin.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          ${admin.role === 'property_admin' ? (admin.properties && admin.properties.length > 0 ? admin.properties.map(p => escapeHtml(p.name)).join(', ') : '—') : 'Full Access'}
        </td>
        <td>${admin.last_login ? new Date(admin.last_login).toLocaleDateString() : '—'}</td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button onclick="adminUsersManager.openEditModal(${admin.id})" class="btn-icon" title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            ${admin.role === 'property_admin' ? `<button onclick="adminUsersManager.openPropertyAssignModal(${admin.id})" class="btn-icon" title="Assign Properties">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>` : ''}
            ${state.user.id !== admin.id ? `<button onclick="adminUsersManager.deleteAdmin(${admin.id})" class="btn-icon" title="Delete" style="color: var(--rust);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
            </button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  /**
   * Open create admin modal
   */
  openCreateModal() {
    this.currentAdminId = null;
    const modal = document.getElementById('adminFormModal') || this.createFormModal();
    
    const form = document.getElementById('adminForm');
    if (form) {
      form.reset();
      document.getElementById('adminFormTitle').textContent = 'Create New Admin';
      document.getElementById('adminPasswordGroup').style.display = 'block';
      document.getElementById('adminPasswordInput').required = true;
      document.getElementById('adminFormSubmitBtn').textContent = 'Create Admin';
    }

    modal.classList.add('open');
  },

  /**
   * Open edit admin modal
   */
  async openEditModal(adminId) {
    this.currentAdminId = adminId;
    const admin = this.admins.find(a => a.id === adminId);
    if (!admin) return;

    const modal = document.getElementById('adminFormModal') || this.createFormModal();
    
    const form = document.getElementById('adminForm');
    if (form) {
      document.getElementById('adminFormTitle').textContent = `Edit ${escapeHtml(admin.name)}`;
      document.getElementById('adminUsernameInput').value = admin.username;
      document.getElementById('adminNameInput').value = admin.name;
      document.getElementById('adminEmailInput').value = admin.email;
      document.getElementById('adminRoleSelect').value = admin.role;
      document.getElementById('adminStatusSelect').value = admin.status;
      document.getElementById('adminPasswordInput').value = '';
      document.getElementById('adminPasswordGroup').style.display = 'block';
      document.getElementById('adminPasswordInput').required = false;
      document.getElementById('adminPasswordHelper').textContent = 'Leave blank to keep current password';
      document.getElementById('adminFormSubmitBtn').textContent = 'Update Admin';
    }

    modal.classList.add('open');
  },

  /**
   * Create form modal HTML
   */
  createFormModal() {
    const html = `
      <div class="modal-overlay" id="adminFormModal" onclick="if(event.target===this) adminUsersManager.closeFormModal()">
        <div class="modal" style="max-width: 500px;">
          <div class="modal-header">
            <h2 class="modal-title" id="adminFormTitle">Create New Admin</h2>
            <button class="modal-close" onclick="adminUsersManager.closeFormModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form id="adminForm" onsubmit="event.preventDefault(); adminUsersManager.handleAdminSubmit()">
              <div class="form-group">
                <label>Username *</label>
                <input type="text" id="adminUsernameInput" placeholder="3-20 characters, alphanumeric + underscore" required ${this.currentAdminId ? 'disabled' : ''}>
                <small style="color: var(--text-muted);">Cannot be changed after creation</small>
              </div>

              <div class="form-group">
                <label>Full Name *</label>
                <input type="text" id="adminNameInput" placeholder="e.g., John Mwangi" required>
              </div>

              <div class="form-group">
                <label>Email *</label>
                <input type="email" id="adminEmailInput" placeholder="admin@example.com" required>
              </div>

              <div class="form-group">
                <label>Role *</label>
                <select id="adminRoleSelect" required>
                  <option value="">Select Role</option>
                  <option value="property_admin">Property Admin</option>
                  <option value="full_admin">Full Access Admin</option>
                </select>
              </div>

              <div class="form-group">
                <label>Status *</label>
                <select id="adminStatusSelect" required>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div class="form-group" id="adminPasswordGroup">
                <label>Password ${!this.currentAdminId ? '*' : ''}</label>
                <input type="password" id="adminPasswordInput" placeholder="Minimum 12 characters" ${!this.currentAdminId ? 'required' : ''}>
                <small style="color: var(--text-muted);" id="adminPasswordHelper"></small>
              </div>

              <div style="display: flex; gap: 12px; margin-top: 24px;">
                <button type="submit" class="btn btn-primary" id="adminFormSubmitBtn">Create Admin</button>
                <button type="button" class="btn btn-secondary" onclick="adminUsersManager.closeFormModal()">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);

    return document.getElementById('adminFormModal');
  },

  /**
   * Handle admin form submission
   */
  async handleAdminSubmit() {
    const username = document.getElementById('adminUsernameInput').value;
    const name = document.getElementById('adminNameInput').value;
    const email = document.getElementById('adminEmailInput').value;
    const password = document.getElementById('adminPasswordInput').value;
    const role = document.getElementById('adminRoleSelect').value;
    const status = document.getElementById('adminStatusSelect').value;

    // Validation
    if (!username || !name || !email || !role || !status) {
      alert('Please fill all required fields');
      return;
    }

    if (!this.currentAdminId && !password) {
      alert('Password is required for new admins');
      return;
    }

    if (password && password.length < 12) {
      alert('Password must be at least 12 characters');
      return;
    }

    try {
      let response, endpoint, method;

      if (this.currentAdminId) {
        // Update
        endpoint = `${API_BASE}/api/admin/admins/${this.currentAdminId}`;
        method = 'PUT';
        response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({
            name,
            email,
            status,
            ...(password && { password })
          })
        });
      } else {
        // Create
        endpoint = `${API_BASE}/api/admin/admins`;
        method = 'POST';
        response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({
            username,
            name,
            email,
            password,
            role
          })
        });
      }

      if (!response.ok) {
        const error = await response.json();
        alert('Error: ' + (error.error || 'Failed to save admin'));
        return;
      }

      alert(this.currentAdminId ? 'Admin updated successfully' : 'Admin created successfully');
      this.closeFormModal();
      await this.loadAdmins();
    } catch (err) {
      console.error('[AdminUsersManager] Error saving admin:', err);
      alert('Error: ' + err.message);
    }
  },

  /**
   * Close form modal
   */
  closeFormModal() {
    const modal = document.getElementById('adminFormModal');
    if (modal) modal.classList.remove('open');
  },

  /**
   * Open property assignment modal
   */
  openPropertyAssignModal(adminId) {
    const admin = this.admins.find(a => a.id === adminId);
    if (!admin || admin.role === 'full_admin') return;

    const assignedPropertyIds = (admin.properties || []).map(p => p.id);

    const html = `
      <div class="modal-overlay" id="propertyAssignModal" onclick="if(event.target===this) adminUsersManager.closePropertyAssignModal()">
        <div class="modal" style="max-width: 500px;">
          <div class="modal-header">
            <h2 class="modal-title">Assign Properties to ${escapeHtml(admin.name)}</h2>
            <button class="modal-close" onclick="adminUsersManager.closePropertyAssignModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div style="display: flex; flex-direction: column; gap: 12px; max-height: 400px; overflow-y: auto;">
              ${this.allProperties.map(prop => `
                <label style="display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer;">
                  <input type="checkbox" data-property-id="${prop.id}" ${assignedPropertyIds.includes(prop.id) ? 'checked' : ''}>
                  <span>${escapeHtml(prop.name)}</span><select aria-label="Access for ${escapeHtml(prop.name)}" data-property-role="${prop.id}"><option value="manager">Manager</option><option value="owner" ${admin.properties?.some(p=>p.id===prop.id&&p.is_owner)?'selected':''}>Owner</option></select>
                </label>
              `).join('')}
            </div>

            <div style="display: flex; gap: 12px; margin-top: 24px;">
              <button onclick="adminUsersManager.handlePropertyAssign(${adminId})" class="btn btn-primary">Save Assignments</button>
              <button onclick="adminUsersManager.closePropertyAssignModal()" class="btn btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);

    document.getElementById('propertyAssignModal').classList.add('open');
  },

  /**
   * Handle property assignment
   */
  async handlePropertyAssign(adminId) {
    const checkboxes = document.querySelectorAll('#propertyAssignModal input[type="checkbox"]');
    const selectedPropertyIds = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => parseInt(cb.dataset.propertyId));

    const admin = this.admins.find(a => a.id === adminId);
    const currentPropertyIds = (admin.properties || []).map(p => p.id);

    try {
      // Remove unassigned properties
      for (const propId of currentPropertyIds) {
        if (!selectedPropertyIds.includes(propId)) {
          const response = await fetch(`${API_BASE}/api/admin/admins/${adminId}/properties/${propId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
          });
          if (!response.ok) throw new Error((await response.json()).error || 'Failed to unassign property');
        }
      }

      // Add new properties
      for (const propId of selectedPropertyIds) {
        {
          const propertyRecord = this.allProperties.find(p => p.id === propId);
          const response = await fetch(`${API_BASE}/api/admin/admins/${adminId}/properties`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ property_id: propertyRecord.id, is_owner: document.querySelector(`[data-property-role="${propId}"]`).value === 'owner' })
          });
          if (!response.ok) throw new Error((await response.json()).error || 'Failed to assign property');
        }
      }

      alert('Properties assigned successfully');
      this.closePropertyAssignModal();
      await this.loadAdmins();
    } catch (err) {
      console.error('[AdminUsersManager] Error assigning properties:', err);
      alert('Error: ' + err.message);
    }
  },

  /**
   * Close property assignment modal
   */
  closePropertyAssignModal() {
    const modal = document.getElementById('propertyAssignModal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 300);
    }
  },

  /**
   * Delete admin (soft delete)
   */
  async deleteAdmin(adminId) {
    const admin = this.admins.find(a => a.id === adminId);
    if (!admin) return;

    if (!confirm(`Are you sure you want to deactivate ${escapeHtml(admin.name)}? They will no longer be able to log in.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/admin/admins/${adminId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });

      if (!response.ok) {
        const error = await response.json();
        alert('Error: ' + (error.error || 'Failed to delete admin'));
        return;
      }

      alert('Admin deactivated successfully');
      await this.loadAdmins();
    } catch (err) {
      console.error('[AdminUsersManager] Error deleting admin:', err);
      alert('Error: ' + err.message);
    }
  },

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Any event listeners can be attached here
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {

  const adminUsersPage = document.getElementById('adminUsersPage');
  if (adminUsersPage) {

    adminUsersManager.init();
  } else {
    console.warn('❌ [AdminUsersManager] adminUsersPage element not found!');
  }
});
