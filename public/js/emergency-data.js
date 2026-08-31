/* exported loadEmergencyData, filterFeaturesForEnvironment, computeCategoryCounts */

/**
 * Independent emergency-data pipeline (WEBSITE_ROADMAP.md §2.1-2.3, Workstream 1).
 *
 * This is the single source of truth for "what's the current incident
 * picture", and it has no dependency on Mapbox GL. The map is a progressive
 * enhancement layered on top of this data (see map.js) — on a congested
 * connection, an old phone, or a screen reader, this module alone still
 * renders the honest text list, the incident count and the warning level.
 *
 * A failed fetch is rendered as an explicit degraded state and must never be
 * allowed to look like "0 incidents" / "no current warning".
 */

const EMERGENCY_REFRESH_MS = 3 * 60 * 1000; // within the roadmap's 2-5 min target
const DEGRADED_MESSAGE =
  "We can't reach live fire data right now — check Hazards Near Me or call 000.";

let _lastLoadPromise = null;

// ─── Filtering (moved from map.js so it has no Mapbox dependency) ────────────

function filterFeaturesForEnvironment(features) {
  const hostname = window.location.hostname;
  const isTest =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".githubpreview.dev") ||
    hostname.endsWith(".app.github.dev") ||
    hostname.includes("lively-flower-0577f4700-livedev");

  if (isTest) return features;

  return features.filter(function (feature) {
    const desc = (feature.properties && feature.properties.description) || "";
    return desc.includes("COUNCIL AREA: Queanbeyan-Palerang") || desc.includes("COUNCIL AREA: ACT");
  });
}

// ─── Category counting ────────────────────────────────────────────────────────

function computeCategoryCounts(features) {
  const counts = { Other: 0, Advice: 0, "Watch and Act": 0, "Emergency Warning": 0 };
  features.forEach(function (feature) {
    const category = (feature.properties && feature.properties.category) || "";
    if (category.includes("Emergency Warning")) counts["Emergency Warning"]++;
    else if (category.includes("Watch and Act")) counts["Watch and Act"]++;
    else if (category.includes("Advice")) counts.Advice++;
    else counts.Other++;
  });
  return counts;
}

function totalFromCounts(counts) {
  return counts["Emergency Warning"] + counts["Watch and Act"] + counts.Advice + counts.Other;
}

/**
 * The most severe active category becomes the Warning Level cell (§2.2).
 * Previously this cell was a hard-coded "None" that no code ever updated.
 */
function highestWarningState(counts) {
  if (counts["Emergency Warning"] > 0) {
    return {
      state: "emergency-warning",
      label: "Emergency Warning",
      sub: "Act immediately — follow your bushfire survival plan or the advice of emergency services.",
    };
  }
  if (counts["Watch and Act"] > 0) {
    return {
      state: "watch-and-act",
      label: "Watch and Act",
      sub: "Conditions are changing — prepare to leave if it becomes unsafe to stay.",
    };
  }
  if (counts.Advice > 0) {
    return {
      state: "advice",
      label: "Advice",
      sub: "A fire has started nearby — stay informed and monitor conditions.",
    };
  }
  return { state: "none", label: "None", sub: "No current warning" };
}

// ─── Rendering ─────────────────────────────────────────────────────────────────

function renderIncidentSummary(categoryCounts) {
  const total = totalFromCounts(categoryCounts);
  const incidentsCell = document.getElementById("incidentsStripCell");
  const incidentTotalCount = document.getElementById("incidentTotalCount");
  const incidentCountCell = document.getElementById("incidentCountCell");
  const incidentCountLabel = document.getElementById("incidentCountLabel");

  if (incidentsCell) incidentsCell.removeAttribute("data-state");
  if (incidentTotalCount) incidentTotalCount.textContent = String(total);

  const rows = [
    ["Emergency Warning", "/Images/emergency-warning.png"],
    ["Watch and Act", "/Images/watch-and-act.png"],
    ["Advice", "/Images/advice.png"],
    ["Other", "/Images/other.png"],
  ]
    .filter(function (pair) {
      return categoryCounts[pair[0]] > 0;
    })
    .map(function (pair) {
      return (
        "<tr><td><img src=\"" + pair[1] + "\" alt=\"" + pair[0] + "\" /></td><td>" +
        categoryCounts[pair[0]] + "</td></tr>"
      );
    })
    .join("");

  if (incidentCountCell) {
    incidentCountCell.innerHTML = total === 0 ? "" : DOMPurify.sanitize("<table>" + rows + "</table>");
  }

  if (incidentCountLabel) {
    incidentCountLabel.textContent =
      total === 0 ? "No active incidents in our area" : "Current incidents in our area";
  }
}

function renderWarningLevel(categoryCounts) {
  const warningCell = document.getElementById("warningStripCell");
  const stripWarningLevel = document.getElementById("stripWarningLevel");
  const stripWarningLevelSub = document.getElementById("stripWarningLevelSub");
  const state = highestWarningState(categoryCounts);

  if (warningCell) warningCell.setAttribute("data-state", state.state);
  if (stripWarningLevel) stripWarningLevel.textContent = state.label;
  if (stripWarningLevelSub) stripWarningLevelSub.textContent = state.sub;
}

function renderTimestamp(success) {
  const el = document.getElementById("statusStripTimestamp");
  if (!el) return;

  if (!success) {
    el.textContent = "Last check failed — data below may be out of date";
    return;
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.textContent = "Updated " + hh + ":" + mm;
}

/**
 * Honest degraded state (§2.1). Applied to every surface this module owns —
 * the incident count, the warning level, and the text list — so a fetch
 * failure can never be mistaken for "nothing is happening".
 */
function renderDegraded() {
  const incidentsCell = document.getElementById("incidentsStripCell");
  const warningCell = document.getElementById("warningStripCell");
  const incidentTotalCount = document.getElementById("incidentTotalCount");
  const incidentCountCell = document.getElementById("incidentCountCell");
  const incidentCountLabel = document.getElementById("incidentCountLabel");
  const stripWarningLevel = document.getElementById("stripWarningLevel");
  const stripWarningLevelSub = document.getElementById("stripWarningLevelSub");

  if (incidentsCell) incidentsCell.setAttribute("data-state", "degraded");
  if (warningCell) warningCell.setAttribute("data-state", "degraded");
  if (incidentTotalCount) incidentTotalCount.textContent = "?";
  if (incidentCountCell) incidentCountCell.innerHTML = "";
  if (incidentCountLabel) incidentCountLabel.textContent = DEGRADED_MESSAGE;
  if (stripWarningLevel) stripWarningLevel.textContent = "Unknown";
  if (stripWarningLevelSub) stripWarningLevelSub.textContent = DEGRADED_MESSAGE;

  if (typeof populateFireInfoTable === "function") {
    populateFireInfoTable({ error: DEGRADED_MESSAGE });
  }

  if (typeof window.updateEmergencyDashboard === "function") {
    const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
    window.updateEmergencyDashboard({
      dangerLevel: (fireDangerRatingCell && fireDangerRatingCell.textContent) || "NO RATING",
      message: DEGRADED_MESSAGE,
      incidentCount: 0,
      incidents: [],
    });
  }
}

// ─── Fetch + orchestration ────────────────────────────────────────────────────

function fetchIncidentGeoJSON() {
  return fetch(getApiBaseUrl() + "/api/fire-incidents", {
    method: "GET",
    headers: {
      "X-Request-ID": "Get-Fire-Incidents",
      "Content-Type": "application/json",
    },
  }).then(function (response) {
    if (!response.ok) throw new Error("HTTP error! status: " + response.status);
    return response.json();
  });
}

function _fetchAndRender() {
  const promise = fetchIncidentGeoJSON()
    .then(function (data) {
      const features = Array.isArray(data && data.features) ? data.features : [];
      const filteredFeatures = filterFeaturesForEnvironment(features);
      const categoryCounts = computeCategoryCounts(filteredFeatures);
      const total = totalFromCounts(categoryCounts);

      populateFireInfoTable({ features: filteredFeatures });
      renderIncidentSummary(categoryCounts);
      renderWarningLevel(categoryCounts);
      renderTimestamp(true);

      if (typeof window.updateEmergencyDashboard === "function") {
        const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
        const fireDangerMessage = document.getElementById("fireDangerMessage");
        const incidentsList = filteredFeatures.slice(0, 5).map(function (feature) {
          const fields =
            typeof window.extractFields === "function"
              ? window.extractFields((feature.properties && feature.properties.description) || "")
              : {};
          return {
            title: (feature.properties && feature.properties.title) || "Incident",
            status: fields.status || fields.alertlevel || "Unknown",
            location: fields.location || "Unknown location",
          };
        });

        window.updateEmergencyDashboard({
          dangerLevel: (fireDangerRatingCell && fireDangerRatingCell.textContent) || "MODERATE",
          message: (fireDangerMessage && fireDangerMessage.textContent) || "Plan and prepare for fires in your area",
          incidentCount: total,
          incidents: incidentsList,
        });
      }

      return { filteredFeatures: filteredFeatures, categoryCounts: categoryCounts, total: total, raw: data };
    })
    .catch(function (error) {
      console.error("Error fetching fire incident data:", getUserFriendlyErrorMessage(error));
      renderDegraded();
      renderTimestamp(false);
      throw error;
    });

  _lastLoadPromise = promise;
  return promise;
}

/**
 * Returns the current (or most recently started) emergency-data fetch,
 * starting a new one if none is in flight. map.js calls this to get the
 * same data used for the text list, instead of fetching a second time.
 */
function loadEmergencyData() {
  if (_lastLoadPromise) return _lastLoadPromise;
  return _fetchAndRender();
}

// _fetchAndRender() already renders the degraded state and logs on failure;
// these two call sites don't consume the result, so they must swallow the
// rejection themselves or it surfaces as a spurious unhandled-promise-rejection
// console error on every failed fetch (map.js's own call site, which does use
// the result, still gets the rejection via loadEmergencyData()).
function noop() {}

document.addEventListener("DOMContentLoaded", function () {
  loadEmergencyData().catch(noop);
  window.setInterval(function () {
    _fetchAndRender().catch(noop);
  }, EMERGENCY_REFRESH_MS);
});

window.loadEmergencyData = loadEmergencyData;
window.filterFeaturesForEnvironment = filterFeaturesForEnvironment;
window.computeCategoryCounts = computeCategoryCounts;
