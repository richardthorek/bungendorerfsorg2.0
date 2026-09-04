/**
 * Turns a handler result ({ status, body, headers?, setCookie?, clearCookie? })
 * into an Azure Functions `context.res`.
 */

const { clearCookie } = require("./auth");
const { trackHandledError } = require("./telemetry");

function respond(context, result) {
  const headers = { "Content-Type": "application/json", ...(result.headers || {}) };
  const setCookie = result.setCookie || (result.clearCookie ? clearCookie() : null);
  if (setCookie) headers["Set-Cookie"] = setCookie;

  context.res = { status: result.status || 200, headers, body: result.body };
}

/** Wrap an async (req, env) handler with uniform error handling. */
function functionFor(handler) {
  return async function (context, req) {
    try {
      respond(context, await handler(req, process.env));
    } catch (err) {
      const functionName = context.executionContext.functionName;
      context.log.error(`${functionName} failed:`, err);
      trackHandledError(`${functionName} failed`, err, { functionName }, process.env);
      respond(context, { status: 500, body: { error: "Something went wrong. Try again." } });
    }
  };
}

module.exports = { respond, functionFor };
