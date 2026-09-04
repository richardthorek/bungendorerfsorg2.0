/**
 * POST /api/clarity/cron — the scheduled (Logic App) entry point that forces
 * a Clarity pull independent of member traffic. Only the secret gate and the
 * status mapping belong to this handler; maybeRefreshClarity's own budget
 * logic is covered separately in clarity-insights.test.js, so it's mocked here.
 */

const mockRefresh = jest.fn();
jest.mock("../api/shared/clarityInsights", () => ({
  maybeRefreshClarity: (...args) => mockRefresh(...args),
}));

// handlers.js pulls in store.js (Azure Table Storage SDK, ESM-only) and the
// ACS-backed otpEmail/dutyAlert modules transitively; stub them out the same
// way members-auth.test.js does so requiring handlers.js doesn't need those
// packages transformed. handleClarityCron itself never touches any of these.
jest.mock("../api/shared/store", () => ({}));
jest.mock("../api/shared/otpEmail", () => ({ async sendSignInCode() {} }));
jest.mock("../api/shared/dutyAlert", () => ({ async sendDutyChangeAlert() {} }));

const { handleClarityCron } = require("../api/shared/handlers");

beforeEach(() => {
  mockRefresh.mockReset();
});

describe("handleClarityCron", () => {
  test("401s and never calls Clarity when CLARITY_CRON_SECRET isn't configured", async () => {
    const res = await handleClarityCron({ headers: { "x-cron-secret": "anything" } }, {});
    expect(res.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("401s on a missing header", async () => {
    const res = await handleClarityCron({ headers: {} }, { CLARITY_CRON_SECRET: "s3cr3t" });
    expect(res.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("401s on a wrong secret", async () => {
    const res = await handleClarityCron(
      { headers: { "x-cron-secret": "wrong" } },
      { CLARITY_CRON_SECRET: "s3cr3t" }
    );
    expect(res.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("forces a refresh and returns 200 on a matching secret", async () => {
    mockRefresh.mockResolvedValue({ refreshed: true, hasData: true });
    const env = { CLARITY_CRON_SECRET: "s3cr3t" };
    const res = await handleClarityCron({ headers: { "x-cron-secret": "s3cr3t" } }, env);

    expect(mockRefresh).toHaveBeenCalledWith(env, { force: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ refreshed: true, hasData: true });
  });

  test("maps a real Clarity failure to 502 so the Logic App run shows red", async () => {
    mockRefresh.mockResolvedValue({ refreshed: false, reason: "error", error: "boom" });
    const res = await handleClarityCron(
      { headers: { "x-cron-secret": "s3cr3t" } },
      { CLARITY_CRON_SECRET: "s3cr3t" }
    );
    expect(res.status).toBe(502);
  });

  test("an expected no-op (daily budget already spent) is still a 200", async () => {
    mockRefresh.mockResolvedValue({ refreshed: false, reason: "daily-budget" });
    const res = await handleClarityCron(
      { headers: { "x-cron-secret": "s3cr3t" } },
      { CLARITY_CRON_SECRET: "s3cr3t" }
    );
    expect(res.status).toBe(200);
  });
});
