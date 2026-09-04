/**
 * Tests for the fire-danger / fire-incidents shared proxy cache
 * (api/shared/fireDataProxy.js) — the stale-while-revalidate / stale-if-error
 * behaviour that backs both api/fire-danger, api/fire-incidents and their
 * server.js mirrors.
 */

const {
  getFireDanger,
  getFireIncidents,
  FRESH_TTL_MS,
  STALE_CEILING_MS,
  _resetCacheForTests,
} = require("../api/shared/fireDataProxy");

const ENV = {
  AZURE_FIRE_DANGER_WEBHOOK_URL: "https://example.com/fire-danger",
  AZURE_INCIDENTS_WEBHOOK_URL: "https://example.com/fire-incidents",
};

const quietLogger = { error: () => {} };

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function xmlResponse(text, ok = true, status = 200) {
  return { ok, status, text: async () => text };
}

beforeEach(() => {
  _resetCacheForTests();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("getFireDanger", () => {
  test("missing webhook URL -> config error, no fetch attempted", async () => {
    global.fetch = jest.fn();
    const result = await getFireDanger({}, { logger: quietLogger });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("successful fetch -> fresh response, cached for next call", async () => {
    global.fetch = jest.fn().mockResolvedValue(xmlResponse("<rating>Extreme</rating>"));
    const result = await getFireDanger(ENV, { logger: quietLogger });
    expect(result).toEqual({
      ok: true,
      body: "<rating>Extreme</rating>",
      contentType: "application/xml",
      stale: false,
      ageSeconds: 0,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call within FRESH_TTL_MS should be served from cache, no new fetch.
    const second = await getFireDanger(ENV, { logger: quietLogger });
    expect(second.ok).toBe(true);
    expect(second.stale).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("upstream failure with no prior cache -> honest error, not stale", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await getFireDanger(ENV, { logger: quietLogger });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/network down/);
  });

  test("upstream failure after a good fetch -> serves stale with markers", async () => {
    jest.useFakeTimers({ now: new Date("2026-08-31T10:00:00.000Z") });
    global.fetch = jest.fn().mockResolvedValueOnce(xmlResponse("<rating>High</rating>"));
    const first = await getFireDanger(ENV, { logger: quietLogger });
    expect(first.stale).toBe(false);

    // Advance past the fresh TTL so the next call attempts a real fetch.
    jest.setSystemTime(new Date(Date.now() + FRESH_TTL_MS + 1000));
    global.fetch = jest.fn().mockRejectedValue(new Error("upstream 500"));

    const second = await getFireDanger(ENV, { logger: quietLogger });
    expect(second.ok).toBe(true);
    expect(second.stale).toBe(true);
    expect(second.body).toBe("<rating>High</rating>");
    expect(second.ageSeconds).toBeGreaterThanOrEqual(Math.floor(FRESH_TTL_MS / 1000));
  });

  test("cache older than STALE_CEILING_MS is not served — falls through to error", async () => {
    jest.useFakeTimers({ now: new Date("2026-08-31T10:00:00.000Z") });
    global.fetch = jest.fn().mockResolvedValueOnce(xmlResponse("<rating>Moderate</rating>"));
    await getFireDanger(ENV, { logger: quietLogger });

    // Advance past the staleness ceiling.
    jest.setSystemTime(new Date(Date.now() + STALE_CEILING_MS + 1000));
    global.fetch = jest.fn().mockRejectedValue(new Error("still down"));

    const result = await getFireDanger(ENV, { logger: quietLogger });
    expect(result.ok).toBe(false);
  });
});

describe("getFireIncidents", () => {
  test("missing webhook URL -> config error", async () => {
    global.fetch = jest.fn();
    const result = await getFireIncidents({}, { logger: quietLogger });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  test("successful fetch -> fresh GeoJSON body, correct content type", async () => {
    const geojson = { type: "FeatureCollection", features: [] };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(geojson));
    const result = await getFireIncidents(ENV, { logger: quietLogger });
    expect(result.ok).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.contentType).toBe("application/json");
    expect(result.body).toEqual(geojson);
  });

  test("caches independently of fire-danger (separate cache partitions)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(xmlResponse("<rating>Low</rating>"))
      .mockResolvedValueOnce(jsonResponse({ type: "FeatureCollection", features: [] }));

    const danger = await getFireDanger(ENV, { logger: quietLogger });
    const incidents = await getFireIncidents(ENV, { logger: quietLogger });

    expect(danger.contentType).toBe("application/xml");
    expect(incidents.contentType).toBe("application/json");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
