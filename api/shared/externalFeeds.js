/**
 * New external feeds (WEBSITE_ROADMAP.md §3, Workstream 7), shared by the
 * Azure Function handlers (`api/fire-weather-warning`, `api/wind-observations`,
 * `api/rain-radar`, `api/traffic-hazards`) and the Express mirror (`server.js`).
 *
 * Every feed here reuses `fireDataProxy.js`'s fresh/stale/expired cache-tier
 * policy (`fetchWithFallback`) so all of them behave identically to the
 * existing fire-danger/fire-incidents proxies: a fresh upstream read, a
 * short-TTL in-memory cache to absorb bursts, stale-but-labelled data on a
 * transient upstream failure, and an honest failure past the staleness
 * ceiling — never a silent zero/default that could be mistaken for "all
 * clear". See that file's top comment for the full rationale.
 *
 * Upstreams (all verified against public, no-key endpoints as of Aug 2026 —
 * see the per-feed comments for the specific URL and any caveats):
 *   - BOM Fire Weather Warning bulletin (IDN22000), free text, "Southern
 *     Ranges" district heading appears only when a warning is current.
 *   - BOM live observations, Canberra Airport (IDN60903.94926), JSON.
 *   - BOM rain radar (IDR403, Captains Flat/Canberra) — image loop, no fetch
 *     needed server-side; the frontend embeds BOM's own image directly, so
 *     there's no shared-handler entry for it (see public/index.html).
 *   - TfNSW Live Traffic Hazards — requires an API key not yet issued to the
 *     brigade (reCAPTCHA-gated human signup, pending). Wired to
 *     process.env.TFNSW_API_KEY end-to-end; while the key is absent this
 *     returns the same honest "unavailable" shape as any other failed feed,
 *     never a 500 and never a silently-omitted response.
 *
 * DEA satellite hotspots were dropped (roadmap feedback: confusing for the
 * general public, a power-user feature) — no code here for them.
 */

const { fetchWithFallback } = require("./fireDataProxy");

async function fetchText(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = new Error(`Upstream returned status ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return { body: await response.text(), contentType: "text/plain" };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = new Error(`Upstream returned status ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return { body: await response.json(), contentType: "application/json" };
}

// ─── 1. BOM Fire Weather Warning — "Southern Ranges" district ────────────────
//
// Product IDN22000, a free-text bulletin. Public, no key. When a Fire Weather
// Warning is current, "Southern Ranges" appears as a section heading inside
// the text; when there is no current warning, BOM may return an empty or
// near-empty body (or the request may 404) — that is the normal "no warning"
// state for this specific product, not a fetch failure, and must render as
// "no current fire weather warning", never as an error banner.
// Deliberately http:// — BOM's legacy cgi-bin product wrapper is known to
// serve different (wrapper-page, non-bulletin) content over https:// or from
// some source IPs; the brigade has direct operational experience with this.
// Not a fix-it-later item.
const BOM_FWW_URL = "http://www.bom.gov.au/cgi-bin/wrap_fwo.pl?IDN22000.txt=";

/**
 * Parse the IDN22000 bulletin text for a "Southern Ranges" section.
 * Returns { hasWarning: boolean, text: string|null }.
 */
function parseFireWeatherWarning(bulletinText) {
  const text = (bulletinText || "").trim();
  if (!text) {
    return { hasWarning: false, text: null };
  }

  // Section headings in these bulletins are district names in isolation on
  // their own line (often uppercase), followed by the warning prose, up to
  // the next district heading or end of bulletin. We look for a line
  // containing "Southern Ranges" (case-insensitive) and take the block of
  // text that follows it until the next all-caps/district-like heading.
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => /southern ranges/i.test(line));
  if (startIdx === -1) {
    return { hasWarning: false, text: null };
  }

  const blockLines = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    // Stop at a subsequent district-style heading (short line, no lowercase
    // sentence punctuation) once we've already collected some body text.
    if (
      i > startIdx &&
      blockLines.length > 1 &&
      /^[A-Z][A-Za-z\s]{2,40}$/.test(line.trim()) &&
      line.trim().length < 40
    ) {
      break;
    }
    blockLines.push(line);
  }

  const block = blockLines.join("\n").trim();
  return { hasWarning: block.length > 0, text: block || null };
}

/**
 * @param {NodeJS.ProcessEnv} _env - unused, kept for signature consistency
 * @param {{logger?: {error: Function}}} [opts]
 */
async function getFireWeatherWarning(_env, _opts = {}) {
  const result = await fetchWithFallback("fire-weather-warning", () => fetchText(BOM_FWW_URL));

  if (!result.ok) {
    // A genuine fetch/network failure (not "no warning") — honest degraded
    // state, distinct from the "no current warning" case below.
    return result;
  }

  const parsed = parseFireWeatherWarning(result.body);
  return {
    ok: true,
    stale: result.stale,
    ageSeconds: result.ageSeconds,
    contentType: "application/json",
    body: {
      hasWarning: parsed.hasWarning,
      district: "Southern Ranges",
      text: parsed.text,
      source: "Bureau of Meteorology (IDN22000)",
    },
  };
}

// ─── 2. BOM live observations — Canberra Airport (nearest station) ──────────
//
// Product IDN60903.94926, JSON, public, no key. `data` array is most-recent-
// first; we surface the latest observation's wind/temp/humidity.
const BOM_OBSERVATIONS_URL = "http://www.bom.gov.au/fwo/IDN60903/IDN60903.94926.json";

/**
 * @param {NodeJS.ProcessEnv} _env
 * @param {{logger?: {error: Function}}} [opts]
 */
async function getWindObservations(_env, _opts = {}) {
  const result = await fetchWithFallback("wind-observations", () =>
    fetchJson(BOM_OBSERVATIONS_URL)
  );

  if (!result.ok) return result;

  const observations =
    (result.body && result.body.observations && result.body.observations.data) || [];
  const latest = observations[0] || null;

  if (!latest) {
    // Upstream answered but had no observation rows — treat as a degraded
    // read, not a silent "no wind data" that could look like calm conditions.
    return { ok: false, error: "No observation data in upstream response", status: 502 };
  }

  return {
    ok: true,
    stale: result.stale,
    ageSeconds: result.ageSeconds,
    contentType: "application/json",
    body: {
      station: "Canberra Airport",
      observedAt: latest.local_date_time_full || latest.aifstime_utc || null,
      windSpeedKmh: typeof latest.wind_spd_kmh === "number" ? latest.wind_spd_kmh : null,
      windDirection: latest.wind_dir || null,
      windGustKmh: typeof latest.gust_kmh === "number" ? latest.gust_kmh : null,
      airTempC: typeof latest.air_temp === "number" ? latest.air_temp : null,
      relativeHumidityPct: typeof latest.rel_hum === "number" ? latest.rel_hum : null,
      source: "Bureau of Meteorology (IDN60903.94926)",
    },
  };
}

// ─── 3. TfNSW Live Traffic Hazards (Kings Highway) ──────────────────────────
//
// Requires TFNSW_API_KEY — a free key the site owner is still obtaining
// (reCAPTCHA-gated human signup, not yet available). Fully wired: when the
// key is present we call the real endpoint; when absent we return the same
// honest "unavailable" shape every other feed uses on failure, never a 500
// and never a silently-omitted response. Auth header is the literal word
// "apikey" per TfNSW's convention (not "Bearer").
const TFNSW_BASE_URL = "https://api.transport.nsw.gov.au/v1/live/hazards";

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{logger?: {error: Function}, hazardType?: string}} [opts] - hazardType defaults to "fire", the
 *   sub-resource most relevant here; roadworks/incidents are also valid per TfNSW's API.
 */
async function getTrafficHazards(env, opts = {}) {
  const logger = (opts && opts.logger) || console;
  const hazardType = (opts && opts.hazardType) || "fire";
  const apiKey = env.TFNSW_API_KEY;

  if (!apiKey) {
    logger.error("TFNSW_API_KEY not configured — TfNSW key pending (reCAPTCHA-gated signup)");
    return {
      ok: false,
      error: "Traffic hazard data is not currently available",
      status: 503,
    };
  }

  // Cache key must include hazardType — it's user-controllable via ?type=
  // (api/traffic-hazards/index.js, server.js), and a constant key would let
  // a cache hit for one hazard type silently serve back a different type's
  // cached body within the fresh-TTL window.
  return fetchWithFallback(`traffic-hazards:${hazardType}`, () =>
    fetchJson(`${TFNSW_BASE_URL}/${encodeURIComponent(hazardType)}`, {
      headers: { Authorization: `apikey ${apiKey}` },
    })
  );
}

module.exports = {
  getFireWeatherWarning,
  getWindObservations,
  getTrafficHazards,
  // Exported for tests only.
  parseFireWeatherWarning,
};
