/**
 * Azure Function: Fire Incidents
 * Proxies requests to Azure Logic Apps for fire incidents data (map markers).
 * Caching / stale-while-revalidate logic lives in ../shared/fireDataProxy.js
 * so this handler and the server.js mirror share one implementation.
 */

const { getFireIncidents } = require("../shared/fireDataProxy");

module.exports = async function (context, _req) {
  const result = await getFireIncidents(process.env, { logger: context.log });

  if (!result.ok) {
    context.res = {
      status: result.status || 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: result.error || "Failed to fetch incidents" },
    };
    return;
  }

  // The body stays the plain GeoJSON FeatureCollection the frontend already
  // expects (public/js/emergency-data.js reads data.features directly) — the
  // freshness signal is carried in headers only, never folded into the body.
  const headers = {
    "Content-Type": result.contentType || "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Request-ID",
    "X-Data-Freshness": result.stale ? "stale" : "fresh",
    "X-Data-Age-Seconds": String(result.ageSeconds),
  };

  context.res = {
    status: 200,
    headers,
    body: result.body,
  };
};
