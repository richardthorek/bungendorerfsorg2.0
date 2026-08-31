/**
 * Turns a handler result ({ status, body, headers?, setCookie?, clearCookie? })
 * into an Azure Functions `context.res`.
 */

const { clearCookie } = require("./auth");

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
      context.log.error(`${context.executionContext.functionName} failed:`, err);
      respond(context, { status: 500, body: { error: "Something went wrong. Try again." } });
    }
  };
}

module.exports = { respond, functionFor };
