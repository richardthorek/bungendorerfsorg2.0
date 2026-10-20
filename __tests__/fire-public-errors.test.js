/**
 * The public fire-danger and fire-incidents endpoints must never echo upstream
 * error text to visitors. The detail is logged server-side; the body is fixed.
 */

jest.mock("../api/shared/fireDataProxy", () => ({
  getFireDanger: jest.fn(),
  getFireIncidents: jest.fn(),
}));

const { getFireDanger, getFireIncidents } = require("../api/shared/fireDataProxy");
const fireDangerHandler = require("../api/fire-danger/index.js");
const fireIncidentsHandler = require("../api/fire-incidents/index.js");

function makeContext() {
  return { log: { error: jest.fn() }, res: undefined };
}

const UPSTREAM_FAILURE = {
  ok: false,
  error: "Upstream returned status 503 from https://logic.example.internal/hook?sig=abc",
  status: 503,
};

describe("public fire endpoints on upstream failure", () => {
  test("api/fire-danger returns a fixed message and logs the detail", async () => {
    getFireDanger.mockResolvedValueOnce(UPSTREAM_FAILURE);
    const context = makeContext();

    await fireDangerHandler(context, {});

    expect(context.res.status).toBe(503);
    expect(context.res.body).toEqual({
      error: "Fire danger data is temporarily unavailable.",
    });
    expect(JSON.stringify(context.res.body)).not.toMatch(/upstream|logic\.example|sig=/i);
    expect(context.log.error).toHaveBeenCalledWith(
      "fire-danger unavailable:",
      UPSTREAM_FAILURE.error
    );
  });

  test("api/fire-incidents returns a fixed message and logs the detail", async () => {
    getFireIncidents.mockResolvedValueOnce(UPSTREAM_FAILURE);
    const context = makeContext();

    await fireIncidentsHandler(context, {});

    expect(context.res.body).toEqual({
      error: "Incident data is temporarily unavailable.",
    });
    expect(JSON.stringify(context.res.body)).not.toMatch(/upstream|logic\.example|sig=/i);
    expect(context.log.error).toHaveBeenCalledWith(
      "fire-incidents unavailable:",
      UPSTREAM_FAILURE.error
    );
  });
});
