/**
 * SKELETON LOADER MANAGER
 * Creates skeleton/shimmer loading UI that matches the dashboard design
 */

const SkeletonLoader = (() => {
  /**
   * Create a skeleton stat card (for dashboard)
   */
  function createStatCardSkeleton() {
    return `
      <div class="stat-card skeleton-card">
        <div class="skeleton-loader" style="width: 60%; height: 14px; margin-bottom: 12px;"></div>
        <div class="skeleton-loader" style="width: 85%; height: 28px;"></div>
      </div>
    `;
  }

  /**
   * Create a skeleton table row
   */
  function createTableRowSkeleton(columns = 8) {
    let cols = '';
    for (let i = 0; i < columns; i++) {
      const width = Math.floor(Math.random() * 30 + 50);
      cols += `<td><div class="skeleton-loader" style="width: ${width}%; height: 12px;"></div></td>`;
    }
    return `<tr class="skeleton-row">${cols}</tr>`;
  }

  /**
   * Create a skeleton card
   */
  function createCardSkeleton() {
    return `
      <div class="card skeleton-card">
        <div class="skeleton-loader" style="width: 35%; height: 18px; margin-bottom: 16px;"></div>
        <div class="skeleton-loader" style="width: 100%; height: 8px; margin-bottom: 8px;"></div>
        <div class="skeleton-loader" style="width: 95%; height: 8px;"></div>
      </div>
    `;
  }

  /**
   * Show skeleton loading for dashboard stats
   * Adds visual loading state without destroying the original HTML
   */
  function showDashboardSkeleton() {
    // Just add a loading style to stat values - don't replace HTML
    const statValues = document.querySelectorAll('#dashboardPage .stat-value');
    statValues.forEach(el => {
      el.classList.add('skeleton-loading');
      el.style.minHeight = '28px';
      el.style.backgroundColor = 'rgba(196, 168, 130, 0.15)';
      el.style.borderRadius = '4px';
      el.style.animation = 'shimmer 1.5s infinite';
    });

    const recentContainer = document.getElementById('recentBookingsContainer');
    const upcomingContainer = document.getElementById('upcomingEventsContainer');
    if (recentContainer) {
      recentContainer.style.opacity = '0.6';
      recentContainer.innerHTML = '<div style="height: 80px; background: linear-gradient(90deg, rgba(139,111,71,.1) 0%, rgba(139,111,71,.18) 50%, rgba(139,111,71,.1) 100%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px;"></div>';
    }
    if (upcomingContainer) {
      upcomingContainer.style.opacity = '0.6';
      upcomingContainer.innerHTML = '<div style="height: 80px; background: linear-gradient(90deg, rgba(139,111,71,.1) 0%, rgba(139,111,71,.18) 50%, rgba(139,111,71,.1) 100%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px;"></div>';
    }
  }

  /**
   * Show skeleton loading for tables
   * Works with existing table structure
   */
  function showTableSkeleton(tableBodyId, rowCount = 8, columns = 8) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    // Clear existing content and add skeleton rows
    let html = '';
    for (let i = 0; i < rowCount; i++) {
      html += createTableRowSkeleton(columns);
    }
    tbody.innerHTML = html;
    
    // Add loading animation to rows
    const rows = tbody.querySelectorAll('.skeleton-row');
    rows.forEach(row => {
      row.style.animation = 'pulseRow 1.5s ease-in-out infinite';
    });
  }

  /**
   * Show skeleton loading for grid content
   */
  function showGridSkeleton(elementId, itemCount = 4) {
    const container = document.getElementById(elementId);
    if (!container) return;

    let html = '';
    for (let i = 0; i < itemCount; i++) {
      html += createCardSkeleton();
    }
    container.innerHTML = html;
  }

  /**
   * Show page loading skeleton (full page layout)
   */
  function showPageSkeleton(pageName) {
    const pageEl = document.getElementById(`${pageName}Page`);
    if (!pageEl) return;

    // Create header skeleton
    const headerHtml = `
      <div class="content-header" style="margin-bottom: 28px;">
        <div class="skeleton-loader" style="width: 250px; height: 28px;"></div>
        <div class="skeleton-loader" style="width: 150px; height: 40px;"></div>
      </div>
    `;

    // Create content skeleton based on page type
    let contentHtml = '';
    if (pageName === 'dashboard') {
      // Dashboard layout: stats + cards
      contentHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; margin-bottom: 32px;">
          ${Array(4).fill(0).map(() => createStatCardSkeleton()).join('')}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          ${Array(2).fill(0).map(() => createCardSkeleton()).join('')}
        </div>
      `;
    } else if (['bookings', 'rentals', 'units', 'properties'].includes(pageName)) {
      // Table layout
      contentHtml = `
        <div class="table-container">
          <table>
            <tbody id="${pageName}TableBodySkeleton">
              ${Array(8).fill(0).map(() => createTableRowSkeleton()).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else {
      contentHtml = Array(3).fill(0).map(() => createCardSkeleton()).join('');
    }

    // Set content but keep existing structure
    const contentArea = pageEl.querySelector('.admin-main') || pageEl;
    const existingHeader = contentArea.querySelector('.content-header');
    if (existingHeader) {
      // Replace just the content, not headers
      const mainContent = contentArea.querySelector('div:not(.content-header):not(.admin-header)');
      if (mainContent) {
        mainContent.innerHTML = contentHtml;
      }
    }
  }

  /**
   * Add shimmer animation effect
   */
  function addShimmerEffect() {
    if (document.querySelector('style[data-skeleton]')) return; // Already added

    const style = document.createElement('style');
    style.setAttribute('data-skeleton', 'true');
    style.textContent = `
      .skeleton-loader {
        background: linear-gradient(
          90deg,
          rgba(139, 111, 71, 0.1) 0%,
          rgba(139, 111, 71, 0.18) 50%,
          rgba(139, 111, 71, 0.1) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 4px;
      }

      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      .skeleton-card {
        opacity: 0.6;
        pointer-events: none;
      }

      .skeleton-row {
        opacity: 0.5;
      }

      .skeleton-row td {
        padding: 14px 16px !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize shimmer effect on module load
  function init() {
    addShimmerEffect();
  }

  return {
    showDashboardSkeleton,
    showTableSkeleton,
    showGridSkeleton,
    showPageSkeleton,
    createStatCardSkeleton,
    createTableRowSkeleton,
    createCardSkeleton,
    init
  };
})();

// Auto-initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SkeletonLoader.init());
} else {
  SkeletonLoader.init();
}
