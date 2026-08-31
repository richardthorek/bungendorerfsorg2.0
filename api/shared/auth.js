/**
 * Sign-in codes and session cookies for the members' area.
 *
 * Sign-in is passwordless: a 6-digit code is emailed, exchanged for a short
 * (default 60 min) HS256 session cookie. Codes are single-use, expire in 10
 * minutes, and lock after 5 wrong attempts. The session is re-validated
 * against the `members` row on every protected request, so disabling a member
 * or bumping their tokenVersion logs them out immediately.
 */

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getMember } = require("./store");
const { sessionMinutes } = require("./identity");

const COOKIE_NAME = "brfs_session";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const CSRF_HEADER = "x-brfs-auth";

function jwtSecret(env = process.env) {
  const s = env.AUTH_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_JWT_SECRET is not configured (needs >= 32 chars)");
  }
  return s;
}

/* --------------------------------------------------------------- sign-in codes */

/** Cryptographically-random 6-digit string, "000000"-"999999". */
function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC the code, bound to the email so it can't be replayed for another account. */
function hashCode(code, email, env = process.env) {
  return crypto.createHmac("sha256", jwtSecret(env)).update(`${email}:${code}`).digest("hex");
}

/** Constant-time comparison of a candidate code against a stored hash. */
function codeMatches(code, email, storedHash, env = process.env) {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashCode(code, email, env), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

function codeExpiry(now = Date.now()) {
  return new Date(now + CODE_TTL_MS).toISOString();
}

function isExpired(isoString, now = Date.now()) {
  const t = Date.parse(isoString);
  return !Number.isFinite(t) || t <= now;
}

/* ------------------------------------------------------------------ sessions */

function issueSession(member, env = process.env) {
  return jwt.sign(
    { role: member.role, name: member.displayName || "", tv: member.tokenVersion || 0 },
    jwtSecret(env),
    { subject: member.email, expiresIn: `${sessionMinutes(env)}m`, algorithm: "HS256" }
  );
}

/** Verify a raw token; returns claims or null. */
function verifyToken(token, env = process.env) {
  try {
    return jwt.verify(token, jwtSecret(env), { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- cookies */

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function sessionCookie(token, env = process.env) {
  const maxAge = sessionMinutes(env) * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/* ------------------------------------------------------------- request helpers */

function getClientIp(req) {
  const xff =
    (req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"])) || "";
  const first = String(xff).split(",")[0].trim();
  // strip a trailing :port that some proxies add
  return first.replace(/:\d+$/, "") || "unknown";
}

/** Mutating requests must carry the custom header a cross-site form can't set. */
function hasCsrfHeader(req) {
  const h = req.headers || {};
  return h[CSRF_HEADER] === "1" || h[CSRF_HEADER.toUpperCase()] === "1";
}

/**
 * Resolve the caller's live session.
 * @returns {Promise<{ok:true, member:object} | {ok:false, status:number, error:string}>}
 */
async function resolveSession(req, { role } = {}, env = process.env) {
  const token = parseCookies(req.headers && (req.headers.cookie || req.headers.Cookie))[
    COOKIE_NAME
  ];
  if (!token) return { ok: false, status: 401, error: "Not signed in" };

  const claims = verifyToken(token, env);
  if (!claims || !claims.sub) return { ok: false, status: 401, error: "Session expired" };

  const member = await getMember(claims.sub, env);
  if (!member || member.disabled) return { ok: false, status: 401, error: "Session revoked" };
  if ((claims.tv || 0) !== member.tokenVersion) {
    return { ok: false, status: 401, error: "Session revoked" };
  }
  if (role === "admin" && member.role !== "admin") {
    return { ok: false, status: 403, error: "Admins only" };
  }
  const expiresAt = claims.exp ? new Date(claims.exp * 1000).toISOString() : null;
  return { ok: true, member, expiresAt };
}

module.exports = {
  COOKIE_NAME,
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  CSRF_HEADER,
  generateCode,
  hashCode,
  codeMatches,
  codeExpiry,
  isExpired,
  issueSession,
  verifyToken,
  parseCookies,
  sessionCookie,
  clearCookie,
  getClientIp,
  hasCsrfHeader,
  resolveSession,
};
