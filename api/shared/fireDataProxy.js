/**
 * Fire-danger / fire-incidents upstream proxy, shared by the Azure Function
 * handlers (`api/fire-danger`, `api/fire-incidents`) and the Express mirror
 * (`server.js`) so both backends fetch, cache and fail over identically.
 *
 * Resilience model (WEBSITE_ROADMAP Workstream 4, code-level only — no new
 * infra, no Redis, no Cloudflare/SKU changes):
 *
 *   - Every successful upstream fetch is kept as an in-memory "last known
 *     good" response, per feed.
 *   - FRESH_TTL_MS: a cached response younger than this is served straight
 *     back without even calling the upstream — cheap insurance against a
 *     thundering herd of near-simultaneous page loads.
 *   - STALE_CEILING_MS: if a fresh fetch fails but the cache is younger than
 *     this, we serve the cached body instead of a hard error, but we ALWAYS
 *     mark it as stale (an `X-Data-Freshness: stale` header, an
 *     `X-Data-Age-Seconds` header, and a `stale`/`ageSeconds` field folded
 *     into JSON bodies) so the frontend/operator can tell it apart from a
 *     live read. We never silently present stale data as fresh.
 *   - Past STALE_CEILING_MS, cached data is considered too old to be useful
 *     — an hours-old incident count during an active fire is actively
 *     dangerous — so we let the fetch fail and fall through to the existing
 *     honest "degraded" error response (see public/js/emergency-data.js).
 *
 * In-memory only, per process: acceptable here because each Function/Express
 * instance is effectively single-tenant for this workload, a cold start just
 * means one extra upstream round-trip, and the failure mode we're guarding
 * against (a slow/flaky upstream during a live fetch) doesn't need the cache
 * to survive a restart. If that changes, `api/shared/store.js` already has a
 * Table Storage client that could hold the last-good payload across cold
 * starts — swap the Map below for a `store.js` read/write and keep the same
 * TTL logic.
 */

// "Fresh enough to skip a new upstream call" — short, just enough to absorb
// a burst of near-simultaneous requests (e.g. several tabs/users loading the
// homepage within the same minute) without hammering the Logic App.
const FRESH_TTL_MS = 90 * 1000; // 90s

// "Stale but still better than nothing." Fire danger ratings and incident
// lists can legitimately be this old during a genuinely brief upstream blip,
// but beyond this we'd rather show the existing honest degraded state than
// let a stale read for an active-fire situation impersonate a live one.
// 30 minutes is the ceiling because that's roughly the cadence the RFS/BOM
// feeds themselves refresh on for fire danger ratings — anything older than
// one upstream refresh cycle has a real chance of being wrong, not just late.
const STALE_CEILING_MS = 30 * 60 * 1000; // 30 minutes

/** @type {Map<string, {body: any, contentType: string, fetchedAt: number}>} */
const cache = new Map();

function now() {
  return Date.now();
}

function ageSeconds(fetchedAt) {
  return Math.max(0, Math.round((now() - fetchedAt) / 1000));
}

/**
 * Fetch `feedKey` via `fetcher()` (which must resolve to `{ body, contentType }`
 * on success and throw/reject on failure), applying the fresh/stale/expired
 * cache policy described above.
 *
 * @param {string} feedKey - cache partition, e.g. "fire-danger"
 * @param {() => Promise<{body: any, contentType: string}>} fetcher
 * @returns {Promise<{ok: true, body: any, contentType: string, stale: boolean, ageSeconds: number}
 *                  | {ok: false, error: string, status: number}>}
 */
async function fetchWithFallback(feedKey, fetcher) {
  const cached = cache.get(feedKey);

  // Fresh cache: skip the upstream call entirely.
  if (cached && now() - cached.fetchedAt < FRESH_TTL_MS) {
    return {
      ok: true,
      body: cached.body,
      contentType: cached.contentType,
      stale: false,
      ageSeconds: ageSeconds(cached.fetchedAt),
    };
  }

  try {
    const fresh = await fetcher();
    cache.set(feedKey, { body: fresh.body, contentType: fresh.contentType, fetchedAt: now() });
    return { ok: true, body: fresh.body, contentType: fresh.contentType, stale: false, ageSeconds: 0 };
  } catch (err) {
    if (cached && now() - cached.fetchedAt < STALE_CEILING_MS) {
      return {
        ok: true,
        body: cached.body,
        contentType: cached.contentType,
        stale: true,
        ageSeconds: ageSeconds(cached.fetchedAt),
      };
    }
    return { ok: false, error: err.message || "Upstream fetch failed", status: err.status || 502 };
  }
}

/** Reset the in-memory cache. Test-only. */
function _resetCacheForTests() {
  cache.clear();
}

async function fetchUpstreamText(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = new Error(`Upstream returned status ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return { body: await response.text(), contentType: "application/xml" };
}

async function fetchUpstreamJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = new Error(`Upstream returned status ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return { body: await response.json(), contentType: "application/json" };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{logger?: {error: Function}}} [opts]
 */
async function getFireDanger(env, opts = {}) {
  const logger = (opts && opts.logger) || console;
  const webhookUrl = env.AZURE_FIRE_DANGER_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.error("AZURE_FIRE_DANGER_WEBHOOK_URL not configured");
    return { ok: false, error: "Server configuration error", status: 500 };
  }

  return fetchWithFallback("fire-danger", () => fetchUpstreamText(webhookUrl));
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{logger?: {error: Function}}} [opts]
 */
async function getFireIncidents(env, opts = {}) {
  const logger = (opts && opts.logger) || console;
  const webhookUrl = env.AZURE_INCIDENTS_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.error("AZURE_INCIDENTS_WEBHOOK_URL not configured");
    return { ok: false, error: "Server configuration error", status: 500 };
  }

  return fetchWithFallback("fire-incidents", () =>
    fetchUpstreamJson(webhookUrl, {
      method: "GET",
      headers: {
        "X-Request-ID": "Get-Fire-Incidents",
        "Content-Type": "application/json",
      },
    })
  );
}

module.exports = {
  getFireDanger,
  getFireIncidents,
  FRESH_TTL_MS,
  STALE_CEILING_MS,
  _resetCacheForTests,
  // Exported for reuse by api/shared/externalFeeds.js (Workstream 7 feeds),
  // which follow the exact same fresh/stale/expired cache-tier contract
  // against different upstreams (BOM, DEA) rather than the Logic App webhooks.
  fetchWithFallback,
  fetchUpstreamText,
  fetchUpstreamJson,
};
