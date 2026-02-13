/**
 * Emergency Dashboard Module
 * Manages the sticky emergency status bar and mobile emergency badge
 */

document.addEventListener("DOMContentLoaded", () => {
  // Emergency Dashboard Elements
  const emergencyStatusBar = document.getElementById("emergencyStatusBar");
  const expandEmergencyBtn = document.getElementById("expandEmergencyBtn");
  const emergencyDashboard = document.getElementById("emergencyDashboard");
  const closeEmergencyDashboard = document.getElementById("closeEmergencyDashboard");

  // Status Bar Elements
  const statusBarDangerLevel = document.getElementById("statusBarDangerLevel");
  const statusBarIncidentCount = document.getElementById("statusBarIncidentCount");

  // Dashboard Elements
  const dashboardDangerLevel = document.getElementById("dashboardDangerLevel");
  const dashboardDangerMessage = document.getElementById("dashboardDangerMessage");
  const dashboardIncidentCount = document.getElementById("dashboardIncidentCount");
  const fireDangerPanel = document.querySelector(".dashboard-panel.fire-danger-panel");

  // Mobile Elements
  const mobileEmergencyBadge = document.getElementById("mobileEmergencyBadge");
  const mobileIncidentBadge = document.getElementById("mobileIncidentBadge");
  const mobileEmergencyPanel = document.getElementById("mobileEmergencyPanel");
  const closeMobilePanel = document.getElementById("closeMobilePanel");
  const mobileDangerLevel = document.getElementById("mobileDangerLevel");
  const mobileIncidentsList = document.getElementById("mobileIncidentsList");

  // State
  let incidentCount = 0;
  let dangerLevel = "MODERATE";
  let dangerMessage = "Plan and prepare for fires in your area";
  let incidents = [];

  /**
   * Update all emergency displays with latest data
   */
  function updateEmergencyDisplays(level, message, count, incidentList = []) {
    const normalizedLevel = (level || "NO RATING").toString().trim().toUpperCase();

    dangerLevel = normalizedLevel;
    dangerMessage = message;
    incidentCount = count;
    incidents = incidentList;

    // Update status bar (desktop/tablet)
    if (statusBarDangerLevel) {
      statusBarDangerLevel.textContent = normalizedLevel;
      statusBarDangerLevel.setAttribute("data-level", normalizedLevel);
    }
    if (emergencyStatusBar) {
      emergencyStatusBar.setAttribute("data-level", normalizedLevel);
    }
    if (statusBarIncidentCount) {
      const incidentText = count === 1 ? "1 Incident" : `${count} Incidents`;
      statusBarIncidentCount.textContent = incidentText;
    }

    // Update dashboard
    if (dashboardDangerLevel) {
      dashboardDangerLevel.textContent = normalizedLevel;
      dashboardDangerLevel.setAttribute("data-level", normalizedLevel);
    }
    if (fireDangerPanel) {
      fireDangerPanel.setAttribute("data-level", normalizedLevel);
    }
    if (dashboardDangerMessage) {
      dashboardDangerMessage.textContent = message;
    }
    if (dashboardIncidentCount) {
      dashboardIncidentCount.textContent = count;
    }

    // Update mobile badge
    if (mobileIncidentBadge) {
      mobileIncidentBadge.textContent = count;
    }

    // Update mobile panel
    if (mobileDangerLevel) {
      mobileDangerLevel.textContent = normalizedLevel;
      mobileDangerLevel.setAttribute("data-level", normalizedLevel);
    }
    if (mobileIncidentsList) {
      updateMobileIncidentsList(incidentList);
    }

    // Apply color coding to status bar based on danger level
    updateStatusBarStyling(normalizedLevel);
  }

  /**
   * Update status bar background color based on danger level
   */
  function updateStatusBarStyling(level) {
    if (!emergencyStatusBar) return;

    // Remove existing level classes
    emergencyStatusBar.classList.remove('level-moderate', 'level-high', 'level-extreme', 'level-catastrophic', 'level-none');

    // Add appropriate class
    switch(level.toUpperCase()) {
      case 'HIGH':
        emergencyStatusBar.classList.add('level-high');
        break;
      case 'EXTREME':
        emergencyStatusBar.classList.add('level-extreme');
        break;
      case 'CATASTROPHIC':
        emergencyStatusBar.classList.add('level-catastrophic');
        break;
      case 'NO RATING':
      case 'N/A':
      case 'ERROR':
        emergencyStatusBar.classList.add('level-none');
        break;
      default:
        emergencyStatusBar.classList.add('level-moderate');
    }
  }

  /**
   * Update mobile incidents list
   */
  function updateMobileIncidentsList(incidentList) {
    if (!mobileIncidentsList) return;

    if (!incidentList || incidentList.length === 0) {
      mobileIncidentsList.innerHTML = '<p>No active incidents in our area.</p>';
      return;
    }

    // Limit to first 3 incidents for mobile view
    const displayIncidents = incidentList.slice(0, 3);
    let html = '<ul>';
    displayIncidents.forEach(incident => {
      html += `<li><strong>${DOMPurify.sanitize(incident.title)}</strong> - ${DOMPurify.sanitize(incident.status)}</li>`;
    });
    html += '</ul>';

    if (incidentList.length > 3) {
      html += `<p class="more-incidents">+ ${incidentList.length - 3} more incidents</p>`;
    }

    mobileIncidentsList.innerHTML = DOMPurify.sanitize(html);
  }

  /**
   * Toggle emergency dashboard (desktop/tablet)
   */
  function toggleEmergencyDashboard() {
    if (!emergencyDashboard) return;

    const isHidden = emergencyDashboard.hasAttribute('hidden');
    if (isHidden) {
      emergencyDashboard.removeAttribute('hidden');
      // Update expand button icon
      if (expandEmergencyBtn) {
        const icon = expandEmergencyBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-chevron-down');
          icon.classList.add('fa-chevron-up');
        }
      }
    } else {
      emergencyDashboard.setAttribute('hidden', '');
      // Update expand button icon
      if (expandEmergencyBtn) {
        const icon = expandEmergencyBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-chevron-up');
          icon.classList.add('fa-chevron-down');
        }
      }
    }
  }

  /**
   * Toggle mobile emergency panel
   */
  function toggleMobileEmergencyPanel() {
    if (!mobileEmergencyPanel) return;

    const isHidden = mobileEmergencyPanel.hasAttribute('hidden');
    if (isHidden) {
      mobileEmergencyPanel.removeAttribute('hidden');
    } else {
      mobileEmergencyPanel.setAttribute('hidden', '');
    }
  }

  /**
   * Close emergency dashboard
   */
  function closeEmergencyDashboardPanel() {
    if (emergencyDashboard) {
      emergencyDashboard.setAttribute('hidden', '');
    }
    if (expandEmergencyBtn) {
      const icon = expandEmergencyBtn.querySelector('i');
      if (icon) {
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
      }
    }
  }

  /**
   * Close mobile emergency panel
   */
  function closeMobileEmergencyPanel() {
    if (mobileEmergencyPanel) {
      mobileEmergencyPanel.setAttribute('hidden', '');
    }
  }

  // Event Listeners
  if (emergencyStatusBar) {
    emergencyStatusBar.addEventListener('click', (e) => {
      // Don't toggle if clicking the expand button (it has its own handler)
      if (!e.target.closest('#expandEmergencyBtn')) {
        toggleEmergencyDashboard();
      }
    });
  }

  if (expandEmergencyBtn) {
    expandEmergencyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEmergencyDashboard();
    });
  }

  if (closeEmergencyDashboard) {
    closeEmergencyDashboard.addEventListener('click', closeEmergencyDashboardPanel);
  }

  if (mobileEmergencyBadge) {
    mobileEmergencyBadge.addEventListener('click', toggleMobileEmergencyPanel);
  }

  if (closeMobilePanel) {
    closeMobilePanel.addEventListener('click', closeMobileEmergencyPanel);
  }

  // Close panels when clicking on action links
  const dashboardActionLinks = document.querySelectorAll('.dashboard-action-btn, .mobile-action-btn');
  dashboardActionLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeEmergencyDashboardPanel();
      closeMobileEmergencyPanel();
    });
  });

  /**
   * Integrate with existing fire danger data fetching
   * This function will be called by main.js when fire data is loaded
   */
  window.updateEmergencyDashboard = function(fireDangerData) {
    if (fireDangerData.dangerLevel) {
      const level = fireDangerData.dangerLevel;
      const message = fireDangerData.message || dangerMessage;
      const count = fireDangerData.incidentCount || 0;
      const incidentList = fireDangerData.incidents || [];

      updateEmergencyDisplays(level, message, count, incidentList);
    }
  };

  // Initialize with default values
  updateEmergencyDisplays(dangerLevel, dangerMessage, incidentCount, []);

  // Store preference for dismissing low-priority updates (optional feature)
  const dismissPreference = localStorage.getItem('dismissLowPriority');
  if (dismissPreference === 'true' && dangerLevel === 'MODERATE') {
    // Could implement auto-collapse behavior here
  }
});
