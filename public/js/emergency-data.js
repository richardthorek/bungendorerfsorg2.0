/* exported loadEmergencyData, filterFeaturesForEnvironment, computeCategoryCounts,
   saveLastKnownGood, loadLastKnownGood, isLikelyOffline */

/**
 * Independent emergency-data pipeline (WEBSITE_ROADMAP.md §2.1-2.3, Workstream 1;
 * offline handling is Bet 2, §4).
 *
 * This is the single source of truth for "what's the current incident
 * picture", and it has no dependency on Mapbox GL. The map is a progressive
 * enhancement layered on top of this data (see map.js) — on a congested
 * connection, an old phone, or a screen reader, this module alone still
 * renders the honest text list, the incident count and the warning level.
 *
 * A failed fetch is rendered as an explicit degraded state and must never be
 * allowed to look like "0 incidents" / "no current warning".
 *
 * Offline handling (Bet 2): a fully offline client can't reach the server at
 * all, so the server-side last-known-good cache in api/shared/fireDataProxy.js
 * never gets a chance to help — this module keeps its OWN last-known-good
 * copy in localStorage (belt-and-braces alongside the service worker's HTTP
 * cache in sw.js) purely so it can label what it's showing honestly. When a
 * fetch fails AND the browser looks offline (or the failure looks like a
 * network-level failure, not an HTTP error from a reachable server), and a
 * cached payload exists, that takes priority over the generic degraded
 * state: same amber caution styling, but a specific "you may be offline, as
 * at [time]" message instead of "we can't reach live data".
 */

const EMERGENCY_REFRESH_MS = 3 * 60 * 1000; // within the roadmap's 2-5 min target
const DEGRADED_MESSAGE =
  "We can't reach live fire data right now — check Hazards Near Me or call 000.";
const LAST_KNOWN_GOOD_KEY = "bungendore-rfs:last-known-good";

let _lastLoadPromise = null;

// ─── Last-known-good persistence (client-side, Bet 2) ─────────────────────────

/**
 * Persist the data just used for a successful render so an offline visit can
 * fall back to it. Wrapped in try/catch: localStorage can throw (private
 * browsing quota, disabled storage) and that must never break a live render.
 */
function saveLastKnownGood(categoryCounts, filteredFeatures) {
  try {
    const payload = {
      categoryCounts: categoryCounts,
      filteredFeatures: filteredFeatures,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(LAST_KNOWN_GOOD_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Could not save last-known-good emergency data:", error);
  }
}

// How old a client-side last-known-good payload can be before it's refused
// rather than shown. Matches fireDataProxy.js's own server-side staleness
// ceiling — past this, "last known" is more likely wrong than merely late,
// which is worse than the honest degraded state. Without this, a resident
// who last visited weeks ago and opens the site while offline would see a
// long-since-ended incident/warning rendered as "showing data from HH:MM",
// which reads as today.
const LAST_KNOWN_GOOD_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * @returns {{categoryCounts: object, filteredFeatures: Array, savedAt: number} | null}
 */
function loadLastKnownGood() {
  try {
    const raw = window.localStorage.getItem(LAST_KNOWN_GOOD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.categoryCounts) return null;
    if (Date.now() - parsed.savedAt > LAST_KNOWN_GOOD_MAX_AGE_MS) return null;
    return parsed;
  } catch (error) {
    console.warn("Could not read last-known-good emergency data:", error);
    return null;
  }
}

/**
 * Best-effort signal that a fetch failure is because THIS device is offline,
 * rather than the server being unreachable/erroring while the device itself
 * has a working connection. `navigator.onLine` is the strongest signal when
 * available (and false is fairly reliable — true is not, browsers can lie
 * optimistically); a fetch TypeError ("Failed to fetch") is the browser's own
 * generic network-layer failure text and is what a DNS/timeout/offline fetch
 * throws, as opposed to an HTTP error status from a server that did respond.
 */
function isLikelyOffline(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return (
    Boolean(error) && error.name === "TypeError" && /failed to fetch/i.test(error.message || "")
  );
}

function formatLastKnownGoodTime(savedAt) {
  const d = new Date(savedAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  // Bare "14:23" reads as today even when it isn't — spell out the date once
  // the payload is old enough to have crossed midnight, so a stale reading
  // can never be mistaken for a same-day one.
  if (isToday) return hh + ":" + mm;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return day + "/" + month + " " + hh + ":" + mm;
}

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
        "<tr><td><img src=\"" +
        pair[1] +
        "\" alt=\"" +
        pair[0] +
        "\" /></td><td>" +
        categoryCounts[pair[0]] +
        "</td></tr>"
      );
    })
    .join("");

  if (incidentCountCell) {
    incidentCountCell.innerHTML =
      total === 0 ? "" : DOMPurify.sanitize("<table>" + rows + "</table>");
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
 * Bet 2 offline timestamp: explicitly says "you may be offline" rather than
 * the generic "last check failed" — a different, more specific message
 * because we actually have data to show, just not fresh data.
 */
function renderTimestampOffline(savedAt) {
  const el = document.getElementById("statusStripTimestamp");
  if (!el) return;
  el.textContent =
    "You appear to be offline — showing data from " + formatLastKnownGoodTime(savedAt);
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
      incidents: [],
      // Deliberately no incidentCount: updateEmergencyDashboard's typeof-number
      // guard treats an explicit 0 as a real reading and overwrites the "?"
      // set above with "0" — silently reintroducing the exact "0 = all clear"
      // failure state this whole pipeline exists to prevent.
    });
  }
}

/**
 * Offline last-known-good state (Bet 2, roadmap §4). Renders the same
 * surfaces as a live fetch, using the cached data, but every label makes
 * clear this is NOT live: an honest "as at [time], you may be offline"
 * rather than either a silent live-looking render or the generic degraded
 * "can't reach live data" message (which reads as a server problem, not an
 * on-device connectivity one — residents in a real outage should recognise
 * their own situation, not wonder if the brigade's site is broken).
 */
function renderOffline(cached) {
  const categoryCounts = cached.categoryCounts;
  const total = totalFromCounts(categoryCounts);
  const offlineNote =
    "You appear to be offline — showing the last data loaded at " +
    formatLastKnownGoodTime(cached.savedAt) +
    ".";

  renderIncidentSummary(categoryCounts);
  renderWarningLevel(categoryCounts);

  const incidentsCell = document.getElementById("incidentsStripCell");
  const warningCell = document.getElementById("warningStripCell");
  const incidentCountLabel = document.getElementById("incidentCountLabel");
  const stripWarningLevelSub = document.getElementById("stripWarningLevelSub");

  // data-state="offline" is applied AFTER renderIncidentSummary/renderWarningLevel
  // so it overrides their own data-state writes (e.g. "none"/"advice") —
  // the cached numbers are shown, but the cell styling and sub-copy must
  // always foreground "this is stale/offline", never look like a live calm
  // or live escalated state.
  if (incidentsCell) incidentsCell.setAttribute("data-state", "offline");
  if (warningCell) warningCell.setAttribute("data-state", "offline");
  if (incidentCountLabel) incidentCountLabel.textContent = offlineNote;
  if (stripWarningLevelSub) stripWarningLevelSub.textContent = offlineNote;

  if (typeof populateFireInfoTable === "function") {
    populateFireInfoTable({
      features: Array.isArray(cached.filteredFeatures) ? cached.filteredFeatures : [],
    });
  }

  if (typeof window.updateEmergencyDashboard === "function") {
    const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
    window.updateEmergencyDashboard({
      dangerLevel: (fireDangerRatingCell && fireDangerRatingCell.textContent) || "NO RATING",
      message: offlineNote,
      incidentCount: total,
      incidents: [],
    });
  }

  renderTimestampOffline(cached.savedAt);
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
    // sw.js's networkFirstWithCacheFallback tags a response with this header
    // when the network was actually unreachable and it silently served its
    // own cached copy instead — from this page's point of view that fetch()
    // call still "succeeded", so without this check the data below would be
    // rendered as a fresh, live read. Treat it exactly like a network
    // failure instead (see the .catch() below), which already knows how to
    // render the honest offline/degraded state — that's a deliberate reuse,
    // not a hack: a service-worker cache fallback and an on-device offline
    // fetch failure are the same "not actually live" situation from here.
    if (response.headers && response.headers.get("X-SW-Served-From") === "cache") {
      const swCacheError = new Error("Failed to fetch");
      swCacheError.name = "TypeError";
      throw swCacheError;
    }
    // api/shared/fireDataProxy.js's own stale-while-revalidate cache can
    // return a successful HTTP 200 carrying data from up to 30 minutes ago
    // (X-Data-Freshness: stale), when ITS upstream fetch failed but a
    // recent-enough cached copy existed server-side. That's a real HTTP
    // success, not a network error, but it is exactly as "not actually
    // live" as the service-worker cache case above — same treatment.
    if (response.headers && response.headers.get("X-Data-Freshness") === "stale") {
      const staleCacheError = new Error("Failed to fetch");
      staleCacheError.name = "TypeError";
      throw staleCacheError;
    }
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
      saveLastKnownGood(categoryCounts, filteredFeatures);

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
          message:
            (fireDangerMessage && fireDangerMessage.textContent) ||
            "Plan and prepare for fires in your area",
          incidentCount: total,
          incidents: incidentsList,
        });
      }

      return {
        filteredFeatures: filteredFeatures,
        categoryCounts: categoryCounts,
        total: total,
        raw: data,
      };
    })
    .catch(function (error) {
      console.error("Error fetching fire incident data:", getUserFriendlyErrorMessage(error));

      // Bet 2: an offline-looking failure with a cached last-known-good
      // payload gets the honest "you may be offline, as at [time]" render
      // instead of the generic "can't reach live data" degraded state —
      // tried first, and only falls through to renderDegraded() if there's
      // no cache yet (e.g. first-ever visit happens to be offline) or the
      // failure doesn't look like an on-device connectivity problem.
      const cached = isLikelyOffline(error) ? loadLastKnownGood() : null;
      if (cached) {
        renderOffline(cached);
      } else {
        renderDegraded();
        renderTimestamp(false);
      }
      // A rejected promise must not be cached: map.js calls loadEmergencyData()
      // exactly once, from inside map.on("load"). If that single call ever
      // landed on this rejected promise (a realistic race — a transient
      // upstream blip resolves in ~100ms, Mapbox can take seconds to boot),
      // the map's markers would stay empty for the rest of the session even
      // after the text strip self-heals on the next refresh, since a
      // .then/.catch chain binds to that specific promise instance, not to
      // whatever this variable holds later.
      _lastLoadPromise = null;
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
window.saveLastKnownGood = saveLastKnownGood;
window.loadLastKnownGood = loadLastKnownGood;
window.isLikelyOffline = isLikelyOffline;
