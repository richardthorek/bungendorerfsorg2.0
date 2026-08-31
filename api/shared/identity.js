/**
 * Identity gate for the members' area.
 *
 * A person may sign in only if BOTH hold:
 *   1. their email is on the `@rfs.nsw.gov.au` domain (AUTH_ALLOWED_EMAIL_DOMAIN), and
 *   2. their email is on the allow-list (a row in the `members` table) and not disabled.
 *
 * The domain check is cheap and runs first; the allow-list check needs storage.
 */

const DEFAULT_DOMAIN = "rfs.nsw.gov.au";

/** Lower-case and trim; returns "" for anything that isn't a plausible address. */
function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  // one @, non-empty local part, a dotted domain, no spaces
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

/** The configured allowed domain, lower-cased, no leading dot/@. */
function allowedDomain(env = process.env) {
  return (env.AUTH_ALLOWED_EMAIL_DOMAIN || DEFAULT_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/^[@.]/, "");
}

/** True when `email` (already normalized) belongs to the allowed domain. */
function isAllowedDomain(email, env = process.env) {
  const domain = allowedDomain(env);
  return email.endsWith("@" + domain);
}

/** Session length in minutes (default 60). */
function sessionMinutes(env = process.env) {
  const n = parseInt(env.AUTH_SESSION_MINUTES, 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

module.exports = {
  DEFAULT_DOMAIN,
  normalizeEmail,
  allowedDomain,
  isAllowedDomain,
  sessionMinutes,
};
