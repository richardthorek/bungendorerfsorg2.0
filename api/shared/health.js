/**
 * Lightweight liveness/readiness check, shared by the Azure Function
 * (`api/health`) and the Express mirror (`server.js`). Public, unauthenticated,
 * no sensitive data — intended purely as something an external uptime monitor
 * can poll (the monitor itself is configured/owned outside this repo).
 *
 * The upstream check reuses `fireDataProxy`'s own cache/fallback logic rather
 * than issuing a separate request: the Logic App HTTP triggers behind
 * AZURE_FIRE_DANGER_WEBHOOK_URL aren't guaranteed to answer a bare HEAD/GET
 * probe cheaply or predictably, and firing a second, independent upstream
 * call on every health poll would just double load on the same webhook the
 * real proxy already guards with a TTL. Piggybacking means: if the fire-data
 * feed is fresh, cached, or acceptably stale, health is "ok"; only a fully
 * expired-or-failed fetch (see fireDataProxy's STALE_CEILING_MS) reports
 * "degraded".
 */

const { getFireDanger } = require("./fireDataProxy");

const UPSTREAM_CHECK_TIMEOUT_MS = 2000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: "timeout" }), ms)),
  ]);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{skipUpstream?: boolean, logger?: {error: Function}}} [opts] - skipUpstream is test-only
 */
async function checkHealth(env, opts = {}) {
  const timestamp = new Date().toISOString();

  if (opts.skipUpstream || !(env && env.AZURE_FIRE_DANGER_WEBHOOK_URL)) {
    // No upstream configured (or explicitly skipped) — the process being up
    // and able to answer is all we're asserting.
    return { status: "ok", timestamp };
  }

  let result;
  try {
    result = await withTimeout(
      getFireDanger(env, { logger: opts.logger }),
      UPSTREAM_CHECK_TIMEOUT_MS
    );
  } catch {
    result = { ok: false };
  }

  if (!result || !result.ok) {
    return { status: "degraded", timestamp, detail: "fire-data upstream unreachable" };
  }
  return { status: "ok", timestamp };
}

module.exports = { checkHealth };
