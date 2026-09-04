/* exported loadAlertBanner */

/**
 * Admin-published alert banner (WEBSITE_ROADMAP.md §4, "Bet 3").
 *
 * A short, human-written line the brigade can publish from the members'
 * area (see public/js/admin.js) that renders near the top of the public
 * live status strip — e.g. "Brigade update 2:40pm — crews are backburning
 * off Bungendore Rd, expect smoke and appliances, road remains open."
 *
 * This is additive content, not part of the honest-failure-state system in
 * emergency-data.js: a missing/failed banner fetch is not a safety issue
 * the way missing fire data is, so on error this fails silently (console
 * only) and simply leaves the banner hidden — never a degraded state.
 *
 * Independent of Mapbox, same pattern as emergency-data.js.
 */

function renderAlertBanner(items) {
  const wrap = document.getElementById("alertBanner");
  const textEl = document.getElementById("alertBannerText");
  if (!wrap || !textEl) return;

  const current = Array.isArray(items) && items.length ? items[0] : null;
  if (!current || !current.message) {
    wrap.hidden = true;
    wrap.removeAttribute("data-severity");
    textEl.innerHTML = "";
    return;
  }

  const severity = current.severity === "warning" ? "warning" : "info";
  wrap.setAttribute("data-severity", severity);
  // Sanitised even though this only ever comes from an authenticated admin
  // save — CLAUDE.md's DOMPurify rule has no exceptions.
  textEl.innerHTML = DOMPurify.sanitize(String(current.message));
  wrap.hidden = false;
}

function fetchAlertBanner() {
  return fetch(getApiBaseUrl() + "/api/content/alertBanner", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }).then(function (response) {
    if (!response.ok) throw new Error("HTTP error! status: " + response.status);
    return response.json();
  });
}

function loadAlertBanner() {
  return fetchAlertBanner()
    .then(function (items) {
      renderAlertBanner(Array.isArray(items) ? items : []);
    })
    .catch(function (error) {
      // Fail silently — see module comment. Never show a degraded state for
      // this; just leave the banner hidden.
      console.error("Could not load the alert banner:", error);
    });
}

// Same refresh cadence as emergency-data.js — without this, a visitor who
// already has the page open would never see a banner published (or cleared)
// after their page loaded, undermining the whole point of a fast, human
// update during an active situation.
const ALERT_BANNER_REFRESH_MS = 3 * 60 * 1000;

document.addEventListener("DOMContentLoaded", function () {
  loadAlertBanner();
  window.setInterval(loadAlertBanner, ALERT_BANNER_REFRESH_MS);
});

window.loadAlertBanner = loadAlertBanner;
