/**
 * Backend-agnostic handlers for the members' area. Each returns a plain
 * { status, body, setCookie?, clearCookie?, headers? } object so the Azure
 * Function wrappers (api/<fn>/index.js) and the Express mirror (server.js)
 * can share one implementation.
 */

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
} = require("./store");
const { normalizeAuPhone, maskPhone } = require("./phone");
const { sendDutyChangeAlert } = require("./dutyAlert");
const { normalizeEmail, isAllowedDomain, allowedDomain, sessionMinutes } = require("./identity");
const { sendSignInCode } = require("./otpEmail");

const GENERIC_OK = { status: 200, body: { ok: true } };
const CODE_MINUTES = 10;

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

/**
 * Public lookup used by the Twilio flow. Returns { Main: "+61…" } which Twilio
 * parses into widgets.<name>.parsed.Main. If DUTY_LOOKUP_KEY is configured the
 * caller must send it as the X-Duty-Key header. A missing duty record 503s so
 * Twilio takes its own failure branch to the hardcoded fallback number.
 */
async function handleDutyLookup(req, env = process.env) {
  const key = env.DUTY_LOOKUP_KEY;
  if (key) {
    const h = req.headers || {};
    const provided = h["x-duty-key"] || h["X-Duty-Key"];
    if (provided !== key) return { status: 401, body: { error: "Unauthorized" } };
  }
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
  const history = await listDutyHistory(15, env);
  return {
    status: 200,
    body: {
      number: duty ? duty.number : "",
      masked: duty ? maskPhone(duty.number) : "",
      setBy: duty ? duty.setBy : "",
      setByName: duty ? duty.setByName : "",
      method: duty ? duty.method : "",
      setAt: duty ? duty.setAt : "",
      history,
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

  const previous = await getDuty(env);
  const saved = await setDuty(
    { number, setBy: s.member.email, setByName: s.member.displayName, method: "web" },
    env
  );
  await audit(
    "duty_changed",
    { email: s.member.email, detail: `${maskPhone(number)} via web` },
    env
  );
  await notifyDutyChange({ ...saved, previous: previous ? previous.number : "" }, env);

  return {
    status: 200,
    body: { number: saved.number, masked: maskPhone(saved.number), setAt: saved.setAt },
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
  const key = env.DUTY_LOOKUP_KEY;
  if (key) {
    const h = req.headers || {};
    if ((h["x-duty-key"] || h["X-Duty-Key"]) !== key) {
      return { status: 401, body: { error: "Unauthorized" } };
    }
  }
  const body = (req.body && (req.body.Body || req.body.body)) || "";
  const from = normalizeAuPhone((req.body && (req.body.From || req.body.from)) || "");

  const m = String(body)
    .trim()
    .match(/^(brigade|duty|off)\b[\s:]*([0-9]{4,8})?/i);
  if (!m) return { status: 200, body: { handled: false } };

  const command = m[1].toLowerCase();
  const pin = m[2] || "";
  const pinOk = env.DUTY_CLAIM_PIN && pin && pin === env.DUTY_CLAIM_PIN;

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
      { number: fallback, setBy: "", setByName: "SMS: OFF", method: "sms" },
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

module.exports = {
  handleAuthRequest,
  handleAuthVerify,
  handleAuthMe,
  handleDutyLookup,
  handleDutyStatus,
  handleDutySet,
  handleDutyClaim,
  handleAuthLogout,
  handleMembersList,
  handleMembersUpsert,
  handleMembersDelete,
};
