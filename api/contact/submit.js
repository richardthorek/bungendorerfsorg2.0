/**
 * One entry point for a validated contact-form submission, shared by the Azure
 * Function and the Express mirror: record it in the enquiries table AND email
 * the leadership distribution list. Succeeds if at least one of those worked.
 */

const { recordEnquiry, hitRateLimit } = require("../shared/store");
const { sendContactNotifications } = require("./notify");

// The form is unauthenticated, so throttle it: per-IP stops floods, per-email
// stops someone using the confirmation mail to bomb one address. Windows are
// generous enough that a genuine follow-up enquiry still gets through.
const IP_LIMIT = { max: 6, windowSeconds: 3600 };
const EMAIL_LIMIT = { max: 4, windowSeconds: 3600 };

/**
 * @param {{name:string,email:string,phone:string,message:string}} data
 * @param {{env?:object, logger?:object, ip?:string}} [options]
 */
async function handleContactSubmission(data, options = {}) {
  const logger = options.logger || console;
  const env = options.env;

  const rl = await checkRateLimit(data, options, env, logger);
  if (rl && !rl.allowed) {
    logger.warn("contact submission rate-limited");
    return { stored: false, emailed: false, rateLimited: true, retryAfter: rl.retryAfter };
  }

  let stored = false;
  let emailed = false;

  try {
    await recordEnquiry({ ...data, source: "website" }, env);
    stored = true;
  } catch (err) {
    logger.error(`enquiry not stored: ${err.message}`);
  }

  try {
    await sendContactNotifications(data, { env, logger });
    emailed = true;
  } catch (err) {
    logger.error(`enquiry notification failed: ${err.message}`);
  }

  if (!stored && !emailed) {
    throw new Error("Enquiry could not be stored or emailed");
  }
  return { stored, emailed };
}

/** Fail-open: a rate-limiter outage must not take the contact form down. */
async function checkRateLimit(data, options, env, logger) {
  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  try {
    const results = await Promise.all([
      options.ip
        ? hitRateLimit(`contact:ip:${options.ip}`, IP_LIMIT, env)
        : Promise.resolve({ allowed: true }),
      email
        ? hitRateLimit(`contact:email:${email}`, EMAIL_LIMIT, env)
        : Promise.resolve({ allowed: true }),
    ]);
    const blocked = results.filter((r) => !r.allowed);
    if (blocked.length === 0) return { allowed: true };
    return {
      allowed: false,
      retryAfter: Math.max(1, ...blocked.map((r) => r.retryAfterSeconds || 0)),
    };
  } catch (err) {
    logger.error(`contact rate-limit check failed (allowing): ${err.message}`);
    return { allowed: true };
  }
}

module.exports = { handleContactSubmission };
