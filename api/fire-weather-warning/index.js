/**
 * Azure Function: BOM Fire Weather Warning ("Southern Ranges" district)
 * Proxies BOM's IDN22000 bulletin and extracts the Southern Ranges section.
 * Caching / stale-while-revalidate logic lives in ../shared/externalFeeds.js
 * so this handler and the server.js mirror share one implementation.
 */

const { getFireWeatherWarning } = require("../shared/externalFeeds");

module.exports = async function (context, _req) {
  const result = await getFireWeatherWarning(process.env, { logger: context.log });

  if (!result.ok) {
    context.res = {
      status: result.status || 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: result.error || "Failed to fetch fire weather warning" },
    };
    return;
  }

  const headers = {
    "Content-Type": result.contentType || "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "X-Data-Freshness": result.stale ? "stale" : "fresh",
    "X-Data-Age-Seconds": String(result.ageSeconds),
  };

  context.res = {
    status: 200,
    headers,
    body: result.body,
  };
};
