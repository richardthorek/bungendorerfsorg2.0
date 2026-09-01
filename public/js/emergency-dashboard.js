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
   * `count` is optional: incident-count ownership belongs solely to
   * emergency-data.js (see WEBSITE_ROADMAP.md §2.1), so a fire-danger-only
   * update (main.js) must never assert a count — passing undefined here
   * leaves the incidents cell untouched instead of clobbering it back to 0
   * whenever the *other* feed fails.
   */
  function updateEmergencyDisplays(level, message, count) {
    const normalizedLevel = (level || "NO RATING").toString().trim().toUpperCase();

    dangerLevel = normalizedLevel;
    dangerMessage = message;

    // Update canonical strip Cell 1 (Fire Danger Rating)
    if (fireDangerRatingCell) {
      fireDangerRatingCell.textContent = normalizedLevel;
      fireDangerRatingCell.setAttribute("data-level", normalizedLevel);
    }
    if (fireDangerMessageEl) {
      fireDangerMessageEl.textContent = message;
    }

    // Update canonical strip Cell 2 (Active Incidents) — only when the caller
    // actually owns incident data.
    if (typeof count === "number") {
      incidentCount = count;
      if (incidentTotalCount) {
        incidentTotalCount.textContent = String(count);
      }
      // Lets fire-info-section.js (which owns the collapsed/expanded Fire
      // Information section) auto-expand on a real incident count, without
      // this module needing to know anything about that UI.
      document.dispatchEvent(new CustomEvent("bungendore:incident-count", { detail: { count } }));
    }

    // Apply danger-level data attribute to the live status strip for colour coding
    // CSS targets #fireDangerRatingCell[data-level] directly for colour-banding.
  }

  /**
   * Integrate with existing fire danger data fetching.
   * Called by main.js (fire danger rating only) and emergency-data.js
   * (incident count only, via an explicit incidentCount field).
   */
  window.updateEmergencyDashboard = function (fireDangerData) {
    if (fireDangerData.dangerLevel) {
      const level = fireDangerData.dangerLevel;
      const message = fireDangerData.message || dangerMessage;
      const count =
        typeof fireDangerData.incidentCount === "number" ? fireDangerData.incidentCount : undefined;

      updateEmergencyDisplays(level, message, count);
    }
  };

  // Initialize with default values
  updateEmergencyDisplays(dangerLevel, dangerMessage, incidentCount);
});
