/**
 * BOM live wind/temp/humidity observations, Canberra Airport
 * (WEBSITE_ROADMAP.md §3, Workstream 7 — "wind is the missing fire-behaviour
 * driver"). Renders as a small sub-label under the Fire Danger strip cell.
 *
 * Honest-failure-state (§2.1): a failed fetch renders an explicit "unavailable"
 * message, never a blank line or a stale-looking number that could pass for
 * calm conditions.
 */

const WIND_OBSERVATIONS_REFRESH_MS = 5 * 60 * 1000;
const WIND_DEGRADED_MESSAGE = "Wind data unavailable";

function renderWindObservations(data) {
  const el = document.getElementById("windObservationsSub");
  if (!el) return;

  const windSpeed = data && typeof data.windSpeedKmh === "number" ? data.windSpeedKmh : null;
  const windDir = data && data.windDirection;
  const gust = data && typeof data.windGustKmh === "number" ? data.windGustKmh : null;
  const temp = data && typeof data.airTempC === "number" ? data.airTempC : null;
  const humidity =
    data && typeof data.relativeHumidityPct === "number" ? data.relativeHumidityPct : null;

  // Only rewrite when the text changes: this sits in the live strip, and an
  // identical rewrite is re-announced by screen readers on every poll.
  if (windSpeed === null && temp === null && humidity === null) {
    if (el.textContent !== WIND_DEGRADED_MESSAGE) el.textContent = WIND_DEGRADED_MESSAGE;
    el.removeAttribute("data-state");
    return;
  }

  const parts = [];
  if (windSpeed !== null) {
    parts.push(
      "Wind " +
        windSpeed +
        " km/h" +
        (windDir ? " " + windDir : "") +
        (gust !== null ? " (gusts " + gust + ")" : "")
    );
  }
  if (temp !== null) parts.push(temp + "°C");
  if (humidity !== null) parts.push(humidity + "% humidity");

  const text = parts.join(" · ") + " (Canberra Airport)";
  if (el.textContent !== text) el.textContent = text;
  el.setAttribute("data-state", "ok");
}

function fetchWindObservations() {
  return fetch(getApiBaseUrl() + "/api/wind-observations")
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP error! status: " + response.status);
      return response.json();
    })
    .then(function (data) {
      renderWindObservations(data);
    })
    .catch(function (error) {
      console.error("Error fetching wind observations:", getUserFriendlyErrorMessage(error));
      renderWindObservations(null);
    });
}

let windLastFetchAt = 0;

function refreshWindObservations() {
  windLastFetchAt = Date.now();
  return fetchWindObservations();
}

document.addEventListener("DOMContentLoaded", function () {
  refreshWindObservations();
  window.setInterval(refreshWindObservations, WIND_OBSERVATIONS_REFRESH_MS);
  // Catch up when the tab returns: phones suspend timers in the background.
  document.addEventListener("visibilitychange", function () {
    if (
      document.visibilityState === "visible" &&
      Date.now() - windLastFetchAt >= WIND_OBSERVATIONS_REFRESH_MS
    ) {
      refreshWindObservations();
    }
  });
});
