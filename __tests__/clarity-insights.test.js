/**
 * Microsoft Clarity insights — response normaliser and the opportunistic,
 * budget-limited refresh gate. The storage layer and `fetch` are faked.
 */

const mockState = { latest: null, meta: null };
const saved = [];
const attempts = [];

jest.mock("../api/shared/store", () => ({
  async getClarityState() {
    return mockState;
  },
  async touchClarityAttempt(dayKey, countToday) {
    attempts.push({ dayKey, countToday });
    mockState.meta = {
      ...(mockState.meta || {}),
      dayKey,
      countToday,
      lastAttemptAt: Date.now(),
    };
  },
  async saveClaritySnapshot({ summary, day }) {
    saved.push({ summary, day });
    mockState.latest = { summary, fetchedAt: new Date().toISOString() };
  },
  async listClarityDaily() {
    return [];
  },
}));

const {
  normalizeClarityInsights,
  maybeRefreshClarity,
  MAX_FETCHES_PER_DAY,
  REFRESH_INTERVAL_MS,
  _callClarity,
} = require("../api/shared/clarityInsights");

function resetAll() {
  mockState.latest = null;
  mockState.meta = null;
  saved.length = 0;
  attempts.length = 0;
  delete global.fetch;
}

beforeEach(resetAll);

/* --------------------------------------------------------------- normaliser */

describe("normalizeClarityInsights", () => {
  const populated = [
    {
      metricName: "Traffic",
      information: [
        {
          totalSessionCount: "120",
          totalBotSessionCount: "15",
          distinctUserCount: "90",
          PagesPerSessionPercentage: 2.5,
          Url: "https://bungendorerfs.org/",
        },
        {
          totalSessionCount: "40",
          totalBotSessionCount: "5",
          distinctUserCount: "35",
          PagesPerSessionPercentage: 1.2,
          Url: "https://bungendorerfs.org/#membership",
        },
      ],
    },
    {
      metricName: "ScrollDepth",
      information: [
        { averageScrollDepth: 68, totalSessionCount: "120", Url: "https://bungendorerfs.org/" },
        {
          averageScrollDepth: 40,
          totalSessionCount: "40",
          Url: "https://bungendorerfs.org/#membership",
        },
      ],
    },
    {
      metricName: "EngagementTime",
      information: [
        { averageEngagementTime: 55, totalSessionCount: "120", Url: "https://bungendorerfs.org/" },
      ],
    },
    { metricName: "RageClickCount", information: [{ subTotal: "3" }, { subTotal: "2" }] },
    { metricName: "DeadClickCount", information: [{ count: 4 }] },
    { metricName: "ScriptErrorCount", information: [] },
  ];

  it("aggregates totals across dimension rows", () => {
    const out = normalizeClarityInsights(populated);
    expect(out.totals.sessions).toBe(160);
    expect(out.totals.botSessions).toBe(20);
    expect(out.totals.distinctUsers).toBe(125);
    // session-weighted pages/session: (2.5*120 + 1.2*40) / 160
    expect(out.totals.pagesPerSession).toBeCloseTo(2.2, 1);
    expect(out.hasData).toBe(true);
  });

  it("builds a per-page table sorted by sessions, with scroll/engagement joined in", () => {
    const out = normalizeClarityInsights(populated);
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0].url).toBe("https://bungendorerfs.org/");
    expect(out.pages[0].sessions).toBe(120);
    expect(out.pages[0].scrollDepth).toBe(68);
    expect(out.pages[0].engagementTime).toBe(55);
    expect(out.pages[1].sessions).toBe(40);
  });

  it("sums friction signals from mixed field names", () => {
    const out = normalizeClarityInsights(populated);
    expect(out.signals.rageClicks).toBe(5);
    expect(out.signals.deadClicks).toBe(4);
    expect(out.signals.scriptErrors).toBe(0);
  });

  it("handles Clarity's empty-window response without throwing", () => {
    const empty = [
      { metricName: "Traffic", information: [] },
      { metricName: "ScrollDepth", information: [] },
      { metricName: "RageClickCount", information: [] },
    ];
    const out = normalizeClarityInsights(empty);
    expect(out.hasData).toBe(false);
    expect(out.totals.sessions).toBe(0);
    expect(out.pages).toEqual([]);
  });

  it("tolerates junk input", () => {
    expect(() => normalizeClarityInsights(null)).not.toThrow();
    expect(normalizeClarityInsights(null).hasData).toBe(false);
  });

  it("aggregates sessions by referrer channel", () => {
    const withChannel = [
      {
        metricName: "Traffic",
        information: [
          { totalSessionCount: "10", Url: "https://bungendorerfs.org/", Channel: "Direct" },
          {
            totalSessionCount: "6",
            Url: "https://bungendorerfs.org/",
            Channel: "Organic Search",
          },
          {
            totalSessionCount: "4",
            Url: "https://bungendorerfs.org/#membership",
            Channel: "Direct",
          },
        ],
      },
    ];
    const out = normalizeClarityInsights(withChannel);
    expect(out.channels).toEqual([
      { channel: "Direct", sessions: 14 },
      { channel: "Organic Search", sessions: 6 },
    ]);
    // channel is a second breakdown of the same rows, so page totals still sum correctly
    expect(out.pages.find((p) => p.url === "https://bungendorerfs.org/").sessions).toBe(16);
  });

  it("weights per-page scroll/engagement across multiple channel rows for the same URL", () => {
    const withChannel = [
      {
        metricName: "Traffic",
        information: [
          { totalSessionCount: "90", Url: "https://bungendorerfs.org/", Channel: "Direct" },
          { totalSessionCount: "10", Url: "https://bungendorerfs.org/", Channel: "Referral" },
        ],
      },
      {
        metricName: "ScrollDepth",
        information: [
          {
            averageScrollDepth: 80,
            totalSessionCount: "90",
            Url: "https://bungendorerfs.org/",
            Channel: "Direct",
          },
          {
            averageScrollDepth: 10,
            totalSessionCount: "10",
            Url: "https://bungendorerfs.org/",
            Channel: "Referral",
          },
        ],
      },
    ];
    const out = normalizeClarityInsights(withChannel);
    // weighted: (80*90 + 10*10) / 100 = 73, not the naive average of 45 or last-write of 10
    expect(out.pages[0].scrollDepth).toBe(73);
  });

  it("ranks topEngaged by scroll/engagement and excludes low-traffic outliers", () => {
    const raw = [
      {
        metricName: "Traffic",
        information: [
          { totalSessionCount: "50", Url: "https://bungendorerfs.org/popular" },
          { totalSessionCount: "40", Url: "https://bungendorerfs.org/sticky" },
          { totalSessionCount: "1", Url: "https://bungendorerfs.org/one-visit-100pct" },
        ],
      },
      {
        metricName: "ScrollDepth",
        information: [
          {
            averageScrollDepth: 30,
            totalSessionCount: "50",
            Url: "https://bungendorerfs.org/popular",
          },
          {
            averageScrollDepth: 95,
            totalSessionCount: "40",
            Url: "https://bungendorerfs.org/sticky",
          },
          {
            averageScrollDepth: 100,
            totalSessionCount: "1",
            Url: "https://bungendorerfs.org/one-visit-100pct",
          },
        ],
      },
    ];
    const out = normalizeClarityInsights(raw);
    expect(out.topEngaged.map((p) => p.url)).toEqual([
      "https://bungendorerfs.org/sticky",
      "https://bungendorerfs.org/popular",
    ]);
  });
});

/* ------------------------------------------------------------- refresh gate */

describe("_callClarity", () => {
  it("requests URL and Channel as the two breakdown dimensions", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
    await _callClarity({ CLARITY_API_TOKEN: "tok" });
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("dimension1=URL");
    expect(calledUrl).toContain("dimension2=Channel");
    delete global.fetch;
  });
});

describe("maybeRefreshClarity", () => {
  const env = { CLARITY_API_TOKEN: "tok" };

  function mockFetchOnce(body, ok = true, status = 200) {
    global.fetch = jest.fn(async () => ({
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }));
  }

  it("no-ops when the token is missing", async () => {
    const r = await maybeRefreshClarity({});
    expect(r).toEqual({ refreshed: false, reason: "not-configured" });
  });

  it("fetches and stores a snapshot on a cold start", async () => {
    mockFetchOnce([{ metricName: "Traffic", information: [{ totalSessionCount: "7" }] }]);
    const r = await maybeRefreshClarity(env);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(r.refreshed).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].summary.totals.sessions).toBe(7);
    // slot claimed before the network call
    expect(attempts[0]).toEqual({ dayKey: expect.any(String), countToday: 1 });
  });

  it("skips the fetch when the last attempt is within the refresh interval", async () => {
    mockState.meta = {
      dayKey: new Date().toISOString().slice(0, 10),
      countToday: 1,
      lastAttemptAt: Date.now() - REFRESH_INTERVAL_MS / 2,
    };
    mockFetchOnce([]);
    const r = await maybeRefreshClarity(env);
    expect(r).toEqual({ refreshed: false, reason: "fresh" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still refreshes within the interval when forced", async () => {
    mockState.meta = {
      dayKey: new Date().toISOString().slice(0, 10),
      countToday: 2,
      lastAttemptAt: Date.now() - 1000,
    };
    mockFetchOnce([{ metricName: "Traffic", information: [{ totalSessionCount: "1" }] }]);
    const r = await maybeRefreshClarity(env, { force: true });
    expect(r.refreshed).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses once the daily budget is spent, even when forced", async () => {
    mockState.meta = {
      dayKey: new Date().toISOString().slice(0, 10),
      countToday: MAX_FETCHES_PER_DAY,
      lastAttemptAt: Date.now() - 10 * 60 * 60 * 1000,
    };
    global.fetch = jest.fn();
    const r = await maybeRefreshClarity(env, { force: true });
    expect(r).toEqual({ refreshed: false, reason: "daily-budget" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("resets the daily count when the day rolls over", async () => {
    mockState.meta = {
      dayKey: "2000-01-01",
      countToday: MAX_FETCHES_PER_DAY,
      lastAttemptAt: Date.now() - 10 * 60 * 60 * 1000,
    };
    mockFetchOnce([{ metricName: "Traffic", information: [{ totalSessionCount: "2" }] }]);
    const r = await maybeRefreshClarity(env);
    expect(r.refreshed).toBe(true);
    expect(attempts[0].countToday).toBe(1);
  });

  it("swallows a Clarity error and reports it", async () => {
    mockFetchOnce({ message: "nope" }, false, 429);
    const r = await maybeRefreshClarity(env);
    expect(r.refreshed).toBe(false);
    expect(r.reason).toBe("error");
    expect(saved).toHaveLength(0);
  });
});
