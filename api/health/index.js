/**
 * Azure Function: Health Check
 *
 * Public, unauthenticated, lightweight liveness check for external uptime
 * monitoring (the monitor itself is configured/owned outside this repo — see
 * WEBSITE_ROADMAP.md Workstream 3). Returns 200 with { status: "ok" | "degraded",
 * timestamp } — always 200 so a transient upstream blip doesn't page anyone;
 * the body is what carries the signal. See ../shared/health.js for the shared
 * check reused by the server.js mirror.
 */

const { checkHealth } = require("../shared/health");

module.exports = async function (context, _req) {
  const result = await checkHealth(process.env, { logger: context.log });
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
    body: result,
  };
};
