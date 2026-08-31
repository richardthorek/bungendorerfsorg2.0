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
