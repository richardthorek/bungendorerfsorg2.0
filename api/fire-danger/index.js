/**
 * Azure Function: Fire Danger Rating
 * Proxies requests to Azure Logic Apps for fire danger data. Caching /
 * stale-while-revalidate logic lives in ../shared/fireDataProxy.js so this
 * handler and the server.js mirror share one implementation.
 */

const { getFireDanger } = require("../shared/fireDataProxy");

module.exports = async function (context, _req) {
  const result = await getFireDanger(process.env, { logger: context.log });

  if (!result.ok) {
    context.res = {
      status: result.status || 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { error: result.error || "Failed to fetch fire danger" },
    };
    return;
  }

  const headers = {
    "Content-Type": result.contentType || "application/xml",
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
