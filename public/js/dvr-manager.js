// ─── DVR CAMERA MANAGEMENT ───
// Manages surveillance cameras and live stream display

const dvrState = {
  cameras: [],
  isModalOpen: false,
  nextCameraId: 5,
};

// Hardcoded camera data for MVP
const HARDCODED_CAMERAS = [
  {
    id: 'camera-001',
    name: 'Front Gate CCTV',
    location: 'Front Entrance',
    type: 'CCTV',
    status: 'online',
    lastSeen: new Date(Date.now() - 30000), // 30 seconds ago
  },
  {
    id: 'camera-002',
    name: 'Main Building Live Stream',
    location: 'Building Entrance',
    type: 'YouTube',
    streamUrl: 'https://www.youtube.com/embed/hc2qqq5kH9A?si=GGaHLj71xM9of1ip',
    status: 'online',
    lastSeen: new Date(),
  },
  {
    id: 'camera-003',
    name: 'Water Tank Monitor',
    location: 'Tank Compound',
    type: 'YouTube',
    streamUrl: 'https://www.youtube.com/embed/hc2qqq5kH9A?si=GGaHLj71xM9of1ip',
    status: 'online',
    lastSeen: new Date(),
  },
  {
    id: 'camera-004',
    name: 'Parking Area CCTV',
    location: 'Parking Yard',
    type: 'CCTV',
    status: 'offline',
    lastSeen: new Date(Date.now() - 3600000), // 1 hour ago
  },
];

/**
 * Initialize DVR camera manager
 * Called when DVR page is loaded
 */
function initializeDVRManager() {
  // Load hardcoded camera data
  dvrState.cameras = JSON.parse(JSON.stringify(HARDCODED_CAMERAS));
  dvrState.nextCameraId = 5;

  // Set up modal event listeners
  const addCameraOverlay = document.getElementById('addCameraModalOverlay');
  if (addCameraOverlay) {
    addCameraOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'addCameraModalOverlay') closeAddCameraModal();
    });
  }

  // Render cameras
  renderDVRCameras();
}

/**
 * Render all cameras as cards in the grid
 */
function renderDVRCameras() {
  const container = document.getElementById('dvrCamerasContainer');

  if (!container) return;

  if (dvrState.cameras.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <svg style="width: 48px; height: 48px; margin-bottom: 16px; opacity: 0.5;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        <p style="font-size: 1rem; margin: 0;">No cameras added yet</p>
        <p style="font-size: 0.85rem; margin-top: 8px;">Click "Add Camera" to get started</p>
      </div>
    `;
    return;
  }

  // Build camera cards HTML
  container.innerHTML = dvrState.cameras
    .map((camera) => createCameraCard(camera))
    .join('');
}

/**
 * Create HTML for a single camera card
 */
function createCameraCard(camera) {
  const statusColor = camera.status === 'online' ? '#16a34a' : '#6b7280';
  const statusText = camera.status === 'online' ? 'Online' : 'Offline';
  const lastSeenText = formatTimeAgo(camera.lastSeen);

  let streamHTML = '';
  if (camera.type === 'YouTube' && camera.streamUrl) {
    streamHTML = `
      <div class="camera-stream-container">
        <iframe width="100%" height="280" src="${escapeHtml(camera.streamUrl)}" 
          title="Live Stream" frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen>
        </iframe>
      </div>
    `;
  } else if (camera.type === 'CCTV') {
    streamHTML = `
      <div class="camera-stream-container cctv-placeholder">
        <div style="display: flex; align-items: center; justify-content: center; height: 280px; background: linear-gradient(135deg, rgba(139,111,71,.1) 0%, rgba(92,72,48,.1) 100%); border: 1px solid var(--border); border-radius: var(--radius); flex-direction: column; gap: 12px;">
          <svg style="width: 48px; height: 48px; color: var(--text-muted);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">CCTV Stream</p>
          <p style="margin: 0; font-size: 0.75rem; color: var(--text-light);">Live stream unavailable</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="camera-card" data-camera-id="${camera.id}">
      <div class="camera-card-header">
        <div>
          <div class="camera-name">${escapeHtml(camera.name)}</div>
          <div class="camera-location">
            <svg style="width: 14px; height: 14px; display: inline; margin-right: 4px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${escapeHtml(camera.location)}
          </div>
        </div>
        <div class="camera-status-badge" style="background-color: ${statusColor}; color: white;">
          <svg style="width: 8px; height: 8px; display: inline-block; margin-right: 4px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
          ${statusText}
        </div>
      </div>

      ${streamHTML}

      <div class="camera-details">
        <div class="camera-detail-row">
          <span class="camera-detail-label">Type:</span>
          <span class="camera-detail-value">${camera.type}</span>
        </div>
        <div class="camera-detail-row">
          <span class="camera-detail-label">Last Seen:</span>
          <span class="camera-detail-value">${lastSeenText}</span>
        </div>
      </div>

      <div class="camera-actions">
        <button class="camera-action-btn" onclick="deleteCamera('${camera.id}')">
          <svg style="width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          Delete
        </button>
      </div>
    </div>
  `;
}

/**
 * Open Add Camera modal
 */
function openAddCameraModal() {
  const overlay = document.getElementById('addCameraModalOverlay');
  if (!overlay) return;

  overlay.classList.add('show');
  dvrState.isModalOpen = true;

  // Clear form
  document.getElementById('cameraName').value = '';
  document.getElementById('cameraLocation').value = '';
  document.getElementById('cameraType').value = 'YouTube';
  document.getElementById('cameraStreamUrl').value = '';
  document.getElementById('addCameraError').innerHTML = '';
  document.getElementById('addCameraError').classList.remove('show');
}

/**
 * Close Add Camera modal
 */
function closeAddCameraModal() {
  const overlay = document.getElementById('addCameraModalOverlay');
  if (!overlay) return;

  overlay.classList.remove('show');
  dvrState.isModalOpen = false;
}

/**
 * Submit new camera
 */
function submitAddCamera() {
  const errorElement = document.getElementById('addCameraError');
  errorElement.innerHTML = '';
  errorElement.classList.remove('show');

  // Get form values
  const name = document.getElementById('cameraName').value.trim();
  const location = document.getElementById('cameraLocation').value.trim();
  const type = document.getElementById('cameraType').value;
  const streamUrl = document.getElementById('cameraStreamUrl').value.trim();

  // Validate
  if (!name) {
    showCameraError(errorElement, 'Camera name is required');
    return;
  }

  if (!location) {
    showCameraError(errorElement, 'Location is required');
    return;
  }

  if (type === 'YouTube' && !streamUrl) {
    showCameraError(errorElement, 'YouTube embed URL is required for YouTube type');
    return;
  }

  // Create new camera object
  const newCamera = {
    id: `camera-${String(dvrState.nextCameraId++).padStart(3, '0')}`,
    name,
    location,
    type,
    streamUrl: type === 'YouTube' ? streamUrl : '',
    status: 'online',
    lastSeen: new Date(),
  };

  // Add to state
  dvrState.cameras.push(newCamera);

  // Close modal and re-render
  closeAddCameraModal();
  renderDVRCameras();

  // Notify user
  showToast(`Camera "${name}" added successfully!`, '✓');
}

/**
 * Delete camera with confirmation
 */
function deleteCamera(cameraId) {
  const camera = dvrState.cameras.find((c) => c.id === cameraId);
  if (!camera) return;

  // Show confirmation dialog
  const confirmed = confirm(
    `Are you sure you want to delete "${camera.name}"?\n\nThis action cannot be undone.`
  );
  if (!confirmed) return;

  // Remove from state
  dvrState.cameras = dvrState.cameras.filter((c) => c.id !== cameraId);

  // Re-render
  renderDVRCameras();

  // Notify user
  showToast(`Camera deleted successfully`, '✓');
}

/**
 * Show error message in modal
 */
function showCameraError(errorElement, message) {
  errorElement.innerHTML = message;
  errorElement.classList.add('show');
}

/**
 * Format relative time (e.g., "5 minutes ago")
 */
function formatTimeAgo(date) {
  if (typeof date === 'string') date = new Date(date);

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
