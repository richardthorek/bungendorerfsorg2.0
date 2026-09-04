/**
 * Tests for public/js/nearest-incident.js — opt-in nearest-incident distance
 * (WEBSITE_ROADMAP.md §4, scoped down from "Bet 1"). Covers the pure
 * distance/selection logic only; the geolocation-prompt gating is a thin
 * DOM/browser-API wrapper around it.
 */

function loadSource() {
  const fs = require("fs");
  const path = require("path");
  const code = fs.readFileSync(path.join(__dirname, "../public/js/nearest-incident.js"), "utf8");
  eval(code);
  global.distanceKm = distanceKm;
  global.findNearestIncident = findNearestIncident;
}

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = "";
  loadSource();
});

function pointFeature(lon, lat) {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {} };
}

describe("nearest-incident.js pure logic", () => {
  test("distanceKm(a, a) is ~0", () => {
    const a = [149.44, -35.25];
    expect(distanceKm(a, a)).toBeCloseTo(0, 5);
  });

  test("findNearestIncident picks the closer of two features", () => {
    const user = [149.44, -35.25];
    const near = pointFeature(149.45, -35.26); // close
    const far = pointFeature(150.9, -34.4); // ~150km+ away (Sydney-ish)
    const result = findNearestIncident(user, [far, near]);
    expect(result.feature).toBe(near);
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.distanceKm).toBeLessThan(5);
  });

  test("findNearestIncident returns null when no feature has usable point coordinates", () => {
    const polygonOnly = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [] },
      properties: {},
    };
    expect(findNearestIncident([149.44, -35.25], [polygonOnly])).toBeNull();
  });

  test("the opt-in button stays hidden without navigator.geolocation", () => {
    document.body.innerHTML = '<button id="nearestIncidentBtn" hidden></button>';
    Object.defineProperty(window.navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(document.getElementById("nearestIncidentBtn").hidden).toBe(true);
  });

  test("clicking never fires without an explicit click — no auto geolocation call on load", () => {
    document.body.innerHTML = '<button id="nearestIncidentBtn" hidden></button>';
    const getCurrentPosition = jest.fn();
    Object.defineProperty(window.navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(document.getElementById("nearestIncidentBtn").hidden).toBe(false);
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
