/**
 * Origin allow-list for browser-facing endpoints that must not be callable
 * from arbitrary websites. Echoes the request's Origin only when it is ours;
 * otherwise the Access-Control-Allow-Origin header is omitted entirely.
 *
 * server.js applies the same list as middleware to every /api route; keep the
 * two in step.
 */

const ALLOWED_ORIGINS = [
  "https://bungendorerfs.org",
  "https://www.bungendorerfs.org",
  "http://localhost:3000",
];

// Azure Static Web Apps preview and staging hosts for this site, e.g.
// lively-flower-0577f4700-129.eastasia.5.azurestaticapps.net (PR preview) and
// the -livedev host. Pinned to this project's hostname prefix.
const SWA_PREVIEW_ORIGIN =
  /^https:\/\/lively-flower-0577f4700(-[a-z0-9]+)?\.eastasia\.5\.azurestaticapps\.net$/;

/**
 * @param {string|undefined} origin - the request's Origin header, if any
 * @returns {Record<string, string>} headers to merge into the response
 */
function corsHeadersFor(origin) {
  const headers = { Vary: "Origin" };
  if (origin && (ALLOWED_ORIGINS.includes(origin) || SWA_PREVIEW_ORIGIN.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

module.exports = { corsHeadersFor, ALLOWED_ORIGINS, SWA_PREVIEW_ORIGIN };
