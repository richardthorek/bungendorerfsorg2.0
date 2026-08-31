/**
 * Backend-agnostic handlers for the members' area. Each returns a plain
 * { status, body, setCookie?, clearCookie?, headers? } object so the Azure
 * Function wrappers (api/<fn>/index.js) and the Express mirror (server.js)
 * can share one implementation.
 */

const crypto = require("crypto");
const {
  generateCode,
  hashCode,
  codeMatches,
  codeExpiry,
  isExpired,
  issueSession,
  sessionCookie,
  getClientIp,
  hasCsrfHeader,
  resolveSession,
  MAX_CODE_ATTEMPTS,
} = require("./auth");
const {
  getMember,
  listMembers,
  upsertMember,
  deleteMember,
  bumpTokenVersion,
  touchMemberLogin,
  getAuthCode,
  putAuthCode,
  updateAuthCode,
  deleteAuthCode,
  hitRateLimit,
  audit,
  getDuty,
  setDuty,
  listDutyHistory,
  listDutyContacts,
  getContent,
  setContent,
  listEnquiries,
  getEnquiry,
  updateEnquiry,
  deleteEnquiry,
  getSocialPromptConfig,
  setSocialPromptConfig,
} = require("./store");
const { validateContent } = require("./contentSchema");
const { chatTurn, DEFAULT_SYSTEM_PROMPT } = require("./aiCopy");

const ENQUIRY_STATUSES = ["new", "in-progress", "resolved"];
const { normalizeAuPhone, maskPhone } = require("./phone");
const { sendDutyChangeAlert } = require("./dutyAlert");
const { normalizeEmail, isAllowedDomain, allowedDomain, sessionMinutes } = require("./identity");
const { sendSignInCode } = require("./otpEmail");

const GENERIC_OK = { status: 200, body: { ok: true } };
const CODE_MINUTES = 10;

/** Length-safe, constant-time string comparison for shared secrets / PINs. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a == null ? "" : a));
  const bb = Buffer.from(String(b == null ? "" : b));
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/* ------------------------------------------------------------- POST /auth/request */

async function handleAuthRequest(req, env = process.env) {
  const ip = getClientIp(req);
  const email = normalizeEmail(req.body && req.body.email);

  // Rate-limit on the raw email + IP *before* any lookup, so members and
  // non-members are throttled identically (no enumeration via 429).
  const emailKey = `req:email:${email || "invalid"}`;
  const ipKey = `req:ip:${ip}`;
  const [byEmail, byIp] = await Promise.all([
    email ? hitRateLimit(emailKey, { max: 3, windowSeconds: 900 }, env) : { allowed: true },
    hitRateLimit(ipKey, { max: 12, windowSeconds: 900 }, env),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    const retry = Math.max(byEmail.retryAfterSeconds || 0, byIp.retryAfterSeconds || 0);
    return {
      status: 429,
      headers: { "Retry-After": String(retry) },
      body: { error: "Too many requests. Try again shortly." },
    };
  }

  if (!email || !isAllowedDomain(email, env)) {
    await audit(
      "signin_request_rejected",
      { email: email || "(invalid)", ip, detail: "domain" },
      env
    );
    return GENERIC_OK;
  }

  const member = await getMember(email, env);
  if (!member || member.disabled) {
    await audit("signin_request_rejected", { email, ip, detail: "not_allow_listed" }, env);
    return GENERIC_OK;
  }

  const code = generateCode();
  await putAuthCode(
    email,
    {
      codeHash: hashCode(code, email, env),
      expiresAt: codeExpiry(),
      attempts: 0,
      sentAt: new Date().toISOString(),
    },
    env
  );

  try {
    await sendSignInCode(email, code, CODE_MINUTES, { env });
  } catch (err) {
    await audit("signin_code_send_failed", { email, ip, detail: err.message }, env);
    return { status: 502, body: { error: "Could not send the code. Try again in a minute." } };
  }

  await audit("signin_code_sent", { email, ip }, env);
  return GENERIC_OK;
}

/* -------------------------------------------------------------- POST /auth/verify */

async function handleAuthVerify(req, env = process.env) {
  const ip = getClientIp(req);
  const email = normalizeEmail(req.body && req.body.email);
  const code = String((req.body && req.body.code) || "").trim();

  const byIp = await hitRateLimit(`verify:ip:${ip}`, { max: 20, windowSeconds: 900 }, env);
  if (!byIp.allowed) {
    return {
      status: 429,
      headers: { "Retry-After": String(byIp.retryAfterSeconds) },
      body: { error: "Too many attempts. Try again shortly." },
    };
  }

  const invalid = { status: 400, body: { error: "That code is invalid or has expired." } };
  if (!email || !/^\d{6}$/.test(code)) return invalid;

  const record = await getAuthCode(email, env);
  if (!record || isExpired(record.expiresAt)) {
    if (record) await deleteAuthCode(email, env);
    return invalid;
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await deleteAuthCode(email, env);
    return { status: 400, body: { error: "Too many wrong attempts. Request a new code." } };
  }
  if (!codeMatches(code, email, record.codeHash, env)) {
    await updateAuthCode(email, { attempts: record.attempts + 1 }, env);
    await audit("signin_code_wrong", { email, ip }, env);
    return invalid;
  }

  const member = await getMember(email, env);
  if (!member || member.disabled || !isAllowedDomain(email, env)) {
    await deleteAuthCode(email, env);
    await audit("signin_rejected_after_code", { email, ip }, env);
    return { status: 403, body: { error: "This account can no longer sign in." } };
  }

  await deleteAuthCode(email, env);
  await touchMemberLogin(email, env);
  await audit("signin_success", { email, ip }, env);

  return {
    status: 200,
    body: {
      ok: true,
      member: { email: member.email, name: member.displayName, role: member.role },
      expiresInMinutes: sessionMinutes(env),
    },
    setCookie: sessionCookie(issueSession(member, env), env),
  };
}

/* ------------------------------------------------------------------ /auth/me, logout */

async function handleAuthMe(req, env = process.env) {
  const s = await resolveSession(req, {}, env);
  if (!s.ok) return { status: s.status, body: { error: s.error } };
  return {
    status: 200,
    body: {
      email: s.member.email,
      name: s.member.displayName,
      role: s.member.role,
      expiresAt: s.expiresAt,
    },
  };
}

async function handleAuthLogout(req, env = process.env) {
  if (!hasCsrfHeader(req || { headers: {} })) {
    return { status: 403, body: { error: "Bad request" } };
  }
  // Bump the member's tokenVersion so the just-issued JWT can't be replayed
  // after sign-out (sessions are otherwise stateless).
  try {
    const s = await resolveSession(req || { headers: {} }, {}, env);
    if (s.ok) {
      await bumpTokenVersion(s.member.email, env);
      await audit(
        "signout",
        { email: s.member.email, ip: getClientIp(req || { headers: {} }) },
        env
      );
    }
  } catch {
    /* clearing the cookie is enough even if the bump fails */
  }
  return { status: 200, body: { ok: true }, clearCookie: true };
}

/* --------------------------------------------------------------------- /members */

async function requireAdmin(req, env) {
  const s = await resolveSession(req, { role: "admin" }, env);
  if (!s.ok) return { error: { status: s.status, body: { error: s.error } } };
  return { member: s.member };
}

async function handleMembersList(req, env = process.env) {
  const gate = await requireAdmin(req, env);
  if (gate.error) return gate.error;
  return { status: 200, body: { members: await listMembers(env) } };
}

async function handleMembersUpsert(req, env = process.env) {
  const gate = await requireAdmin(req, env);
  if (gate.error) return gate.error;
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };

  const email = normalizeEmail(req.body && req.body.email);
  const displayName = String((req.body && req.body.displayName) || "")
    .trim()
    .slice(0, 120);
  const role = (req.body && req.body.role) === "admin" ? "admin" : "member";
  const rawPhone = (req.body && req.body.phone) || "";
  const phone = rawPhone ? normalizeAuPhone(rawPhone) : "";

  if (!email) return { status: 400, body: { error: "A valid email address is required." } };
  if (!isAllowedDomain(email, env)) {
    return { status: 400, body: { error: `Only @${allowedDomain(env)} addresses can be added.` } };
  }
  if (rawPhone && !phone) {
    return { status: 400, body: { error: "That phone number doesn't look right." } };
  }

  const existed = await getMember(email, env);
  if (existed && existed.role === "admin" && role !== "admin") {
    const admins = (await listMembers(env)).filter((m) => m.role === "admin" && !m.disabled);
    if (admins.length <= 1) {
      return {
        status: 400,
        body: { error: "Can't demote the last admin. Add another admin first." },
      };
    }
  }

  const saved = await upsertMember(
    { email, displayName, phone, role, disabled: false, addedBy: gate.member.email },
    env
  );
  await audit(
    existed ? "member_updated" : "member_added",
    {
      email,
      detail: `by ${gate.member.email}; role=${role}`,
    },
    env
  );
  return { status: existed ? 200 : 201, body: { member: saved } };
}

async function handleMembersDelete(req, email, env = process.env) {
  const gate = await requireAdmin(req, env);
  if (gate.error) return gate.error;
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };

  const target = normalizeEmail(email);
  if (!target) return { status: 400, body: { error: "Unknown member." } };

  const member = await getMember(target, env);
  if (!member) return { status: 404, body: { error: "That member is not on the list." } };

  if (member.role === "admin") {
    const admins = (await listMembers(env)).filter((m) => m.role === "admin" && !m.disabled);
    if (admins.length <= 1) {
      return {
        status: 400,
        body: { error: "Can't remove the last admin. Add another admin first." },
      };
    }
  }

  await bumpTokenVersion(target, env); // kill any live session
  await deleteMember(target, env);
  await audit("member_removed", { email: target, detail: `by ${gate.member.email}` }, env);
  return { status: 200, body: { ok: true } };
}

/* ----------------------------------------------------------------- duty line */

/** DUTY_LOOKUP_KEY may arrive as the X-Duty-Key header or a ?key= query param. */
function dutyKeyOk(req, env) {
  const key = env.DUTY_LOOKUP_KEY;
  if (!key) return true;
  const h = req.headers || {};
  const q = req.query || {};
  const provided = h["x-duty-key"] || h["X-Duty-Key"] || q.key || q.Key;
  return safeEqual(provided, key);
}

/**
 * Public lookup used by the Twilio flow. Returns { Main: "+61…" } which Twilio
 * parses into widgets.<name>.parsed.Main. If DUTY_LOOKUP_KEY is configured the
 * caller must send it (X-Duty-Key header or ?key= query param). A missing duty
 * record 503s so Twilio takes its own failure branch to the fallback number.
 */
async function handleDutyLookup(req, env = process.env) {
  if (!dutyKeyOk(req, env)) return { status: 401, body: { error: "Unauthorized" } };
  const duty = await getDuty(env);
  if (!duty || !duty.number) {
    return { status: 503, body: { error: "No duty number set" } };
  }
  return { status: 200, body: { Main: duty.number } };
}

async function handleDutyStatus(req, env = process.env) {
  const s = await resolveSession(req, {}, env);
  if (!s.ok) return { status: s.status, body: { error: s.error } };
  const duty = await getDuty(env);
  const contacts = (await listDutyContacts(10, env)).filter(
    (c) => !duty || c.number !== duty.number
  );
  // Only admins see the setter's email address; every member sees the name.
  const isAdmin = s.member.role === "admin";
  return {
    status: 200,
    body: {
      number: duty ? duty.number : "",
      label: duty ? duty.label : "",
      masked: duty ? maskPhone(duty.number) : "",
      setBy: duty && isAdmin ? duty.setBy : "",
      setByName: duty ? duty.setByName : "",
      method: duty ? duty.method : "",
      setAt: duty ? duty.setAt : "",
      contacts,
    },
  };
}

async function handleDutySet(req, env = process.env) {
  const s = await resolveSession(req, {}, env);
  if (!s.ok) return { status: s.status, body: { error: s.error } };
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };

  const number = normalizeAuPhone(req.body && req.body.number);
  if (!number) {
    return { status: 400, body: { error: "Enter a valid Australian phone number." } };
  }
  const label = String((req.body && req.body.label) || "")
    .trim()
    .slice(0, 60);

  const previous = await getDuty(env);
  const saved = await setDuty(
    { number, label, setBy: s.member.email, setByName: s.member.displayName, method: "web" },
    env
  );
  await audit(
    "duty_changed",
    { email: s.member.email, detail: `${label || maskPhone(number)} via web` },
    env
  );
  await notifyDutyChange({ ...saved, previous: previous ? previous.number : "" }, env);

  return {
    status: 200,
    body: {
      number: saved.number,
      label: saved.label,
      masked: maskPhone(saved.number),
      setAt: saved.setAt,
    },
  };
}

/* Fire the change alert without ever failing the request. */
async function notifyDutyChange(change, env) {
  try {
    await sendDutyChangeAlert(change, { env });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`duty change alert failed: ${err.message}`);
  }
}

/**
 * Twilio SMS webhook for taking the brigade phone by text. Body forms:
 *   BRIGADE 4821   (or DUTY 4821)  -> forward calls to the sender's number
 *   OFF 4821                       -> revert to DUTY_FALLBACK_NUMBER
 * Anything else -> { handled:false } so the Twilio flow forwards the text as usual.
 * Requires DUTY_CLAIM_PIN to be configured.
 */
async function handleDutyClaim(req, env = process.env) {
  if (!dutyKeyOk(req, env)) return { status: 401, body: { error: "Unauthorized" } };
  const body = (req.body && (req.body.Body || req.body.body)) || "";
  const from = normalizeAuPhone((req.body && (req.body.From || req.body.from)) || "");

  const m = String(body)
    .trim()
    .match(/^(brigade|duty|off)\b[\s:]*([0-9]{4,8})?/i);
  if (!m) return { status: 200, body: { handled: false } };

  const command = m[1].toLowerCase();
  const pin = m[2] || "";
  const pinOk = Boolean(env.DUTY_CLAIM_PIN) && safeEqual(pin, env.DUTY_CLAIM_PIN);

  const ip = getClientIp(req);
  const rl = await hitRateLimit(`claim:${from || ip}`, { max: 5, windowSeconds: 900 }, env);
  if (!rl.allowed) {
    return { status: 200, body: { handled: true, reply: "Too many attempts. Try again later." } };
  }

  if (!pinOk) {
    await audit("duty_claim_rejected", { detail: `${maskPhone(from) || ip} bad/missing PIN` }, env);
    return {
      status: 200,
      body: { handled: true, reply: "Sorry — that PIN wasn't right. No change made." },
    };
  }

  const previous = await getDuty(env);

  if (command === "off") {
    const fallback = normalizeAuPhone(env.DUTY_FALLBACK_NUMBER || "");
    if (!fallback) {
      return {
        status: 200,
        body: { handled: true, reply: "No backup number is configured. Ask an admin." },
      };
    }
    const saved = await setDuty(
      { number: fallback, label: "Backup number", setBy: "", setByName: "SMS: OFF", method: "sms" },
      env
    );
    await audit(
      "duty_changed",
      { detail: `${maskPhone(fallback)} via SMS OFF from ${maskPhone(from)}` },
      env
    );
    await notifyDutyChange({ ...saved, previous: previous ? previous.number : "" }, env);
    return {
      status: 200,
      body: {
        handled: true,
        reply: `Done. Brigade calls now go to the backup number. — Bungendore RFS`,
      },
    };
  }

  // BRIGADE / DUTY: forward to the sender's own number
  if (!from) {
    return {
      status: 200,
      body: { handled: true, reply: "Couldn't read your number. Try from an Australian mobile." },
    };
  }

  const member = await findMemberByPhone(from, env);
  const saved = await setDuty(
    {
      number: from,
      label: member ? member.displayName || "" : "",
      setBy: member ? member.email : "",
      setByName: member ? member.displayName || "" : "",
      method: "sms",
    },
    env
  );
  await audit(
    "duty_changed",
    {
      email: member ? member.email : "",
      detail: `${maskPhone(from)} via SMS`,
    },
    env
  );
  await notifyDutyChange({ ...saved, previous: previous ? previous.number : "" }, env);

  return {
    status: 200,
    body: {
      handled: true,
      reply:
        "You're on. Calls and texts to the brigade now ring this phone. Reply OFF <PIN> to hand back. — Bungendore RFS",
    },
  };
}

async function findMemberByPhone(e164, env) {
  if (!e164) return null;
  const members = await listMembers(env);
  return members.find((m) => m.phone && normalizeAuPhone(m.phone) === e164) || null;
}

/* ------------------------------------------------------- editable site content */

/** Public — returns the plain array (same shape the static JSON files had). */
async function handleContentGet(key, env = process.env) {
  if (key !== "events" && key !== "training") {
    return { status: 404, body: { error: "Not found" } };
  }
  const content = await getContent(key, env);
  return {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300" },
    body: content ? content.items : [],
  };
}

/** Members only — replaces the whole list after validation. */
async function handleContentSet(key, req, env = process.env) {
  const s = await resolveSession(req, {}, env);
  if (!s.ok) return { status: s.status, body: { error: s.error } };
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };

  const incoming = req.body && (Array.isArray(req.body) ? req.body : req.body.items);
  const result = validateContent(key, incoming);
  if (!result.ok) return { status: 400, body: { error: result.error } };

  const saved = await setContent(key, result.items, s.member.email, env);
  await audit(
    "content_updated",
    {
      email: s.member.email,
      detail: `${key} (${result.items.length} items)`,
    },
    env
  );
  return {
    status: 200,
    body: { items: saved.items, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt },
  };
}

/* --------------------------------------------------------------- enquiries */

async function handleEnquiriesList(req, env = process.env) {
  const s = await resolveSession(req, {}, env);
  if (!s.ok) return { status: s.status, body: { error: s.error } };
  return { status: 200, body: { enquiries: await listEnquiries(500, env) } };
}

async function handleEnquiryUpdate(id, req, env = process.env) {
  const s = await resolveSession(req, {}, env);
  if (!s.ok) return { status: s.status, body: { error: s.error } };
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };

  const existing = await getEnquiry(id, env);
  if (!existing) return { status: 404, body: { error: "That enquiry no longer exists." } };

  const body = req.body || {};
  const patch = {};

  if (body.status != null) {
    if (!ENQUIRY_STATUSES.includes(body.status)) {
      return { status: 400, body: { error: "Unknown status." } };
    }
    patch.status = body.status;
    if (body.status !== "new" && !existing.handledBy) patch.handledBy = s.member.email;
  }

  const noteText = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  if (noteText) {
    patch.notes = existing.notes.concat({
      by: s.member.displayName || s.member.email,
      at: new Date().toISOString(),
      text: noteText,
    });
  }

  if (!patch.status && !patch.notes) {
    return { status: 400, body: { error: "Nothing to update." } };
  }

  const updated = await updateEnquiry(id, patch, env);
  await audit(
    "enquiry_updated",
    {
      email: s.member.email,
      detail: `${id} ${patch.status ? "→ " + patch.status : ""}${noteText ? " +note" : ""}`,
    },
    env
  );
  return { status: 200, body: { enquiry: updated } };
}

async function handleEnquiryDelete(id, req, env = process.env) {
  const gate = await requireAdmin(req, env);
  if (gate.error) return gate.error;
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };
  await deleteEnquiry(id, env);
  await audit("enquiry_deleted", { email: gate.member.email, detail: id }, env);
  return { status: 200, body: { ok: true } };
}

/* ------------------------------------------------------- social copy assist */

const MAX_TRANSCRIPT_MESSAGES = 24;
const MAX_CHAT_TEXT_LEN = 2000;
const MAX_IMAGE_DATA_URL_LEN = 3_000_000; // ~2.2MB decoded; client downsizes before sending
const MAX_SOCIAL_PROMPT_LEN = 6000;

function str300(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Cap message count/length and keep only the most recent attached photo
 * (scanning from the end) — bounds request size and vision-token cost.
 */
function sanitizeTranscript(input) {
  if (!Array.isArray(input) || !input.length) {
    return { ok: false, error: "Say something first." };
  }
  const trimmed = input.slice(-MAX_TRANSCRIPT_MESSAGES);
  let keptImage = false;
  const out = [];
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const raw = trimmed[i];
    const role = raw && raw.role === "assistant" ? "assistant" : "user";
    const text = str300(raw && raw.text, MAX_CHAT_TEXT_LEN);
    let image;
    if (raw && raw.image && !keptImage) {
      if (
        typeof raw.image !== "string" ||
        !/^data:image\/(png|jpeg|webp);base64,/.test(raw.image)
      ) {
        return { ok: false, error: "That photo couldn't be read." };
      }
      if (raw.image.length > MAX_IMAGE_DATA_URL_LEN) {
        return { ok: false, error: "That photo is too large." };
      }
      image = raw.image;
      keptImage = true;
    }
    if (!text && !image) continue;
    out.unshift({ role, text, image });
  }
  if (!out.length) return { ok: false, error: "Say something first." };
  return { ok: true, transcript: out };
}

/** Members only — a chat turn that returns a reply plus the live draft, safety-flagged. */
async function handleSocialChat(req, env = process.env) {
  const s = await resolveSession(req, {}, env);
  if (!s.ok) return { status: s.status, body: { error: s.error } };
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };

  const ip = getClientIp(req);
  const rl = await hitRateLimit(`social:${s.member.email}`, { max: 60, windowSeconds: 3600 }, env);
  if (!rl.allowed) {
    return {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
      body: { error: "Too many requests. Try again shortly." },
    };
  }

  const body = req.body || {};
  const parsed = sanitizeTranscript(body.messages);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };

  const cfg = await getSocialPromptConfig(env);
  const systemPrompt = (cfg && cfg.prompt) || DEFAULT_SYSTEM_PROMPT;

  let out;
  try {
    out = await chatTurn({ systemPrompt, transcript: parsed.transcript }, env);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`social chat failed: ${err.message}`);
    return { status: 502, body: { error: "Could not reach the assistant. Try again shortly." } };
  }

  await audit(
    "social_chat_message",
    { email: s.member.email, ip, detail: out.draft ? `${out.draft.flags.length} flag(s)` : "" },
    env
  );

  return { status: 200, body: out };
}

/* --------------------------------------------------- social AI guidelines (admin) */

async function handleSocialPromptGet(req, env = process.env) {
  const gate = await requireAdmin(req, env);
  if (gate.error) return gate.error;
  const cfg = await getSocialPromptConfig(env);
  return {
    status: 200,
    body: {
      prompt: (cfg && cfg.prompt) || DEFAULT_SYSTEM_PROMPT,
      isDefault: !cfg,
      defaultPrompt: DEFAULT_SYSTEM_PROMPT,
      updatedBy: cfg ? cfg.updatedBy : "",
      updatedAt: cfg ? cfg.updatedAt : "",
    },
  };
}

async function handleSocialPromptSet(req, env = process.env) {
  const gate = await requireAdmin(req, env);
  if (gate.error) return gate.error;
  if (!hasCsrfHeader(req)) return { status: 403, body: { error: "Bad request" } };

  const rawPrompt = req.body && req.body.prompt;
  if (typeof rawPrompt === "string" && rawPrompt.trim().length > MAX_SOCIAL_PROMPT_LEN) {
    return {
      status: 400,
      body: { error: `Guidelines are too long (max ${MAX_SOCIAL_PROMPT_LEN} characters).` },
    };
  }
  const prompt = str300(rawPrompt, MAX_SOCIAL_PROMPT_LEN);
  if (!prompt) return { status: 400, body: { error: "Guidelines can't be empty." } };

  const saved = await setSocialPromptConfig(prompt, gate.member.email, env);
  await audit(
    "social_prompt_updated",
    { email: gate.member.email, detail: `${prompt.length} chars` },
    env
  );
  return {
    status: 200,
    body: {
      prompt: saved.prompt,
      isDefault: false,
      defaultPrompt: DEFAULT_SYSTEM_PROMPT,
      updatedBy: saved.updatedBy,
      updatedAt: saved.updatedAt,
    },
  };
}

module.exports = {
  handleAuthRequest,
  handleAuthVerify,
  handleAuthMe,
  handleEnquiriesList,
  handleEnquiryUpdate,
  handleEnquiryDelete,
  handleDutyLookup,
  handleDutyStatus,
  handleDutySet,
  handleDutyClaim,
  handleContentGet,
  handleContentSet,
  handleAuthLogout,
  handleMembersList,
  handleMembersUpsert,
  handleMembersDelete,
  handleSocialChat,
  handleSocialPromptGet,
  handleSocialPromptSet,
};
