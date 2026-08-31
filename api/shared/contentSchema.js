/**
 * Validation + normalisation for the editable site content
 * ("events" = community events, "training" = the recurring schedule,
 * "alertBanner" = the admin-published homepage banner — roadmap Bet 3).
 * Returns { ok, items } or { ok:false, error }.
 */

const RECURRENCE =
  /^(every|first|second|third|fourth|last)-(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;

const ALERT_SEVERITIES = ["info", "warning"];

function str(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function validateEvents(input) {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a list of events." };
  if (input.length > 50) return { ok: false, error: "Too many events (max 50)." };
  const items = [];
  for (const raw of input) {
    const name = str(raw && raw.name, 120);
    if (!name) return { ok: false, error: "Every event needs a name." };
    items.push({
      name,
      timing: str(raw && raw.timing, 80),
      description: str(raw && raw.description, 500),
    });
  }
  return { ok: true, items };
}

function validateTraining(input) {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a list of sessions." };
  if (input.length > 20) return { ok: false, error: "Too many sessions (max 20)." };
  const items = [];
  for (const raw of input) {
    const title = str(raw && raw.title, 80);
    const recurrence = str(raw && raw.recurrence, 40).toLowerCase();
    if (!title) return { ok: false, error: "Every session needs a title." };
    if (!RECURRENCE.test(recurrence)) {
      return { ok: false, error: `"${recurrence || "(blank)"}" isn't a valid recurrence.` };
    }
    items.push({
      title,
      recurrence,
      time: str(raw && raw.time, 40),
      location: str(raw && raw.location, 80),
    });
  }
  return { ok: true, items };
}

/**
 * The alert banner is represented using the same items-array shape as
 * events/training so it fits the existing getContent/setContent(key, items)
 * storage contract, but it only ever holds 0 or 1 items: an empty array
 * means "no active banner" (nothing shown publicly), one item means "this
 * banner is live". `postedAt` is intentionally NOT accepted from the client
 * — the handler stamps it server-side on save so an admin can't backdate or
 * forge when a message was actually posted.
 */
function validateAlertBanner(input) {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a list of banner entries." };
  if (input.length > 1) {
    return { ok: false, error: "Only one banner can be active at a time — clear it first." };
  }
  if (input.length === 0) return { ok: true, items: [] };

  const raw = input[0];
  const message = str(raw && raw.message, 280);
  if (!message) return { ok: false, error: "The banner needs a message." };

  let severity = str(raw && raw.severity, 20).toLowerCase();
  if (!severity) severity = "info";
  if (!ALERT_SEVERITIES.includes(severity)) {
    return { ok: false, error: `"${severity}" isn't a valid severity.` };
  }

  return { ok: true, items: [{ message, severity }] };
}

function validateContent(key, input) {
  if (key === "events") return validateEvents(input);
  if (key === "training") return validateTraining(input);
  if (key === "alertBanner") return validateAlertBanner(input);
  return { ok: false, error: "Unknown content type." };
}

module.exports = {
  RECURRENCE,
  ALERT_SEVERITIES,
  validateContent,
  validateEvents,
  validateTraining,
  validateAlertBanner,
};
