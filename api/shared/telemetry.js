/**
 * Application Insights bridge. Autocollection (enabled below) only reports
 * exceptions nobody caught — most errors here are caught, logged via
 * console.error, and turned into a friendly 4xx/5xx. trackHandledError()
 * is the explicit bridge for those: call it wherever the code already
 * logs a caught error, instead of a bare console.error.
 *
 * No-ops everywhere (server.js local dev, or prod before the
 * APPLICATIONINSIGHTS_CONNECTION_STRING app setting is wired up) when the
 * connection string isn't configured.
 */

let client = null;
let configured = false;

function ensureClient(env) {
  const connectionString = env && env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) return null;
  if (configured) return client;

  try {
    // eslint-disable-next-line global-require
    const appInsights = require("applicationinsights");
    appInsights
      .setup(connectionString)
      .setAutoCollectExceptions(true)
      .setAutoCollectRequests(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(false) // we bridge console.error explicitly below, not via autocollection
      .setSendLiveMetrics(false)
      .start();

    client = appInsights.defaultClient;
    // One shared resource could serve more apps later — this tag is what
    // would tell them apart in the Application Map and every KQL query.
    client.context.tags[client.context.keys.cloudRole] = "bungendorerfs-static";
    client.config.samplingPercentage = env.NODE_ENV === "production" ? 100 : 50;
    configured = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`Application Insights init failed: ${err.message}`);
    client = null;
  }
  return client;
}

/**
 * Log a caught error the same way call sites already do (console.error),
 * and — when App Insights is configured — also track it as an exception so
 * it feeds the production-exceptions alert. `env` is the same per-request
 * env object every shared handler already threads through.
 */
function trackHandledError(message, err, properties, env) {
  // eslint-disable-next-line no-console
  console.error(message, err && err.message ? err.message : err);

  const activeClient = ensureClient(env || process.env);
  if (!activeClient) return;

  const exception = err instanceof Error ? err : new Error(String(err || message));
  const props = { message: String(message) };
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined) continue;
      props[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
  }
  activeClient.trackException({ exception, properties: props });
}

module.exports = { ensureClient, trackHandledError };
