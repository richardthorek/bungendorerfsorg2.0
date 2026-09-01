/**
 * Validation + normalisation for the editable site content
 * ("events" = community events, "training" = the recurring schedule,
 * "alertBanner" = the admin-published homepage banner — roadmap Bet 3).
 * Returns { ok, items } or { ok:false, error }.
 */

const RECURRENCE =
  /^(every|first|second|third|fourth|last)-(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;

const ALERT_SEVERITIES = ["info", "warning"];

// Curated so an admin picks a relevant Font Awesome icon from a visual grid
// rather than typing a raw class name — also doubles as a server-side
// allow-list so a saved card can never reference an arbitrary class.
const AWARENESS_ICONS = [
  "fa-shield-alt",
  "fa-fire",
  "fa-fire-alt",
  "fa-door-open",
  "fa-clock",
  "fa-clipboard-list",
  "fa-exclamation-triangle",
  "fa-triangle-exclamation",
  "fa-map-marked-alt",
  "fa-map-pin",
  "fa-route",
  "fa-paw",
  "fa-dog",
  "fa-horse",
  "fa-users",
  "fa-user-plus",
  "fa-handshake",
  "fa-hand-holding-heart",
  "fa-home",
  "fa-warehouse",
  "fa-truck",
  "fa-hard-hat",
  "fa-tint",
  "fa-wind",
  "fa-sun",
  "fa-cloud-rain",
  "fa-radio",
  "fa-phone",
  "fa-envelope",
  "fa-calendar-alt",
  "fa-calendar-check",
  "fa-graduation-cap",
  "fa-book",
  "fa-pen",
  "fa-file-signature",
  "fa-check-circle",
  "fa-campground",
  "fa-tree",
  "fa-seedling",
  "fa-first-aid",
  "fa-heartbeat",
  "fa-bullhorn",
  "fa-star",
  "fa-circle-info",
  "fa-image",
];

const AWARENESS_PILLARS = ["prepare", "membership", "events"];

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

const EVENT_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Card `body` is markdown rendered client-side through the same marked +
// DOMPurify pipeline as every other piece of content on the site — plain
// text length limits here are just abuse/storage protection, not sanitising.
/**
 * Awareness Cards (roadmap Bet 1 narrowing — Prepare/Membership/Events
 * carousel). Stored as one JSON array under content key "awarenessCards",
 * same one-row-per-key contract as events/training. `photo` is a compressed
 * data: URL (client resizes before upload — see admin.js) rather than a
 * blob/CDN reference, because this codebase has no image storage today;
 * the size cap here keeps the whole array within Azure Table Storage's
 * per-property size limit even with several photos in play.
 */
const MAX_CARD_TITLE = 120;
const MAX_CARD_BODY = 2000;
const MAX_CARD_PHOTO_CHARS = 40000; // ~30KB of actual image data, base64-encoded
const MAX_CARDS = 60;
const MAX_TOTAL_JSON_CHARS = 55000; // headroom under Table Storage's 64KB string property cap

function validateAwarenessCards(input) {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a list of cards." };
  if (input.length > MAX_CARDS) return { ok: false, error: `Too many cards (max ${MAX_CARDS}).` };

  const items = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] || {};
    const label = `Card ${i + 1}`;

    const pillar = str(raw.pillar, 20).toLowerCase();
    if (!AWARENESS_PILLARS.includes(pillar)) {
      return {
        ok: false,
        error: `${label}: pillar must be one of ${AWARENESS_PILLARS.join(", ")}.`,
      };
    }

    const icon = str(raw.icon, 40);
    if (!AWARENESS_ICONS.includes(icon)) {
      return { ok: false, error: `${label}: "${icon || "(blank)"}" isn't a recognised icon.` };
    }

    const title = str(raw.title, MAX_CARD_TITLE);
    if (!title) return { ok: false, error: `${label}: needs a title.` };

    const body = str(raw.body, MAX_CARD_BODY);
    if (!body) return { ok: false, error: `${label}: needs body text.` };

    // Either an admin-uploaded, client-compressed data: URL, or a path into
    // this site's own bundled /Images/ assets (e.g. pre-seeded photos) —
    // never an arbitrary external URL, so this never becomes a hotlinking
    // or mixed-content vector.
    let photo = str(raw.photo, MAX_CARD_PHOTO_CHARS + 1);
    if (photo && !photo.startsWith("data:image/") && !photo.startsWith("/Images/")) {
      return { ok: false, error: `${label}: photo must be an uploaded image.` };
    }
    if (photo.startsWith("data:image/") && photo.length > MAX_CARD_PHOTO_CHARS) {
      return { ok: false, error: `${label}: photo is too large — try a smaller image.` };
    }

    let eventDate = str(raw.eventDate, 10);
    if (eventDate && !EVENT_DATE.test(eventDate)) {
      return { ok: false, error: `${label}: event date must be YYYY-MM-DD.` };
    }

    items.push({
      id: str(raw.id, 60) || `card-${Date.now()}-${i}`,
      pillar,
      icon,
      title,
      body,
      photo,
      caution: raw.caution === true,
      eventDate,
      order: Number.isFinite(raw.order) ? raw.order : i,
      active: raw.active !== false,
    });
  }

  if (JSON.stringify(items).length > MAX_TOTAL_JSON_CHARS) {
    return {
      ok: false,
      error: "The whole set of cards is too large to save — shrink or remove some photos/text.",
    };
  }

  return { ok: true, items };
}

function validateContent(key, input) {
  if (key === "events") return validateEvents(input);
  if (key === "training") return validateTraining(input);
  if (key === "alertBanner") return validateAlertBanner(input);
  if (key === "awarenessCards") return validateAwarenessCards(input);
  return { ok: false, error: "Unknown content type." };
}

module.exports = {
  RECURRENCE,
  ALERT_SEVERITIES,
  AWARENESS_ICONS,
  AWARENESS_PILLARS,
  validateContent,
  validateEvents,
  validateTraining,
  validateAlertBanner,
  validateAwarenessCards,
};
