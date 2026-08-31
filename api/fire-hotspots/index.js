/**
 * Azure Function: DEA satellite hotspots (Himawari, 10-min), filtered to
 * ~50km of Bungendore. Caching / stale-while-revalidate logic lives in
 * ../shared/externalFeeds.js so this handler and the server.js mirror
 * share one implementation.
 */

const { getFireHotspots } = require("../shared/externalFeeds");

module.exports = async function (context, _req) {
  const result = await getFireHotspots(process.env, { logger: context.log });

  if (!result.ok) {
    context.res = {
      status: result.status || 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: result.error || "Failed to fetch fire hotspots" },
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
