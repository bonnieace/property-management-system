/**
 * Access Control Manager
 * Manages building access tracking, allowed people roster, and entry/exit logs
 * Frontend-only MVP with mocked data (ready for biometric API integration later)
 */

const accessManager = {
  // State
  data: {
    people: [],
    logs: [],
    filters: {
      logRole: '',
      logStatus: '',
      logDateFrom: '',
      logDateTo: '',
      peopleRole: '',
      peopleStatus: 'Active',
      searchQuery: ''
    }
  },

  // Mocked data - people allowed access
  mockPeople: [
    {
      id: 'P001',
      name: 'John Mwangi',
      idNumber: 'ID-2024-001',
      role: 'Staff',
      status: 'Active',
      grantedDate: '2026-02-15',
      lastAccess: '2026-04-02 14:35:00',
      location: 'Main Building'
    },
    {
      id: 'P002',
      name: 'Mary Kipchoge',
      idNumber: 'ID-2024-002',
      role: 'Staff',
      status: 'Active',
      grantedDate: '2026-03-01',
      lastAccess: '2026-04-02 09:20:00',
      location: 'Front Gate'
    },
    {
      id: 'P003',
      name: 'Samuel Ochieng',
      idNumber: 'ID-2024-003',
      role: 'Maintenance',
      status: 'Active',
      grantedDate: '2026-01-20',
      lastAccess: '2026-04-01 16:45:00',
      location: 'Water Tank'
    },
    {
      id: 'P004',
      name: 'Grace Kariuki',
      idNumber: 'ID-2024-004',
      role: 'Guest',
      status: 'Revoked',
      grantedDate: '2026-03-15',
      lastAccess: '2026-03-28 18:00:00',
      location: 'Private Areas'
    },
    {
      id: 'P005',
      name: 'David Mutua',
      idNumber: 'ID-2024-005',
      role: 'Maintenance',
      status: 'Active',
      grantedDate: '2026-03-10',
      lastAccess: '2026-04-02 11:15:00',
      location: 'Main Building'
    }
  ],

  // Mocked data - access logs (entry/exit events)
  mockLogs: [
    { id: 'LOG001', personId: 'P001', personName: 'John Mwangi', role: 'Staff', action: 'Entry', timestamp: '2026-04-02 07:00:00', location: 'Front Gate', cardId: 'CARD-001' },
    { id: 'LOG002', personId: 'P001', personName: 'John Mwangi', role: 'Staff', action: 'Exit', timestamp: '2026-04-02 12:30:00', location: 'Front Gate', cardId: 'CARD-001' },
    { id: 'LOG003', personId: 'P002', personName: 'Mary Kipchoge', role: 'Staff', action: 'Entry', timestamp: '2026-04-02 08:15:00', location: 'Main Building', cardId: 'CARD-002' },
    { id: 'LOG004', personId: 'P005', personName: 'David Mutua', role: 'Maintenance', action: 'Entry', timestamp: '2026-04-02 08:45:00', location: 'Water Tank', cardId: 'CARD-005' },
    { id: 'LOG005', personId: 'P001', personName: 'John Mwangi', role: 'Staff', action: 'Entry', timestamp: '2026-04-02 13:00:00', location: 'Front Gate', cardId: 'CARD-001' },
    { id: 'LOG006', personId: 'P001', personName: 'John Mwangi', role: 'Staff', action: 'Exit', timestamp: '2026-04-02 14:35:00', location: 'Front Gate', cardId: 'CARD-001' },
    { id: 'LOG007', personId: 'P002', personName: 'Mary Kipchoge', role: 'Staff', action: 'Exit', timestamp: '2026-04-02 09:20:00', location: 'Main Building', cardId: 'CARD-002' },
    { id: 'LOG008', personId: 'P003', personName: 'Samuel Ochieng', role: 'Maintenance', action: 'Entry', timestamp: '2026-04-01 14:00:00', location: 'Water Tank', cardId: 'CARD-003' },
    { id: 'LOG009', personId: 'P003', personName: 'Samuel Ochieng', role: 'Maintenance', action: 'Exit', timestamp: '2026-04-01 16:45:00', location: 'Water Tank', cardId: 'CARD-003' },
    { id: 'LOG010', personId: 'P004', personName: 'Grace Kariuki', role: 'Guest', action: 'Entry', timestamp: '2026-03-28 15:30:00', location: 'Private Areas', cardId: 'CARD-004' },
    { id: 'LOG011', personId: 'P004', personName: 'Grace Kariuki', role: 'Guest', action: 'Exit', timestamp: '2026-03-28 18:00:00', location: 'Private Areas', cardId: 'CARD-004' },
    { id: 'LOG012', personId: 'P005', personName: 'David Mutua', role: 'Maintenance', action: 'Exit', timestamp: '2026-04-02 10:30:00', location: 'Water Tank', cardId: 'CARD-005' },
    { id: 'LOG013', personId: 'P005', personName: 'David Mutua', role: 'Maintenance', action: 'Entry', timestamp: '2026-04-02 11:00:00', location: 'Main Building', cardId: 'CARD-005' },
    { id: 'LOG014', personId: 'P005', personName: 'David Mutua', role: 'Maintenance', action: 'Exit', timestamp: '2026-04-02 11:15:00', location: 'Main Building', cardId: 'CARD-005' },
    { id: 'LOG015', personId: 'P003', personName: 'Samuel Ochieng', role: 'Maintenance', action: 'Entry', timestamp: '2026-03-31 09:30:00', location: 'Front Gate', cardId: 'CARD-003' },
    { id: 'LOG016', personId: 'P003', personName: 'Samuel Ochieng', role: 'Maintenance', action: 'Exit', timestamp: '2026-03-31 17:00:00', location: 'Front Gate', cardId: 'CARD-003' },
    { id: 'LOG017', personId: 'P001', personName: 'John Mwangi', role: 'Staff', action: 'Entry', timestamp: '2026-04-01 06:45:00', location: 'Front Gate', cardId: 'CARD-001' },
    { id: 'LOG018', personId: 'P001', personName: 'John Mwangi', role: 'Staff', action: 'Exit', timestamp: '2026-04-01 17:00:00', location: 'Front Gate', cardId: 'CARD-001' },
    { id: 'LOG019', personId: 'P002', personName: 'Mary Kipchoge', role: 'Staff', action: 'Entry', timestamp: '2026-04-01 08:00:00', location: 'Main Building', cardId: 'CARD-002' },
    { id: 'LOG020', personId: 'P002', personName: 'Mary Kipchoge', role: 'Staff', action: 'Exit', timestamp: '2026-04-01 17:30:00', location: 'Main Building', cardId: 'CARD-002' }
  ],

  /**
   * Initialize access manager
   */
  init() {
    this.data.people = JSON.parse(JSON.stringify(this.mockPeople)); // Deep copy
    this.data.logs = JSON.parse(JSON.stringify(this.mockLogs)); // Deep copy
    this.render();
  },

  /**
   * Main render function - handles all three tabs
   */
  render() {
    // Get active tab from UI
    const accessTabs = document.querySelectorAll('.access-tabs button');
    let activeTab = 'logs';
    accessTabs.forEach(tab => {
      if (tab.classList.contains('active')) {
        activeTab = tab.dataset.tab;
      }
    });

    // Render appropriate view
    switch (activeTab) {
      case 'logs':
        this.renderLogs();
        break;
      case 'people':
        this.renderPeople();
        break;
      case 'add':
        this.renderAddForm();
        break;
    }
  },

  /**
   * Render access logs view
   */
  renderLogs() {
    const container = document.getElementById('accessLogsContainer');
    if (!container) return;

    // Filter logs based on current filters
    let filteredLogs = this.data.logs.slice();

    if (this.data.filters.logRole) {
      filteredLogs = filteredLogs.filter(log => log.role === this.data.filters.logRole);
    }

    if (this.data.filters.logDateFrom) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= this.data.filters.logDateFrom);
    }

    if (this.data.filters.logDateTo) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= this.data.filters.logDateTo);
    }

    // Sort by timestamp descending
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const tbody = document.getElementById('accessLogsTableBody');
    if (!tbody) return;

    if (filteredLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px;">No access logs found</td></tr>';
      return;
    }

    tbody.innerHTML = filteredLogs.map(log => {
      const actionBadge = log.action === 'Entry' 
        ? `<span class="badge" style="background: rgba(34,197,94,.2); color: #16a34a;">Entry</span>`
        : `<span class="badge" style="background: rgba(196,98,45,.2); color: #C4622D;">Exit</span>`;

      const roleBadge = this.getRoleBadge(log.role);

      return `
        <tr>
          <td>${log.timestamp}</td>
          <td>${log.personName}</td>
          <td>${roleBadge}</td>
          <td>${actionBadge}</td>
          <td>${log.location}</td>
          <td><span style="font-size: .75rem; color: var(--text-muted);">${log.cardId}</span></td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render allowed people view
   */
  renderPeople() {
    const container = document.getElementById('allowedPeopleContainer');
    if (!container) return;

    // Filter people based on current filters
    let filteredPeople = this.data.people.slice();

    if (this.data.filters.peopleRole) {
      filteredPeople = filteredPeople.filter(p => p.role === this.data.filters.peopleRole);
    }

    if (this.data.filters.peopleStatus) {
      filteredPeople = filteredPeople.filter(p => p.status === this.data.filters.peopleStatus);
    }

    if (this.data.filters.searchQuery) {
      const query = this.data.filters.searchQuery.toLowerCase();
      filteredPeople = filteredPeople.filter(p =>
        p.name.toLowerCase().includes(query) || p.idNumber.toLowerCase().includes(query)
      );
    }

    // Sort by name
    filteredPeople.sort((a, b) => a.name.localeCompare(b.name));

    const tbody = document.getElementById('allowedPeopleTableBody');
    if (!tbody) return;

    if (filteredPeople.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 32px;">No people found</td></tr>';
      return;
    }

    tbody.innerHTML = filteredPeople.map(person => {
      const statusBadge = person.status === 'Active'
        ? `<span class="badge badge-confirmed">Active</span>`
        : `<span class="badge badge-cancelled">Revoked</span>`;

      const roleBadge = this.getRoleBadge(person.role);

      const actionBtn = person.status === 'Active'
        ? `<button class="btn btn-sm btn-rust" onclick="accessManager.showRevokeModal('${person.id}', '${escapeHtml(person.name)}')">Revoke</button>`
        : `<button class="btn btn-sm" onclick="accessManager.reactivatePerson('${person.id}')" style="background: #16a34a; color: white; border: none;">Reactivate</button>`;

      return `
        <tr>
          <td>${escapeHtml(person.name)}</td>
          <td>${person.idNumber}</td>
          <td>${roleBadge}</td>
          <td>${person.location}</td>
          <td>${person.grantedDate}</td>
          <td>${person.lastAccess || '—'}</td>
          <td>${statusBadge}</td>
          <td>${actionBtn}</td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Render add access form
   */
  renderAddForm() {
    const container = document.getElementById('addAccessFormContainer');
    if (!container) return;

    // Form is static HTML, just ensure it's visible
    const form = document.getElementById('addAccessForm');
    if (form) {
      form.style.display = 'block';
    }
  },

  /**
   * Get role badge HTML
   */
  getRoleBadge(role) {
    const badges = {
      'Staff': '<span class="badge" style="background: rgba(59,130,246,.2); color: #3B82F6;">Staff</span>',
      'Guest': '<span class="badge" style="background: rgba(196,168,130,.2); color: var(--gold);">Guest</span>',
      'Maintenance': '<span class="badge" style="background: rgba(122,140,110,.2); color: var(--sage);">Maintenance</span>'
    };
    return badges[role] || role;
  },

  /**
   * Add new person to access list
   */
  addPerson(formData) {
    // Validate inputs
    if (!formData.name || !formData.idNumber || !formData.role || !formData.location) {
      this.showToast('Please fill in all fields', 'error');
      return false;
    }

    // Check for duplicate ID
    if (this.data.people.some(p => p.idNumber === formData.idNumber)) {
      this.showToast('Person with this ID already exists', 'error');
      return false;
    }

    // Create new person
    const newPerson = {
      id: 'P' + String(Math.floor(Math.random() * 10000)).padStart(3, '0'),
      name: formData.name,
      idNumber: formData.idNumber,
      role: formData.role,
      status: 'Active',
      grantedDate: new Date().toISOString().split('T')[0],
      lastAccess: null,
      location: formData.location
    };

    this.data.people.push(newPerson);
    this.showToast(`Access granted to ${escapeHtml(formData.name)}`, 'success');

    // Clear form and re-render
    document.getElementById('addAccessForm').reset();
    this.render();

    // TODO: POST to /api/admin/access-control/people

    return true;
  },

  /**
   * Show revoke access modal
   */
  showRevokeModal(personId, personName) {
    const person = this.data.people.find(p => p.id === personId);
    if (!person) return;

    document.getElementById('revokePersonId').value = personId;
    document.getElementById('revokePersonName').textContent = personName;
    document.getElementById('revokeReason').value = '';
    document.getElementById('revokeModalOverlay').classList.add('show');
  },

  /**
   * Close revoke modal
   */
  closeRevokeModal() {
    document.getElementById('revokeModalOverlay').classList.remove('show');
  },

  /**
   * Revoke access for a person
   */
  revokePerson() {
    const personId = document.getElementById('revokePersonId').value;
    const reason = document.getElementById('revokeReason').value;

    if (!reason.trim()) {
      this.showToast('Please provide a revocation reason', 'error');
      return;
    }

    const person = this.data.people.find(p => p.id === personId);
    if (!person) return;

    person.status = 'Revoked';
    this.showToast(`Access revoked for ${escapeHtml(person.name)}`, 'success');

    // TODO: PUT to /api/admin/access-control/people/:id (status, reason)

    this.closeRevokeModal();
    this.render();
  },

  /**
   * Reactivate revoked person
   */
  reactivatePerson(personId) {
    const person = this.data.people.find(p => p.id === personId);
    if (!person) return;

    if (confirm(`Are you sure you want to reactivate access for ${escapeHtml(person.name)}?`)) {
      person.status = 'Active';
      this.showToast(`Access reactivated for ${escapeHtml(person.name)}`, 'success');

      // TODO: PUT to /api/admin/access-control/people/:id (status: Active)

      this.render();
    }
  },

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    // Update button states
    document.querySelectorAll('.access-tabs button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Hide/show containers
    document.getElementById('accessLogsContainer').style.display = tabName === 'logs' ? 'block' : 'none';
    document.getElementById('allowedPeopleContainer').style.display = tabName === 'people' ? 'block' : 'none';
    document.getElementById('addAccessFormContainer').style.display = tabName === 'add' ? 'block' : 'none';

    this.render();
  },

  /**
   * Update filters and re-render
   */
  updateLogFilters() {
    this.data.filters.logRole = document.getElementById('logRoleFilter')?.value || '';
    this.data.filters.logDateFrom = document.getElementById('logDateFromFilter')?.value || '';
    this.data.filters.logDateTo = document.getElementById('logDateToFilter')?.value || '';
    this.render();
  },

  /**
   * Update people filters
   */
  updatePeopleFilters() {
    this.data.filters.peopleRole = document.getElementById('peopleRoleFilter')?.value || '';
    this.data.filters.peopleStatus = document.getElementById('peopleStatusFilter')?.value || 'Active';
    this.data.filters.searchQuery = document.getElementById('peopleSearchInput')?.value || '';
    this.render();
  },

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    document.getElementById('toastIcon').textContent = icon;
    document.getElementById('toastMsg').textContent = message;

    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('accessControlPage')) {
    accessManager.init();
  }
});
