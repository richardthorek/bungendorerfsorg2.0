/**
 * Validation + normalisation for the editable site content
 * ("events" = community events, "training" = the recurring schedule).
 * Returns { ok, items } or { ok:false, error }.
 */

const RECURRENCE =
  /^(every|first|second|third|fourth|last)-(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;

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

function validateContent(key, input) {
  if (key === "events") return validateEvents(input);
  if (key === "training") return validateTraining(input);
  return { ok: false, error: "Unknown content type." };
}

module.exports = { RECURRENCE, validateContent, validateEvents, validateTraining };
