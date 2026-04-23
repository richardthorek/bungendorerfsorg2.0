/**
 * Emergency Dashboard Module
 * Manages the live status strip (Phase 3).
 * Phase 7: legacy alias shim removed from index.html; writes to those IDs
 * have been removed from this module.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Live Status Strip — canonical visible elements
  const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
  const fireDangerMessageEl = document.getElementById("fireDangerMessage");
  const incidentTotalCount = document.getElementById("incidentTotalCount");

  // State
  let incidentCount = 0;
  let dangerLevel = "MODERATE";
  let dangerMessage = "Plan and prepare for fires in your area";

  /**
   * Update the live status strip with latest data.
   */
  function updateEmergencyDisplays(level, message, count) {
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

    // Update canonical strip Cell 2 (Active Incidents)
    if (incidentTotalCount) {
      incidentTotalCount.textContent = String(count);
    }

    // Apply danger-level data attribute to the live status strip for colour coding
    // CSS targets #fireDangerRatingCell[data-level] directly for colour-banding.
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

      updateEmergencyDisplays(level, message, count);
    }
  };

  // Initialize with default values
  updateEmergencyDisplays(dangerLevel, dangerMessage, incidentCount);
});
