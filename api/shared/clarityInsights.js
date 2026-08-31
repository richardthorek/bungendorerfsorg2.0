/**
 * Microsoft Clarity "live insights" for the members' area.
 *
 * Clarity only exposes a rolling 1–3 day window through its Data Export API,
 * capped at 10 calls/project/day. So this module:
 *   1. fetches at most once every REFRESH_INTERVAL_MS, and never more than
 *      MAX_FETCHES_PER_DAY times (a safety margin under Clarity's 10);
 *   2. is driven opportunistically off members'-area traffic — no timer — via
 *      maybeRefreshClarity(), which callers fire-and-forget;
 *   3. normalises Clarity's per-metric response into a stable summary and
 *      persists it (latest snapshot + one rollup row per UTC day) so the
 *      admin panel keeps a longer history than Clarity itself retains.
 *
 * CLARITY_API_TOKEN is an Azure app setting — never commit it.
 */

const { getClarityState, saveClaritySnapshot, touchClarityAttempt } = require("./store");

const CLARITY_ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const MAX_FETCHES_PER_DAY = 6; // Clarity allows 10; leave headroom for manual refreshes
const NUM_OF_DAYS = 3; // widest window Clarity offers
const TOP_PAGES = 20;

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** First present, numeric-ish value among candidate keys (case-insensitive). */
function pick(row, candidates) {
  if (!row || typeof row !== "object") return 0;
  const lower = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase()] = row[k];
  for (const c of candidates) {
    const hit = lower[c.toLowerCase()];
    if (hit !== undefined && hit !== null && hit !== "") return num(hit);
  }
  return 0;
}

/** The dimension label on a row (URL / page path), if any. */
function rowUrl(row) {
  if (!row || typeof row !== "object") return "";
  for (const k of Object.keys(row)) {
    if (/^(url|page|pageurl|path)$/i.test(k)) return String(row[k] || "");
  }
  return "";
}

function metricRows(raw, name) {
  if (!Array.isArray(raw)) return [];
  const entry = raw.find(
    (m) =>
      m && typeof m.metricName === "string" && m.metricName.toLowerCase() === name.toLowerCase()
  );
  return entry && Array.isArray(entry.information) ? entry.information : [];
}

/**
 * Turn Clarity's `[{ metricName, information: [...] }]` payload (requested with
 * dimension1=URL) into a stable summary. Defensive about field names — Clarity
 * has changed them before and an empty window omits metrics entirely.
 */
function normalizeClarityInsights(raw) {
  const traffic = metricRows(raw, "Traffic");
  const scroll = metricRows(raw, "ScrollDepth");
  const engagement = metricRows(raw, "EngagementTime");

  let sessions = 0;
  let botSessions = 0;
  let distinctUsers = 0;
  let pagesPerSessionWeighted = 0;
  const pageMap = new Map();

  for (const row of traffic) {
    const s = pick(row, ["totalSessionCount", "sessionCount", "sessionsCount", "sessions"]);
    const bots = pick(row, ["totalBotSessionCount", "botSessionCount", "botSessions"]);
    const users = pick(row, ["distinctUserCount", "distantUserCount", "userCount", "users"]);
    const pps = pick(row, [
      "pagesPerSessionPercentage",
      "pagesPerSession",
      "averagePagesPerSession",
    ]);
    sessions += s;
    botSessions += bots;
    distinctUsers += users;
    pagesPerSessionWeighted += pps * s;
    const url = rowUrl(row);
    if (url) {
      const cur = pageMap.get(url) || { url, sessions: 0, pageViews: 0 };
      cur.sessions += s;
      cur.pageViews += pick(row, ["pageViews", "totalPageViews", "pageViewCount"]) || s;
      pageMap.set(url, cur);
    }
  }

  const avg = (rows, keys) => {
    let wsum = 0;
    let w = 0;
    for (const row of rows) {
      const weight = pick(row, ["totalSessionCount", "sessionCount", "sessions"]) || 1;
      wsum += pick(row, keys) * weight;
      w += weight;
    }
    return w ? wsum / w : 0;
  };

  const scrollByUrl = new Map();
  for (const row of scroll) {
    const u = rowUrl(row);
    if (u) {
      scrollByUrl.set(
        u,
        pick(row, ["averageScrollDepth", "scrollDepth", "avgScrollDepth", "value"])
      );
    }
  }
  const engagementByUrl = new Map();
  for (const row of engagement) {
    const u = rowUrl(row);
    if (u) {
      engagementByUrl.set(
        u,
        pick(row, ["averageEngagementTime", "engagementTime", "activeTime", "totalTime", "value"])
      );
    }
  }

  const pages = [...pageMap.values()]
    .map((p) => ({
      url: p.url,
      sessions: Math.round(p.sessions),
      pageViews: Math.round(p.pageViews),
      scrollDepth: round1(scrollByUrl.get(p.url) || 0),
      engagementTime: round1(engagementByUrl.get(p.url) || 0),
    }))
    .sort((a, b) => b.sessions - a.sessions || b.pageViews - a.pageViews)
    .slice(0, TOP_PAGES);

  const signals = {
    deadClicks: sumMetric(raw, "DeadClickCount"),
    rageClicks: sumMetric(raw, "RageClickCount"),
    quickbacks: sumMetric(raw, "QuickbackClick"),
    excessiveScroll: sumMetric(raw, "ExcessiveScroll"),
    scriptErrors: sumMetric(raw, "ScriptErrorCount"),
    errorClicks: sumMetric(raw, "ErrorClickCount"),
  };

  return {
    windowDays: NUM_OF_DAYS,
    totals: {
      sessions: Math.round(sessions),
      botSessions: Math.round(botSessions),
      distinctUsers: Math.round(distinctUsers),
      pagesPerSession: round1(sessions ? pagesPerSessionWeighted / sessions : 0),
      avgScrollDepth: round1(
        avg(scroll, ["averageScrollDepth", "scrollDepth", "avgScrollDepth", "value"])
      ),
      avgEngagementTime: round1(
        avg(engagement, [
          "averageEngagementTime",
          "engagementTime",
          "activeTime",
          "totalTime",
          "value",
        ])
      ),
    },
    pages,
    signals,
    hasData: sessions > 0 || pages.length > 0,
  };
}

function round1(n) {
  return Math.round(num(n) * 10) / 10;
}

function sumMetric(raw, name) {
  return Math.round(
    metricRows(raw, name).reduce(
      (acc, row) => acc + pick(row, ["subTotal", "count", "total", "value", "totalCount"]),
      0
    )
  );
}

/** One call to Clarity. Throws on non-200 or missing token. */
async function callClarity(env, { numOfDays = NUM_OF_DAYS } = {}) {
  const token = env.CLARITY_API_TOKEN;
  if (!token) throw new Error("CLARITY_API_TOKEN is not configured");
  const url = `${CLARITY_ENDPOINT}?numOfDays=${encodeURIComponent(numOfDays)}&dimension1=URL`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Clarity export failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Refresh the stored snapshot if it's older than REFRESH_INTERVAL_MS and we're
 * under the daily budget. `force` skips the age check (still budget-limited).
 * Never throws — analytics must not break a page load. Returns a short status.
 */
async function maybeRefreshClarity(env = process.env, { force = false } = {}) {
  try {
    if (!env.CLARITY_API_TOKEN) return { refreshed: false, reason: "not-configured" };
    const state = await getClarityState(env);
    const today = dayKey();
    const countToday = state.meta && state.meta.dayKey === today ? state.meta.countToday || 0 : 0;
    const lastAttemptAt = (state.meta && state.meta.lastAttemptAt) || 0;
    const ageMs = Date.now() - lastAttemptAt;

    if (countToday >= MAX_FETCHES_PER_DAY) return { refreshed: false, reason: "daily-budget" };
    if (!force && lastAttemptAt && ageMs < REFRESH_INTERVAL_MS) {
      return { refreshed: false, reason: "fresh" };
    }

    // Claim the slot before the network call so concurrent loads don't stampede.
    await touchClarityAttempt(today, countToday + 1, env);

    const raw = await callClarity(env);
    const summary = normalizeClarityInsights(raw);
    await saveClaritySnapshot({ summary, raw, day: today }, env);
    return { refreshed: true, hasData: summary.hasData };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`maybeRefreshClarity failed: ${err.message}`);
    return { refreshed: false, reason: "error", error: err.message };
  }
}

module.exports = {
  REFRESH_INTERVAL_MS,
  MAX_FETCHES_PER_DAY,
  normalizeClarityInsights,
  maybeRefreshClarity,
  _callClarity: callClarity,
};
