/**
 * TANK MANAGEMENT MODULE
 * Handles tank data, visualization, and user interactions for the admin dashboard
 */

const tankState = {
  tanks: [],
  isModalOpen: false,
};

// ─────────────────────────────────────────────────────
// HARDCODED TANK DATA
// ─────────────────────────────────────────────────────

const HARDCODED_TANKS = [
  {
    id: 'tank-001',
    name: 'Main Water Tank',
    capacity: 10000,
    currentLevel: 8500,
    status: 'active',
    location: 'Main Building Rooftop',
    lastUpdated: new Date(Date.now() - 15 * 60000), // 15 mins ago
  },
  {
    id: 'tank-002',
    name: 'Backup Reserve Tank',
    capacity: 5000,
    currentLevel: 2100,
    status: 'active',
    location: 'East Wing Storage',
    lastUpdated: new Date(Date.now() - 45 * 60000), // 45 mins ago
  },
  {
    id: 'tank-003',
    name: 'Maintenance Tank',
    capacity: 3000,
    currentLevel: 1200,
    status: 'maintenance',
    location: 'West Wing Courtyard',
    lastUpdated: new Date(Date.now() - 2 * 3600000), // 2 hours ago
  },
  {
    id: 'tank-004',
    name: 'Runoff Collection Tank',
    capacity: 7500,
    currentLevel: 5880,
    status: 'active',
    location: 'Rainwater Harvesting Area',
    lastUpdated: new Date(Date.now() - 30 * 60000), // 30 mins ago
  },
  {
    id: 'tank-005',
    name: 'Auxiliary Supply Tank',
    capacity: 2500,
    currentLevel: 300,
    status: 'inactive',
    location: 'South Building Basement',
    lastUpdated: new Date(Date.now() - 7 * 3600000), // 7 hours ago
  },
];

let nextTankId = 6;

// ─────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────

function initializeTankManager() {
  // Load hardcoded tanks on startup
  tankState.tanks = JSON.parse(JSON.stringify(HARDCODED_TANKS));

  // Set up event listeners for modals
  document.getElementById('addTankModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'addTankModalOverlay') {
      closeAddTankModal();
    }
  });

  // Render initial tanks
  renderTanks();
}

// ─────────────────────────────────────────────────────
// TANK RENDERING
// ─────────────────────────────────────────────────────

function renderTanks() {
  const container = document.getElementById('tanksContainer');

  if (tankState.tanks.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="margin-bottom: 12px;">No tanks available</p>
        <button class="btn btn-primary btn-sm" onclick="openAddTankModal()">Add First Tank</button>
      </div>
    `;
    return;
  }

  container.innerHTML = tankState.tanks.map((tank) => createTankCard(tank)).join('');
  
  // Animate tank fills after rendering
  setTimeout(() => {
    tankState.tanks.forEach((tank) => {
      animateTankFill(tank.id);
    });
  }, 50);
}

function createTankCard(tank) {
  const percentage = Math.round((tank.currentLevel / tank.capacity) * 100);
  const statusClass = `tank-status-${tank.status}`;
  const levelClass = getLevelClass(percentage);

  return `
    <div class="tank-card" data-tank-id="${tank.id}">
      <div class="tank-card-header">
        <div class="tank-name">${escapeHtml(tank.name)}</div>
        <span class="tank-status-badge ${statusClass}">${tank.status}</span>
      </div>

      <div class="tank-percentage" id="percentage-${tank.id}">--</div>

      <div class="tank-visualization">
        <div class="tank-bar-container">
          <div class="tank-bar-fill ${levelClass}" id="fill-${tank.id}" style="height: 0%;">
            <div class="tank-bar-label">${percentage}%</div>
          </div>
        </div>
      </div>

      <div class="tank-details">
        <div class="tank-detail-row">
          <span class="tank-detail-label">Current Level</span>
          <span class="tank-detail-value" id="level-${tank.id}">${formatNumber(tank.currentLevel)} L</span>
        </div>
        <div class="tank-detail-row">
          <span class="tank-detail-label">Capacity</span>
          <span class="tank-detail-value">${formatNumber(tank.capacity)} L</span>
        </div>
        <div class="tank-detail-row">
          <span class="tank-detail-label">Updated</span>
          <span class="tank-detail-value" id="updated-${tank.id}">${formatTimeAgo(tank.lastUpdated)}</span>
        </div>
      </div>

      <div class="tank-location">
        <strong>Location:</strong> ${escapeHtml(tank.location)}
      </div>

      <div class="tank-actions">
        <button class="tank-action-btn" onclick="editTank('${tank.id}')">Edit</button>
        <button class="tank-action-btn" onclick="deleteTank('${tank.id}')">Delete</button>
      </div>
    </div>
  `;
}

function animateTankFill(tankId) {
  const tank = tankState.tanks.find((t) => t.id === tankId);
  if (!tank) return;

  const percentage = (tank.currentLevel / tank.capacity) * 100;
  const fillElement = document.getElementById(`fill-${tankId}`);
  const labelElement = fillElement.querySelector('.tank-bar-label');
  const percentageElement = document.getElementById(`percentage-${tankId}`);

  if (fillElement) {
    // Animate the fill height
    fillElement.style.height = `${percentage}%`;

    // Update percentage text
    if (percentageElement) {
      setTimeout(() => {
        percentageElement.textContent = `${Math.round(percentage)}%`;
      }, 300);
    }
  }
}

function getLevelClass(percentage) {
  if (percentage < 40) return 'level-critical';
  if (percentage < 70) return 'level-warning';
  return 'level-good';
}

// ─────────────────────────────────────────────────────
// MODAL FUNCTIONS
// ─────────────────────────────────────────────────────

function openAddTankModal() {
  const overlay = document.getElementById('addTankModalOverlay');
  overlay.classList.add('show');
  tankState.isModalOpen = true;

  // Reset form
  document.getElementById('tankName').value = '';
  document.getElementById('tankCapacity').value = '';
  document.getElementById('tankLevel').value = '';
  document.getElementById('tankLocation').value = '';
  document.getElementById('tankStatus').value = 'active';
  document.getElementById('addTankError').classList.remove('show');
  document.getElementById('addTankError').textContent = '';
}

function closeAddTankModal() {
  const overlay = document.getElementById('addTankModalOverlay');
  overlay.classList.remove('show');
  tankState.isModalOpen = false;
}

function handleAddTank(event) {
  event.preventDefault();
}

function submitAddTank() {
  const errorElement = document.getElementById('addTankError');
  errorElement.classList.remove('show');

  // Get form values
  const name = document.getElementById('tankName').value.trim();
  const capacity = parseFloat(document.getElementById('tankCapacity').value);
  const currentLevel = parseFloat(document.getElementById('tankLevel').value);
  const location = document.getElementById('tankLocation').value.trim();
  const status = document.getElementById('tankStatus').value;

  // Validation
  if (!name) {
    showTankError('Tank name is required');
    return;
  }

  if (!capacity || capacity <= 0) {
    showTankError('Capacity must be greater than 0');
    return;
  }

  if (currentLevel === '' || currentLevel === null) {
    showTankError('Current level is required');
    return;
  }

  if (currentLevel < 0) {
    showTankError('Current level cannot be negative');
    return;
  }

  if (currentLevel > capacity) {
    showTankError('Current level cannot exceed capacity');
    return;
  }

  if (!location) {
    showTankError('Location is required');
    return;
  }

  // Create new tank
  const newTank = {
    id: `tank-${String(nextTankId++).padStart(3, '0')}`,
    name,
    capacity,
    currentLevel,
    location,
    status,
    lastUpdated: new Date(),
  };

  // Add to tanks array
  tankState.tanks.push(newTank);

  // Close modal and refresh
  closeAddTankModal();
  renderTanks();

  // Show success toast
  showToast(`Tank "${name}" added successfully!`, 'success');
}

function showTankError(message) {
  const errorElement = document.getElementById('addTankError');
  errorElement.textContent = message;
  errorElement.classList.add('show');
}

// ─────────────────────────────────────────────────────
// TANK ACTIONS
// ─────────────────────────────────────────────────────

function editTank(tankId) {
  const tank = tankState.tanks.find((t) => t.id === tankId);
  if (!tank) return;

  // For now, just show a toast. In future, open edit modal
  showToast(`Edit feature for "${escapeHtml(tank.name)}" - Coming Soon!`);
}

function deleteTank(tankId) {
  const tank = tankState.tanks.find((t) => t.id === tankId);
  if (!tank) return;

  // Confirm deletion
  const confirmed = confirm(
    `Are you sure you want to delete the tank "${escapeHtml(tank.name)}"? This action cannot be undone.`
  );

  if (!confirmed) return;

  // Remove from array
  tankState.tanks = tankState.tanks.filter((t) => t.id !== tankId);

  // Refresh UI
  renderTanks();

  // Show success toast
  showToast(`Tank "${escapeHtml(tank.name)}" deleted successfully!`, 'warning');
}

// ─────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────

function formatNumber(num) {
  return num.toLocaleString('en-US');
}

function formatTimeAgo(date) {
  // Convert string to Date if needed (happens after JSON stringify/parse)
  if (typeof date === 'string') {
    date = new Date(date);
  }

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toastIcon');
  const toastMsg = document.getElementById('toastMsg');

  toastMsg.textContent = message;

  if (type === 'success') {
    toastIcon.textContent = '✓';
  } else if (type === 'warning') {
    toastIcon.textContent = '⚠';
  } else if (type === 'error') {
    toastIcon.textContent = '✕';
  }

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
