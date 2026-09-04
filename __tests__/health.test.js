/**
 * Tests for the /api/health shared check (api/shared/health.js) and the
 * Azure Function wrapper (api/health/index.js).
 */

const { checkHealth } = require("../api/shared/health");
const { _resetCacheForTests } = require("../api/shared/fireDataProxy");

const quietLogger = { error: () => {} };

beforeEach(() => {
  _resetCacheForTests();
  jest.restoreAllMocks();
});

describe("checkHealth", () => {
  test("no upstream configured -> ok, still returns an ISO timestamp", async () => {
    const result = await checkHealth({}, { logger: quietLogger });
    expect(result.status).toBe("ok");
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  test("skipUpstream option -> ok without touching fetch", async () => {
    global.fetch = jest.fn();
    const result = await checkHealth(
      { AZURE_FIRE_DANGER_WEBHOOK_URL: "https://example.com/x" },
      { skipUpstream: true, logger: quietLogger }
    );
    expect(result.status).toBe("ok");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("upstream reachable -> ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<x/>" });
    const result = await checkHealth(
      { AZURE_FIRE_DANGER_WEBHOOK_URL: "https://example.com/fire-danger" },
      { logger: quietLogger }
    );
    expect(result.status).toBe("ok");
  });

  test("upstream unreachable -> degraded, not an error throw", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await checkHealth(
      { AZURE_FIRE_DANGER_WEBHOOK_URL: "https://example.com/fire-danger" },
      { logger: quietLogger }
    );
    expect(result.status).toBe("degraded");
    expect(result.detail).toBeTruthy();
  });
});

describe("api/health Azure Function", () => {
  test("always responds 200, body carries the real status", async () => {
    const handler = require("../api/health/index");
    const context = { log: Object.assign(() => {}, { error: () => {}, warn: () => {} }) };
    const originalUrl = process.env.AZURE_FIRE_DANGER_WEBHOOK_URL;
    delete process.env.AZURE_FIRE_DANGER_WEBHOOK_URL;

    await handler(context, {});

    expect(context.res.status).toBe(200);
    expect(context.res.body.status).toBe("ok");
    expect(context.res.body.timestamp).toBeTruthy();

    if (originalUrl === undefined) delete process.env.AZURE_FIRE_DANGER_WEBHOOK_URL;
    else process.env.AZURE_FIRE_DANGER_WEBHOOK_URL = originalUrl;
  });
});
