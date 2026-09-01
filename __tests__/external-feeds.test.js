/**
 * Tests for the new Workstream 7 external feed handlers
 * (api/shared/externalFeeds.js) — BOM Fire Weather Warning, BOM wind
 * observations, and TfNSW traffic hazards. Reuses fireDataProxy's
 * fresh/stale/expired cache tiers (already covered by fire-data-proxy.test.js),
 * so these tests focus on per-feed parsing and honest-failure-state behaviour.
 */

const {
  getFireWeatherWarning,
  getWindObservations,
  getTrafficHazards,
  parseFireWeatherWarning,
} = require("../api/shared/externalFeeds");

const { _resetCacheForTests } = require("../api/shared/fireDataProxy");

const quietLogger = { error: () => {} };

function textResponse(text, ok = true, status = 200) {
  return { ok, status, text: async () => text };
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

beforeEach(() => {
  _resetCacheForTests();
  jest.restoreAllMocks();
});

describe("parseFireWeatherWarning", () => {
  test("empty bulletin -> no warning, not an error", () => {
    expect(parseFireWeatherWarning("")).toEqual({ hasWarning: false, text: null });
    expect(parseFireWeatherWarning("   ")).toEqual({ hasWarning: false, text: null });
  });

  test("bulletin without a Southern Ranges section -> no warning", () => {
    const bulletin = "FIRE WEATHER WARNING\n\nNorthern Slopes\nSevere fire danger expected.";
    expect(parseFireWeatherWarning(bulletin)).toEqual({ hasWarning: false, text: null });
  });

  test("bulletin with a Southern Ranges section -> extracts the block", () => {
    const bulletin = [
      "FIRE WEATHER WARNING",
      "",
      "Southern Ranges",
      "Severe fire danger is forecast for Wednesday.",
      "Winds will be strong and gusty.",
      "",
      "Northern Slopes",
      "Different district text here.",
    ].join("\n");

    const result = parseFireWeatherWarning(bulletin);
    expect(result.hasWarning).toBe(true);
    expect(result.text).toMatch(/Southern Ranges/);
    expect(result.text).toMatch(/Severe fire danger/);
  });
});

describe("getFireWeatherWarning", () => {
  test("upstream fetch failure with no cache -> honest error, never 'no warning'", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await getFireWeatherWarning({}, { logger: quietLogger });
    expect(result.ok).toBe(false);
  });

  test("empty bulletin -> ok:true, hasWarning:false (the honest 'no current warning' state)", async () => {
    global.fetch = jest.fn().mockResolvedValue(textResponse(""));
    const result = await getFireWeatherWarning({}, { logger: quietLogger });
    expect(result.ok).toBe(true);
    expect(result.body.hasWarning).toBe(false);
    expect(result.body.district).toBe("Southern Ranges");
  });

  test("bulletin with Southern Ranges section -> ok:true, hasWarning:true with text", async () => {
    const bulletin = "Southern Ranges\nExtreme fire danger warning in force.";
    global.fetch = jest.fn().mockResolvedValue(textResponse(bulletin));
    const result = await getFireWeatherWarning({}, { logger: quietLogger });
    expect(result.ok).toBe(true);
    expect(result.body.hasWarning).toBe(true);
    expect(result.body.text).toMatch(/Extreme fire danger/);
  });
});

describe("getWindObservations", () => {
  test("upstream failure with no cache -> honest error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await getWindObservations({}, { logger: quietLogger });
    expect(result.ok).toBe(false);
  });

  test("successful fetch -> latest observation surfaced", async () => {
    const body = {
      observations: {
        data: [
          {
            wind_spd_kmh: 25,
            wind_dir: "NW",
            gust_kmh: 40,
            air_temp: 32.5,
            rel_hum: 18,
            local_date_time_full: "20260831140000",
          },
          { wind_spd_kmh: 20, wind_dir: "N", gust_kmh: 30, air_temp: 31, rel_hum: 20 },
        ],
      },
    };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(body));
    const result = await getWindObservations({}, { logger: quietLogger });
    expect(result.ok).toBe(true);
    expect(result.body).toMatchObject({
      station: "Canberra Airport",
      windSpeedKmh: 25,
      windDirection: "NW",
      windGustKmh: 40,
      airTempC: 32.5,
      relativeHumidityPct: 18,
    });
  });

  test("upstream responds but with no observation rows -> honest degraded error, not a silent default", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ observations: { data: [] } }));
    const result = await getWindObservations({}, { logger: quietLogger });
    expect(result.ok).toBe(false);
  });
});

describe("getTrafficHazards", () => {
  test("missing TFNSW_API_KEY -> honest 'unavailable', never a 500 or silent omission", async () => {
    global.fetch = jest.fn();
    const result = await getTrafficHazards({}, { logger: quietLogger });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("with a key configured -> calls upstream with the 'apikey' auth header", async () => {
    const geojson = { type: "FeatureCollection", features: [] };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(geojson));
    const result = await getTrafficHazards({ TFNSW_API_KEY: "test-key" }, { logger: quietLogger });
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/live/hazards/fire"),
      expect.objectContaining({ headers: { Authorization: "apikey test-key" } })
    );
  });

  test("upstream failure with a key configured -> honest error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await getTrafficHazards({ TFNSW_API_KEY: "test-key" }, { logger: quietLogger });
    expect(result.ok).toBe(false);
  });
});
