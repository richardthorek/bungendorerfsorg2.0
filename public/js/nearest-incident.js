/**
 * Nearest incident distance — opt-in only (scoped down from
 * WEBSITE_ROADMAP.md §4 "Bet 1"; the fuller synthesized "Fire Situation"
 * verdict was judged too much unverified, AI-composed guidance for an
 * emergency-info site and dropped). This shows a distance figure and the
 * incident's own official RFS feed fields — nothing generated or
 * interpreted.
 *
 * Hard rules:
 *   - No geolocation prompt until the resident clicks the button. Never
 *     requested automatically on page load.
 *   - No fallback location guessing (IP geolocation etc.) if permission is
 *     denied or unavailable — the feature just isn't shown.
 *   - Reuses the same incident data emergency-data.js already fetched (via
 *     window.loadEmergencyData()) — no new network request, no new backend.
 */

/** Minimal copy of map.js's getFeatureCoordinates so this has no dependency
 *  on Mapbox having loaded (map.js is a progressive enhancement — this
 *  module must work whether or not it ever runs). */
function getPointCoordinates(feature) {
  if (!feature || !feature.geometry) return null;
  if (feature.geometry.type === "Point") return feature.geometry.coordinates;
  if (feature.geometry.type === "GeometryCollection") {
    const pt = feature.geometry.geometries.find(function (g) {
      return g.type === "Point" && Array.isArray(g.coordinates);
    });
    return pt ? pt.coordinates : null;
  }
  return null;
}

/** Haversine great-circle distance in km between two [lon, lat] pairs. */
function distanceKm(a, b) {
  const toRad = function (deg) {
    return (deg * Math.PI) / 180;
  };
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function findNearestIncident(userCoords, features) {
  let nearest = null;
  let nearestDistanceKm = Infinity;

  features.forEach(function (feature) {
    const coords = getPointCoordinates(feature);
    if (!coords) return;
    const km = distanceKm(userCoords, coords);
    if (km < nearestDistanceKm) {
      nearestDistanceKm = km;
      nearest = feature;
    }
  });

  return nearest ? { feature: nearest, distanceKm: nearestDistanceKm } : null;
}

function renderResult(text) {
  const resultEl = document.getElementById("nearestIncidentResult");
  if (!resultEl) return;
  resultEl.textContent = text;
  resultEl.hidden = false;
}

function handleFindNearestClick() {
  const btn = document.getElementById("nearestIncidentBtn");
  if (btn) btn.disabled = true;
  renderResult("Getting your location…");

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const userCoords = [position.coords.longitude, position.coords.latitude];

      window
        .loadEmergencyData()
        .then(function (result) {
          const features = (result && result.filteredFeatures) || [];
          if (features.length === 0) {
            renderResult("No active incidents in our area right now.");
            return;
          }

          const nearest = findNearestIncident(userCoords, features);
          if (!nearest) {
            renderResult("Couldn't determine incident locations right now.");
            return;
          }

          const props = nearest.feature.properties || {};
          const fields =
            typeof window.extractFields === "function"
              ? window.extractFields(props.description || "")
              : {};
          const title = props.title || "Incident";
          const location = fields.location && fields.location !== "N/A" ? fields.location : null;
          const status = fields.status && fields.status !== "N/A" ? fields.status : null;

          const parts = [nearest.distanceKm.toFixed(1) + " km away: " + title];
          if (location) parts.push(location);
          if (status) parts.push(status);
          renderResult(parts.join(" — "));
        })
        .catch(function () {
          renderResult("Couldn't load incident data right now.");
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    },
    function () {
      // Denied, unavailable, or timed out — no fallback guessing, just say so.
      renderResult("Location unavailable.");
      if (btn) btn.disabled = false;
    },
    { timeout: 10000 }
  );
}

document.addEventListener("DOMContentLoaded", function () {
  const btn = document.getElementById("nearestIncidentBtn");
  if (!btn) return;

  // Feature-detected: the button only ever appears if geolocation exists on
  // this device/browser at all, and clicking it is the only thing that ever
  // triggers the permission prompt.
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    btn.hidden = false;
    btn.addEventListener("click", handleFindNearestClick);
  }
});
