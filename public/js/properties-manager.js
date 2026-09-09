/**
 * PROPERTIES MANAGEMENT MODULE
 * Handles property/building management CRUD operations for the admin dashboard
 */

const propertiesState = {
  propertiesList: [],
  filters: {
    status: '' // 'active', 'inactive', or empty for all
  },
  selectedProperty: null,
  isModalOpen: false
};

// ─────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────

async function initPropertiesManager() {
  // Set up modal close handlers
  document.getElementById('propertiesModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'propertiesModalOverlay') {
      closePropertiesModal();
    }
  });

  // Load properties from API
  await loadProperties();
}

// ─────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────

async function loadProperties() {
  try {
    const { status } = propertiesState.filters;
    const query = status ? `?status=${status}` : '';
    
    const response = await fetch(`${API_BASE}/api/admin/properties${query}`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to fetch properties');
    }
    
    propertiesState.propertiesList = result.data || [];
    renderPropertiesTable();
  } catch (err) {
    console.error('[Load Properties]', err);
    showToast('Failed to load properties', '⚠️');
  }
}

// ─────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────

function renderPropertiesTable() {
  const tableBody = document.getElementById('propertiesTableBody');
  
  if (propertiesState.propertiesList.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">
          No properties found
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = propertiesState.propertiesList.map(prop => `
    <tr>
      <td><strong>${escapeHtml(prop.property_id)}</strong></td>
      <td>${escapeHtml(prop.name)}</td>
      <td>${escapeHtml(prop.city || '-')}</td>
      <td>${escapeHtml(prop.contact_person || '-')}</td>
      <td><span class="badge badge-${prop.status}">${prop.status}</span></td>
      <td>
        <a href="#" onclick="openEditPropertyModal(${prop.id}); return false;" style="color: var(--earth); text-decoration: none; margin-right: 8px; font-size: 0.9em;">Edit</a>
        <a href="#" onclick="deleteProperty(${prop.id}); return false;" style="color: var(--rust); text-decoration: none; font-size: 0.9em;">Delete</a>
      </td>
    </tr>
  `).join('');
}

// ─────────────────────────────────────────────────────
// FILTER & RESET
// ─────────────────────────────────────────────────────

async function filterProperties() {
  propertiesState.filters.status = document.getElementById('propertyStatusFilter').value;
  await loadProperties();
}

async function resetPropertyFilters() {
  propertiesState.filters.status = '';
  document.getElementById('propertyStatusFilter').value = '';
  await loadProperties();
}

// ─────────────────────────────────────────────────────
// MODAL FUNCTIONS
// ─────────────────────────────────────────────────────

function openAddPropertyModal() {
  propertiesState.selectedProperty = null;
  document.getElementById('propertyForm').reset();
  document.getElementById('propertyId').value = '';
  document.getElementById('propertyFormTitle').textContent = 'Add New Property';
  document.getElementById('propertyIdField').style.display = 'block'; // Show property_id for new
  document.getElementById('propertyIdField').querySelector('input').readOnly = false;
  document.getElementById('deletePropertyBtn').style.display = 'none';
  document.getElementById('propertyFormError').classList.remove('show');
  document.getElementById('propertiesModalOverlay').classList.add('open');
  propertiesState.isModalOpen = true;
}

async function openEditPropertyModal(propertyId) {
  try {
    // Fetch property details
    const response = await fetch(`${API_BASE}/api/admin/properties?id=${propertyId}`, {
      headers: {
        'Authorization': `Bearer ${state.token}`
      }
    });
    const result = await response.json();
    const property = result.data?.find(p => p.id === propertyId);
    
    if (!property) {
      showToast('Property not found', '❌');
      return;
    }

    propertiesState.selectedProperty = property;
    
    // Populate form
    document.getElementById('propertyId').value = property.id;
    document.getElementById('propertyIdValue').value = property.property_id;
    document.getElementById('propertyName').value = property.name;
    document.getElementById('propertyDescription').value = property.description || '';
    document.getElementById('propertyAddress').value = property.address || '';
    document.getElementById('propertyCity').value = property.city || '';
    document.getElementById('propertyCountry').value = property.country || 'Kenya';
    document.getElementById('propertyContactPerson').value = property.contact_person || '';
    document.getElementById('propertyContactPhone').value = property.contact_phone || '';
    document.getElementById('propertyEmail').value = property.email || '';
    document.getElementById('propertyStatus').value = property.status;
    
    // Update UI
    document.getElementById('propertyFormTitle').textContent = 'Edit Property';
    document.getElementById('propertyIdField').style.display = 'none'; // Hide property_id for edit
    document.getElementById('deletePropertyBtn').style.display = 'inline-block';
    document.getElementById('propertyFormError').classList.remove('show');
    
    // Open modal
    document.getElementById('propertiesModalOverlay').classList.add('open');
    propertiesState.isModalOpen = true;
  } catch (err) {
    console.error('[Edit Property Modal]', err);
    showToast('Failed to load property', '⚠️');
  }
}

function closePropertiesModal() {
  document.getElementById('propertiesModalOverlay').classList.remove('open');
  propertiesState.isModalOpen = false;
  propertiesState.selectedProperty = null;
  document.getElementById('propertyForm').reset();
}

// ─────────────────────────────────────────────────────
// FORM SUBMISSION
// ─────────────────────────────────────────────────────

async function handlePropertySubmit(e) {
  e.preventDefault();
  
  const propertyId = document.getElementById('propertyId').value;
  const isEdit = !!propertyId;
  const errorEl = document.getElementById('propertyFormError');
  errorEl.classList.remove('show');
  
  try {
    const formData = {
      name: document.getElementById('propertyName').value.trim(),
      description: document.getElementById('propertyDescription').value.trim() || '',
      address: document.getElementById('propertyAddress').value.trim() || '',
      city: document.getElementById('propertyCity').value.trim() || '',
      country: document.getElementById('propertyCountry').value || 'Kenya',
      contact_person: document.getElementById('propertyContactPerson').value.trim() || '',
      contact_phone: document.getElementById('propertyContactPhone').value.trim() || '',
      email: document.getElementById('propertyEmail').value.trim() || '',
      status: document.getElementById('propertyStatus').value
    };

    // Validate required fields
    if (!formData.name) {
      throw new Error('Property name is required');
    }

    if (isEdit) {
      // Update existing property
      const response = await fetch(`${API_BASE}/api/admin/properties/${propertyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to update property');
      }
      
      showToast(`Property "${escapeHtml(formData.name)}" updated successfully`, '✓');
    } else {
      // Create new property
      const property_id = document.getElementById('propertyIdValue').value.trim();
      
      if (!property_id) {
        throw new Error('Property ID is required');
      }
      
      // Check for duplicate property_id
      const existing = propertiesState.propertiesList.find(p => p.property_id === property_id);
      if (existing) {
        throw new Error('Property ID already exists');
      }
      
      const response = await fetch(`${API_BASE}/api/admin/properties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          ...formData,
          property_id
        })
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        throw new Error(result.error || 'Failed to create property');
      }
      
      sessionStorage.setItem('activeProperty', result.data.property_id);
      localStorage.setItem('adminLastPage', 'workspace');
      location.reload(); return;
    }
    
    closePropertiesModal();
    await loadProperties();
  } catch (err) {
    console.error('[Property Submit]', err);
    errorEl.textContent = err.message || 'Failed to save property';
    errorEl.classList.add('show');
  }
}

// ─────────────────────────────────────────────────────
// DELETE PROPERTY
// ─────────────────────────────────────────────────────

async function deleteProperty(propertyId) {
  if (!confirm('Are you sure you want to delete this property? This will mark it as inactive.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/admin/properties/${propertyId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ status: 'inactive' })
    });
    
    const result = await response.json();
    
    if (!result.ok) {
      throw new Error(result.error || 'Failed to delete property');
    }
    
    showToast('Property marked as inactive', '✓');
    if (propertiesState.isModalOpen) {
      closePropertiesModal();
    }
    await loadProperties();
  } catch (err) {
    console.error('[Delete Property]', err);
    showToast(err.message || 'Failed to delete property', '⚠️');
  }
}
