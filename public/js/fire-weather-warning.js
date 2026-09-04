/**
 * BOM Fire Weather Warning banner (WEBSITE_ROADMAP.md §3, Workstream 7).
 *
 * Honest-failure-state (§2.1, same principle as public/js/emergency-data.js):
 * the banner is hidden by default. It is only ever shown when the API
 * positively confirms a live "Southern Ranges" warning (`hasWarning: true`).
 * A fetch error must never flip it to visible — that would be indistinguishable
 * from a real warning — and the absence of a warning is the normal, expected
 * state for this feed (BOM's IDN22000 bulletin is empty when nothing is
 * current), not an error to surface to the user.
 */

const FIRE_WEATHER_WARNING_REFRESH_MS = 5 * 60 * 1000;

function renderFireWeatherWarning(data) {
  const banner = document.getElementById("fireWeatherWarningBanner");
  const textEl = document.getElementById("fireWeatherWarningText");
  if (!banner || !textEl) return;

  if (data && data.hasWarning) {
    textEl.textContent = data.text || "A Fire Weather Warning is current for this district.";
    banner.hidden = false;
  } else {
    banner.hidden = true;
    textEl.textContent = "";
  }
}

function fetchFireWeatherWarning() {
  return fetch(getApiBaseUrl() + "/api/fire-weather-warning")
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP error! status: " + response.status);
      return response.json();
    })
    .then(function (data) {
      renderFireWeatherWarning(data);
    })
    .catch(function (error) {
      // Fetch failure: leave/keep the banner hidden. This is a deliberate
      // asymmetry with the strip's degraded-state pattern — a hidden banner
      // reads as "nothing to report", which is safe here because the
      // authoritative warning is always also available via Hazards Near Me
      // (linked in the strip's trust line); a *false positive* banner would
      // be actively misleading, so on doubt we say nothing rather than guess.
      console.error("Error fetching fire weather warning:", getUserFriendlyErrorMessage(error));
    });
}

document.addEventListener("DOMContentLoaded", function () {
  fetchFireWeatherWarning();
  window.setInterval(fetchFireWeatherWarning, FIRE_WEATHER_WARNING_REFRESH_MS);
});
