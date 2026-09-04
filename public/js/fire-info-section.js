/**
 * Fire Information now lives in its own collapsed-by-default section rather
 * than a tab, so it can't duplicate the KPI tiles already in the live status
 * strip above it. Auto-expands the one time a real incident count arrives
 * (bungendore:incident-count, dispatched by emergency-dashboard.js); a
 * manual toggle is always available regardless of that state.
 */
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("fireInfoToggle");
  const detail = document.getElementById("fireInfoDetail");
  const summaryText = document.getElementById("fireInfoSummaryText");
  if (!toggle || !detail || !summaryText) return;

  let autoExpanded = false;

  function setExpanded(expanded) {
    detail.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
  }

  toggle.addEventListener("click", () => {
    setExpanded(detail.hidden);
  });

  document.addEventListener("bungendore:incident-count", (event) => {
    const count = event.detail && event.detail.count;
    if (typeof count !== "number") return;

    summaryText.textContent =
      count > 0
        ? `Fire Information — ${count} active incident${count === 1 ? "" : "s"} in our area.`
        : "Fire Information — No active incidents in our area.";

    // Only force it open the first time a live incident shows up — once a
    // visitor has manually collapsed it again, don't fight them on every
    // subsequent refresh of the same ongoing incident.
    if (count > 0 && !autoExpanded) {
      autoExpanded = true;
      setExpanded(true);
    }
  });
});
