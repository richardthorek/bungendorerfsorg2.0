/**
 * Emergency Dashboard Module
 * Manages the live status strip (Phase 3).
 * Legacy emergency bar / overlay / mobile-panel elements have been removed from
 * index.html; their IDs survive as hidden alias spans inside #liveStatusStrip so
 * the writes below continue to work through the Phase 3 → Phase 7 transition window.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Live Status Strip — canonical visible elements
  const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
  const fireDangerMessageEl = document.getElementById("fireDangerMessage");
  const incidentTotalCount = document.getElementById("incidentTotalCount");

  // Legacy alias elements (hidden spans inside #liveStatusStrip)
  const statusBarDangerLevel = document.getElementById("statusBarDangerLevel");
  const statusBarIncidentCount = document.getElementById("statusBarIncidentCount");
  const dashboardDangerLevel = document.getElementById("dashboardDangerLevel");
  const dashboardDangerMessage = document.getElementById("dashboardDangerMessage");
  const dashboardIncidentCount = document.getElementById("dashboardIncidentCount");
  const mobileDangerLevel = document.getElementById("mobileDangerLevel");
  const mobileIncidentBadge = document.getElementById("mobileIncidentBadge");
  const mobileIncidentsList = document.getElementById("mobileIncidentsList");

  // State
  let incidentCount = 0;
  let dangerLevel = "MODERATE";
  let dangerMessage = "Plan and prepare for fires in your area";

  /**
   * Update all emergency displays with latest data.
   * Canonical strip elements are updated visibly; legacy alias elements are
   * updated as hidden spans for backward-compatible reads by other JS modules.
   */
  function updateEmergencyDisplays(level, message, count, incidentList = []) {
    const normalizedLevel = (level || "NO RATING").toString().trim().toUpperCase();

    dangerLevel = normalizedLevel;
    dangerMessage = message;
    incidentCount = count;

    // Update canonical strip Cell 1 (Fire Danger Rating)
    if (fireDangerRatingCell) {
      fireDangerRatingCell.textContent = normalizedLevel;
      fireDangerRatingCell.setAttribute("data-level", normalizedLevel);
    }
    if (fireDangerMessageEl) {
      fireDangerMessageEl.textContent = message;
    }

    // Update legacy alias spans — Cell 1
    if (statusBarDangerLevel) {
      statusBarDangerLevel.textContent = normalizedLevel;
      statusBarDangerLevel.setAttribute("data-level", normalizedLevel);
    }
    if (dashboardDangerLevel) {
      dashboardDangerLevel.textContent = normalizedLevel;
      dashboardDangerLevel.setAttribute("data-level", normalizedLevel);
    }
    if (mobileDangerLevel) {
      mobileDangerLevel.textContent = normalizedLevel;
      mobileDangerLevel.setAttribute("data-level", normalizedLevel);
    }
    if (dashboardDangerMessage) {
      dashboardDangerMessage.textContent = message;
    }

    // Update canonical strip Cell 2 (Active Incidents)
    if (incidentTotalCount) {
      incidentTotalCount.textContent = String(count);
    }

    // Update legacy alias spans — Cell 2
    const incidentText = count === 1 ? "1 Incident" : `${count} Incidents`;
    if (statusBarIncidentCount) {
      statusBarIncidentCount.textContent = incidentText;
    }
    if (dashboardIncidentCount) {
      dashboardIncidentCount.textContent = count;
    }
    if (mobileIncidentBadge) {
      mobileIncidentBadge.textContent = count;
    }

    // Update mobile incidents list alias
    if (mobileIncidentsList) {
      updateMobileIncidentsList(incidentList);
    }

    // Apply danger-level data attribute to the live status strip for colour coding
    // CSS targets #fireDangerRatingCell[data-level] directly for colour-banding.
  }

  /**
   * Update mobile incidents list alias element
   */
  function updateMobileIncidentsList(incidentList) {
    if (!mobileIncidentsList) return;

    if (!incidentList || incidentList.length === 0) {
      mobileIncidentsList.innerHTML = "<p>No active incidents in our area.</p>";
      return;
    }

    // Limit to first 3 incidents for compact view
    const displayIncidents = incidentList.slice(0, 3);
    let html = "<ul>";
    displayIncidents.forEach((incident) => {
      html += `<li><strong>${DOMPurify.sanitize(incident.title)}</strong> - ${DOMPurify.sanitize(incident.status)}</li>`;
    });
    html += "</ul>";

    if (incidentList.length > 3) {
      html += `<p class="more-incidents">+ ${incidentList.length - 3} more incidents</p>`;
    }

    mobileIncidentsList.innerHTML = DOMPurify.sanitize(html);
  }

  /**
   * Integrate with existing fire danger data fetching.
   * Called by main.js / map.js when fire data is loaded.
   */
  window.updateEmergencyDashboard = function (fireDangerData) {
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
});
