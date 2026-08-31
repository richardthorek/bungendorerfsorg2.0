/**
 * Azure Function: TfNSW Live Traffic Hazards (Kings Highway).
 * Requires TFNSW_API_KEY (pending — reCAPTCHA-gated signup not yet complete;
 * see ../shared/externalFeeds.js for the honest "unavailable" behaviour while
 * the key is absent). Caching / stale-while-revalidate logic for when the key
 * is configured lives in the same shared module so this handler and the
 * server.js mirror share one implementation.
 */

const { getTrafficHazards } = require("../shared/externalFeeds");

module.exports = async function (context, req) {
  const hazardType = (req.query && req.query.type) || "fire";
  const result = await getTrafficHazards(process.env, { logger: context.log, hazardType });

  if (!result.ok) {
    context.res = {
      status: result.status || 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: result.error || "Failed to fetch traffic hazards" },
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
