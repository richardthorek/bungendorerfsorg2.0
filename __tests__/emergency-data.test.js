/**
 * Tests for public/js/emergency-data.js — the independent, Mapbox-free
 * incident data pipeline (WEBSITE_ROADMAP.md §2.1-2.3, Workstream 1).
 *
 * These tests exist specifically to lock in the "honest failure state"
 * behaviour: a fetch failure must never render as "0 incidents" / "no
 * current warning", and the Warning Level cell must reflect live data
 * instead of staying on its hard-coded default.
 */

global.DOMPurify = {
  sanitize: (html) => html,
};

function loadSourceFiles() {
  const fs = require("fs");
  const path = require("path");
  ["error-handler.js", "main.js", "emergency-data.js"].forEach((file) => {
    const code = fs.readFileSync(path.join(__dirname, "../public/js", file), "utf8");
    eval(code);
  });
}

function renderStripDOM() {
  document.body.innerHTML = `
    <section id="liveStatusStrip">
      <article id="incidentsStripCell" class="strip-cell strip-cell--incidents">
        <span id="incidentTotalCount">0</span>
        <div id="incidentCountCell"></div>
        <p id="incidentCountLabel">Checking for active incidents…</p>
      </article>
      <article id="warningStripCell" class="strip-cell strip-cell--warning" data-state="none">
        <div id="stripWarningLevel">Checking…</div>
        <p id="stripWarningLevelSub">Checking for current warnings…</p>
      </article>
      <div id="fireDangerRatingCell">HIGH</div>
      <p id="fireDangerMessage">Test message</p>
    </section>
    <span id="statusStripTimestamp">Checking for updates…</span>
    <div id="fireInfoTableContainer"></div>
  `;
}

function featureWithCategory(category, overrides = {}) {
  return {
    type: "Feature",
    properties: {
      title: overrides.title || "Test Incident",
      category,
      description:
        overrides.description ||
        "ALERT LEVEL: " +
          category +
          "<br/>LOCATION: Bungendore<br/>COUNCIL AREA: Queanbeyan-Palerang<br/>STATUS: Out of control<br/>",
    },
    geometry: { type: "Point", coordinates: [149.44, -35.25] },
  };
}

describe("emergency-data.js", () => {
  beforeEach(() => {
    jest.resetModules();
    renderStripDOM();
    loadSourceFiles();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("renders the honest degraded state on fetch failure, never 'no active incidents'", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(window.loadEmergencyData()).rejects.toThrow();

    const incidentsCell = document.getElementById("incidentsStripCell");
    const warningCell = document.getElementById("warningStripCell");
    const incidentCountLabel = document.getElementById("incidentCountLabel");
    const stripWarningLevel = document.getElementById("stripWarningLevel");
    const fireInfoTableContainer = document.getElementById("fireInfoTableContainer");

    expect(incidentsCell.getAttribute("data-state")).toBe("degraded");
    expect(warningCell.getAttribute("data-state")).toBe("degraded");
    expect(incidentCountLabel.textContent).not.toBe("No active incidents in our area");
    expect(incidentCountLabel.textContent).toMatch(/can't reach live fire data|000/i);
    expect(stripWarningLevel.textContent).toBe("Unknown");
    expect(fireInfoTableContainer.innerHTML).not.toContain("No active incidents in our area.");
    expect(fireInfoTableContainer.innerHTML).toMatch(/can't reach live fire data|000/i);
  });

  test("degraded state's honest '?' survives updateEmergencyDashboard — never silently overwritten to '0'", async () => {
    // Reproduces production script load order (error-handler, emergency-dashboard,
    // main, emergency-data, all deferred) so emergency-dashboard.js's
    // window.updateEmergencyDashboard is defined when renderDegraded() runs,
    // the same as in a real page load. The other tests in this file omit
    // emergency-dashboard.js, which is exactly why this regression wasn't
    // caught earlier: with updateEmergencyDashboard undefined, renderDegraded's
    // typeof-function guard short-circuits and the bug never manifests.
    // Mocked before the dashboard loads: dispatching DOMContentLoaded below
    // also re-fires emergency-data.js's own already-registered listener
    // (it self-bootstraps a fetch), so fetch must already be in place.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const fs = require("fs");
    const path = require("path");
    const dashboardCode = fs.readFileSync(
      path.join(__dirname, "../public/js/emergency-dashboard.js"),
      "utf8"
    );
    eval(dashboardCode);
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await expect(window.loadEmergencyData()).rejects.toThrow();

    expect(document.getElementById("incidentTotalCount").textContent).toBe("?");
  });

  test("wires the highest active category into the Warning Level cell (roadmap §2.2)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          featureWithCategory("Advice"),
          featureWithCategory("Emergency Warning"),
          featureWithCategory("Watch and Act"),
        ],
      }),
    });

    const result = await window.loadEmergencyData();

    const warningCell = document.getElementById("warningStripCell");
    const stripWarningLevel = document.getElementById("stripWarningLevel");

    expect(warningCell.getAttribute("data-state")).toBe("emergency-warning");
    expect(stripWarningLevel.textContent).toBe("Emergency Warning");
    expect(result.total).toBe(3);
  });

  test("Warning Level reads 'None' when there are genuinely no active incidents", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });

    await window.loadEmergencyData();

    const warningCell = document.getElementById("warningStripCell");
    const incidentCountLabel = document.getElementById("incidentCountLabel");

    expect(warningCell.getAttribute("data-state")).toBe("none");
    expect(document.getElementById("stripWarningLevel").textContent).toBe("None");
    expect(incidentCountLabel.textContent).toBe("No active incidents in our area");
  });

  test("reuses an in-flight fetch instead of issuing a second request (map.js relies on this)", async () => {
    let resolveFetch;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const first = window.loadEmergencyData();
    const second = window.loadEmergencyData();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    resolveFetch({ ok: true, json: async () => ({ features: [] }) });
    await first;
  });
});

describe("emergency-data.js — offline last-known-good (Bet 2, roadmap §4)", () => {
  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    renderStripDOM();
    loadSourceFiles();
  });

  afterEach(() => {
    delete global.fetch;
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  });

  test("saves last-known-good data to localStorage on a successful fetch", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [featureWithCategory("Advice")] }),
    });

    await window.loadEmergencyData();

    const saved = window.loadLastKnownGood();
    expect(saved).not.toBeNull();
    expect(saved.categoryCounts.Advice).toBe(1);
    expect(typeof saved.savedAt).toBe("number");
  });

  test("isLikelyOffline is true when navigator.onLine is false", () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    expect(window.isLikelyOffline(new Error("anything"))).toBe(true);
  });

  test("isLikelyOffline is true for a fetch TypeError even if onLine wrongly reports true", () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    const err = new TypeError("Failed to fetch");
    expect(window.isLikelyOffline(err)).toBe(true);
  });

  test("isLikelyOffline is false for an ordinary HTTP error while online", () => {
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    expect(window.isLikelyOffline(new Error("HTTP error! status: 500"))).toBe(false);
  });

  test("renders the honest offline state (not the generic degraded state) when offline with a cache", async () => {
    // Seed a last-known-good cache via a successful fetch first.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [featureWithCategory("Watch and Act")] }),
    });
    await window.loadEmergencyData();

    // Now simulate a subsequent offline fetch. Re-render the strip DOM and
    // re-eval the source so _lastLoadPromise doesn't just replay the cached
    // successful promise from the seed fetch above.
    renderStripDOM();
    loadSourceFiles();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(window.loadEmergencyData()).rejects.toThrow();

    const incidentsCell = document.getElementById("incidentsStripCell");
    const warningCell = document.getElementById("warningStripCell");
    const incidentCountLabel = document.getElementById("incidentCountLabel");
    const timestamp = document.getElementById("statusStripTimestamp");

    expect(incidentsCell.getAttribute("data-state")).toBe("offline");
    expect(warningCell.getAttribute("data-state")).toBe("offline");
    expect(incidentCountLabel.textContent).toMatch(/offline/i);
    expect(incidentCountLabel.textContent).not.toMatch(/can't reach live fire data/i);
    expect(timestamp.textContent).toMatch(/offline/i);
  });

  test("falls back to the generic degraded state when offline with no cache yet", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(window.loadEmergencyData()).rejects.toThrow();

    const incidentsCell = document.getElementById("incidentsStripCell");
    expect(incidentsCell.getAttribute("data-state")).toBe("degraded");
  });

  test("a response the service worker silently served from its own cache is never rendered as a fresh live read", async () => {
    // Seed a last-known-good cache via a genuinely live fetch first, same as
    // the offline test above.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ features: [featureWithCategory("Watch and Act")] }),
    });
    await window.loadEmergencyData();

    // Now simulate sw.js's networkFirstWithCacheFallback: the network was
    // unreachable, but the fetch() call from this page's point of view still
    // resolves "successfully" with a response the service worker served
    // from its own HTTP cache, tagged with X-SW-Served-From. Without the
    // guard in fetchIncidentGeoJSON(), this would be indistinguishable from
    // a genuinely fresh read and rendered as live/current.
    renderStripDOM();
    loadSourceFiles();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (name) => (name === "X-SW-Served-From" ? "cache" : null) },
      json: async () => ({ features: [featureWithCategory("Emergency Warning")] }),
    });

    await expect(window.loadEmergencyData()).rejects.toThrow();

    const incidentsCell = document.getElementById("incidentsStripCell");
    const warningCell = document.getElementById("warningStripCell");
    const stripWarningLevel = document.getElementById("stripWarningLevel");

    // Must render the honest offline state using the last genuinely-live
    // data (Watch and Act), never the SW-cache-served body (Emergency
    // Warning) presented as if it were a fresh, confirmed read.
    expect(incidentsCell.getAttribute("data-state")).toBe("offline");
    expect(warningCell.getAttribute("data-state")).toBe("offline");
    expect(stripWarningLevel.textContent).toBe("Watch and Act");
  });
});
