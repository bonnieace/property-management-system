/**
 * UNITS MANAGEMENT MODULE
 * Handles unit/room management CRUD operations for the admin dashboard
 */

const unitsState = {
  unitsList: [],
  propertiesList: [],
  filters: {
    property_id: '',  // Filter by property
    status: '',       // Filter by status
    type: ''          // Filter by unit type
  },
  selectedUnit: null,
  isModalOpen: false
};

// ─────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────

async function initUnitsManager() {
  // Set up modal close handler
  const modal = document.getElementById('unitsModalOverlay');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'unitsModalOverlay') {
        closeUnitsModal();
      }
    });
  }

  console.log('[Units Manager] Initializing...');
  
  // Load properties first
  try {
    console.log('[Units Manager] Loading properties for dropdown...');
    await loadPropertiesForDropdown();
    console.log('[Units Manager] Properties loaded, populating dropdown...');
    populatePropertyDropdown();
    console.log('[Units Manager] Dropdown populated');
  } catch (err) {
    console.error('[Units Manager] Failed to load properties:', err);
  }
  
  // Load units (independent flow)
  try {
    console.log('[Units Manager] Loading units...');
    await loadUnits();
    console.log('[Units Manager] Units loaded');
  } catch (err) {
    console.error('[Units Manager] Failed to load units:', err);
  }
  
  console.log('[Units Manager] Initialization complete');
}

// ─────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────

async function loadPropertiesForDropdown() {
  try {
    console.log('[Load Properties] Fetching from:', `${API_BASE}/api/admin/properties?status=active`);
    const response = await fetch(`${API_BASE}/api/admin/properties?status=active`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    
    console.log('[Load Properties] Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('[Load Properties] Result:', result);
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to fetch properties');
    }
    
    unitsState.propertiesList = result.data || [];
    console.log('[Load Properties] Loaded', unitsState.propertiesList.length, 'properties');
  } catch (err) {
    console.error('[Load Properties For Dropdown]', err);
    showToast('Failed to load properties: ' + err.message, '⚠️');
  }
}

async function loadUnits() {
  try {
    const { property_id, status, type } = unitsState.filters;
    let url = `${API_BASE}/api/admin/units`;
    const params = new URLSearchParams();
    
    if (property_id) params.append('property_id', property_id);
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    
    if (params.toString()) {
      url += '?' + params.toString();
    }
    
    console.log('[Load Units] Fetching from:', url);
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    
    console.log('[Load Units] Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('[Load Units] Result:', result);
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to fetch units');
    }
    
    unitsState.unitsList = result.data || [];
    console.log('[Load Units] Loaded', unitsState.unitsList.length, 'units');
    renderUnitsTable();
  } catch (err) {
    console.error('[Load Units]', err);
    showToast('Failed to load units: ' + err.message, '⚠️');
    // Still render table even on error to clear loading state
    unitsState.unitsList = [];
    renderUnitsTable();
  }
}

// ─────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────

function renderUnitsTable() {
  const tableBody = document.getElementById('unitsTableBody');
  
  if (!tableBody) {
    console.error('[Render Units] Table body not found!');
    return;
  }
  
  console.log('[Render Units] Rendering', unitsState.unitsList.length, 'units');
  
  if (unitsState.unitsList.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">
          No units found
        </td>
      </tr>
    `;
    console.log('[Render Units] Rendered empty state');
    return;
  }

  tableBody.innerHTML = unitsState.unitsList.map(unit => {
    const property = unitsState.propertiesList.find(p => p.property_id === unit.property_id);
    const propertyName = property ? property.name : unit.property_id;
    
    return `
      <tr>
        <td><strong>${escapeHtml(unit.unit_id)}</strong></td>
        <td>${escapeHtml(unit.name)}</td>
        <td>${escapeHtml(propertyName)}</td>
        <td><span style="background: var(--earth); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">${unit.type}</span></td>
        <td>${unit.bedrooms}b/${unit.bathrooms}ba</td>
        <td>Ksh ${(unit.base_price_kes || 0).toLocaleString()}</td>
        <td><span class="badge badge-${unit.status}">${unit.status}</span></td>
        <td>
          <a href="#" onclick="openEditUnitModal(${unit.id}); return false;" style="color: var(--earth); text-decoration: none; margin-right: 8px; font-size: 0.9em;">Edit</a>
          <a href="#" onclick="deleteUnit(${unit.id}); return false;" style="color: var(--rust); text-decoration: none; font-size: 0.9em;">Delete</a>
        </td>
      </tr>
    `;
  }).join('');
  
  console.log('[Render Units] Table rendered successfully');
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ─────────────────────────────────────────────────────
// FILTER & RESET
// ─────────────────────────────────────────────────────

async function filterUnits() {
  unitsState.filters.property_id = document.getElementById('unitPropertyFilter').value;
  unitsState.filters.status = document.getElementById('unitStatusFilter').value;
  unitsState.filters.type = document.getElementById('unitTypeFilter').value;
  await loadUnits();
}

async function resetUnitFilters() {
  unitsState.filters.property_id = '';
  unitsState.filters.status = '';
  unitsState.filters.type = '';
  document.getElementById('unitPropertyFilter').value = '';
  document.getElementById('unitStatusFilter').value = '';
  document.getElementById('unitTypeFilter').value = '';
  await loadUnits();
}

// ─────────────────────────────────────────────────────
// MODAL FUNCTIONS
// ─────────────────────────────────────────────────────

function openAddUnitModal() {
  unitsState.selectedUnit = null;
  document.getElementById('unitForm').reset();
  document.getElementById('unitId').value = '';
  document.getElementById('unitFormTitle').textContent = 'Add New Unit';
  document.getElementById('unitIdField').style.display = 'block';
  document.getElementById('unitIdField').querySelector('input').readOnly = false;
  document.getElementById('deleteUnitBtn').style.display = 'none';
  document.getElementById('unitFormError').classList.remove('show');
  
  // Populate property dropdown
  populatePropertyDropdown();
  
  // Show conditional fields
  document.getElementById('unitTypeField').value = 'bnb';
  updateConditionalFields();
  
  document.getElementById('unitsModalOverlay').classList.add('open');
  unitsState.isModalOpen = true;
}

async function openEditUnitModal(unitId) {
  try {
    // Fetch unit details
    const response = await fetch(`${API_BASE}/api/admin/units?id=${unitId}`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    const result = await response.json();
    const unit = result.data?.find(u => u.id === unitId);
    
    if (!unit) {
      showToast('Unit not found', '❌');
      return;
    }

    unitsState.selectedUnit = unit;
    
    // Populate form
    document.getElementById('unitId').value = unit.id;
    document.getElementById('unitIdValue').value = unit.unit_id;
    document.getElementById('unitPropertyField').value = unit.property_id;
    document.getElementById('unitTypeField').value = unit.type;
    document.getElementById('unitName').value = unit.name;
    document.getElementById('unitDescription').value = unit.description || '';
    document.getElementById('unitBedrooms').value = unit.bedrooms;
    document.getElementById('unitBathrooms').value = unit.bathrooms;
    document.getElementById('unitMaxGuests').value = unit.max_guests;
    document.getElementById('unitBasePrice').value = unit.base_price_kes;
    document.getElementById('unitExtraGuestCharge').value = unit.extra_guest_charge;
    document.getElementById('unitWaterDeposit').value = unit.water_deposit_kes;
    document.getElementById('unitMinNightStay').value = unit.min_night_stay;
    document.getElementById('unitStatus').value = unit.status;
    
    // Update UI
    document.getElementById('unitFormTitle').textContent = 'Edit Unit';
    document.getElementById('unitIdField').style.display = 'none';
    document.getElementById('deleteUnitBtn').style.display = 'inline-block';
    document.getElementById('unitFormError').classList.remove('show');
    
    // Populate property dropdown
    populatePropertyDropdown();
    
    // Show conditional fields
    updateConditionalFields();
    
    document.getElementById('unitsModalOverlay').classList.add('open');
    unitsState.isModalOpen = true;
  } catch (err) {
    console.error('[Edit Unit Modal]', err);
    showToast('Failed to load unit', '⚠️');
  }
}

function closeUnitsModal() {
  document.getElementById('unitsModalOverlay').classList.remove('open');
  unitsState.isModalOpen = false;
  unitsState.selectedUnit = null;
  document.getElementById('unitForm').reset();
}

function populatePropertyDropdown() {
  const dropdown = document.getElementById('unitPropertyField');
  if (!dropdown) return;
  
  dropdown.innerHTML = `
    <option value="">Select a property...</option>
    ${unitsState.propertiesList.map(prop => `
      <option value="${prop.property_id}">${escapeHtml(prop.name)} (${prop.property_id})</option>
    `).join('')}
  `;
}

function updateConditionalFields() {
  const type = document.getElementById('unitTypeField').value;
  const isBnB = type === 'bnb';
  const isRental = ['bedsit', '1bed', '2bed'].includes(type);
  
  // Show/hide B&B-specific field
  const extraGuestField = document.getElementById('unitExtraGuestChargeField');
  extraGuestField.style.display = isBnB ? 'block' : 'none';
  
  // Show/hide rental-specific field
  const depositField = document.getElementById('unitWaterDepositField');
  depositField.style.display = isRental ? 'block' : 'none';
}

// ─────────────────────────────────────────────────────
// FORM SUBMISSION
// ─────────────────────────────────────────────────────

async function handleUnitSubmit(e) {
  e.preventDefault();
  
  const unitId = document.getElementById('unitId').value;
  const isEdit = !!unitId;
  const errorEl = document.getElementById('unitFormError');
  errorEl.classList.remove('show');
  
  try {
    const formData = {
      name: document.getElementById('unitName').value.trim(),
      description: document.getElementById('unitDescription').value.trim() || null,
      type: document.getElementById('unitTypeField').value,
      bedrooms: parseInt(document.getElementById('unitBedrooms').value),
      bathrooms: parseInt(document.getElementById('unitBathrooms').value),
      max_guests: parseInt(document.getElementById('unitMaxGuests').value) || 4,
      base_price_kes: parseInt(document.getElementById('unitBasePrice').value),
      extra_guest_charge: parseInt(document.getElementById('unitExtraGuestCharge').value) || 800,
      water_deposit_kes: parseInt(document.getElementById('unitWaterDeposit').value) || 0,
      min_night_stay: parseInt(document.getElementById('unitMinNightStay').value) || 1,
      status: document.getElementById('unitStatus').value,
      property_id: document.getElementById('unitPropertyField').value
    };

    // Validate required fields
    if (!formData.name) throw new Error('Unit name is required');
    if (!formData.property_id) throw new Error('Property is required');
    if (!formData.type) throw new Error('Unit type is required');
    if (!formData.bedrooms) throw new Error('Number of bedrooms is required');
    if (!formData.bathrooms) throw new Error('Number of bathrooms is required');
    if (!formData.base_price_kes) throw new Error('Base price is required');

    if (isEdit) {
      // Update existing unit
      const response = await fetch(`${API_BASE}/api/admin/units/${unitId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to update unit');
      }
      
      showToast(`Unit "${formData.name}" updated successfully`, '✓');
    } else {
      // Create new unit
      const unit_id = document.getElementById('unitIdValue').value.trim();
      
      if (!unit_id) {
        throw new Error('Unit ID is required');
      }
      
      // Check for duplicate unit_id
      const existing = unitsState.unitsList.find(u => u.unit_id === unit_id);
      if (existing) {
        throw new Error('Unit ID already exists');
      }
      
      const response = await fetch(`${API_BASE}/api/admin/units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          ...formData,
          unit_id
        })
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to create unit');
      }
      
      showToast(`Unit "${formData.name}" created successfully`, '✓');
    }
    
    closeUnitsModal();
    await loadUnits();
  } catch (err) {
    console.error('[Unit Submit]', err);
    errorEl.textContent = err.message || 'Failed to save unit';
    errorEl.classList.add('show');
  }
}

// ─────────────────────────────────────────────────────
// DELETE UNIT
// ─────────────────────────────────────────────────────

async function deleteUnit(unitId) {
  if (!confirm('Are you sure you want to delete this unit? This will mark it as inactive.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/units/${unitId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ status: 'inactive' })
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to delete unit');
    }
    
    showToast('Unit marked as inactive', '✓');
    if (unitsState.isModalOpen) {
      closeUnitsModal();
    }
    await loadUnits();
  } catch (err) {
    console.error('[Delete Unit]', err);
    showToast(err.message || 'Failed to delete unit', '⚠️');
  }
}
