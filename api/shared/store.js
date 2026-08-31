/**
 * Table Storage layer for the members' area (allow-list, sign-in codes,
 * rate limits, audit log). One Azure Storage account — `brfsstorage` in
 * production — addressed by BRFS_STORAGE_CONNECTION.
 *
 * Tables (all created on first use):
 *   members    PK "member"  RK <email>  — the allow-list
 *   authcodes  PK "code"    RK <email>  — one pending sign-in code per person
 *   ratelimits PK "rl"      RK <key>    — sliding-ish windows for abuse control
 *   auditlog   PK <yyyy-mm-dd> RK <ts>-<rand>
 *   duty       PK "duty"   RK "current" — the number the public line forwards to;
 *                          PK "duty"   RK "h:<reverse-ts>" — recent change history
 */

const crypto = require("crypto");
const { TableClient } = require("@azure/data-tables");

const TABLES = {
  members: "members",
  codes: "authcodes",
  rate: "ratelimits",
  audit: "auditlog",
  duty: "duty",
  content: "content",
  enquiries: "enquiries",
};

let clients = null;
let ready = null;

function connectionString(env) {
  const cs = (env || process.env).BRFS_STORAGE_CONNECTION;
  if (!cs) throw new Error("BRFS_STORAGE_CONNECTION is not configured");
  return cs;
}

/** Build (and memoize) a TableClient per table. */
function tables(env) {
  if (clients) return clients;
  const cs = connectionString(env);
  clients = {};
  for (const [key, name] of Object.entries(TABLES)) {
    clients[key] = TableClient.fromConnectionString(cs, name, { allowInsecureConnection: true });
  }
  return clients;
}

/**
 * Resolve once every table exists, then hand back the clients. Every public
 * function awaits this first so operations never race table creation.
 */
async function db(env) {
  const t = tables(env);
  if (!ready) {
    ready = Promise.all(
      Object.entries(TABLES).map(([key, name]) =>
        t[key].createTable().catch((err) => {
          if (err && err.statusCode !== 409) {
            // eslint-disable-next-line no-console
            console.error(`createTable(${name}) failed: ${err.message}`);
          }
        })
      )
    );
  }
  await ready;
  return t;
}

/** For tests / connection changes. */
function _reset() {
  clients = null;
  ready = null;
}

async function getEntity(client, partitionKey, rowKey) {
  try {
    return await client.getEntity(partitionKey, rowKey);
  } catch (err) {
    if (err && err.statusCode === 404) return null;
    throw err;
  }
}

/* ------------------------------------------------------------------ members */

function memberFromEntity(e) {
  if (!e) return null;
  return {
    email: e.rowKey,
    displayName: e.displayName || "",
    phone: e.phone || "",
    role: e.role === "admin" ? "admin" : "member",
    disabled: !!e.disabled,
    tokenVersion: typeof e.tokenVersion === "number" ? e.tokenVersion : 0,
    addedBy: e.addedBy || "",
    addedAt: e.addedAt || "",
    lastLoginAt: e.lastLoginAt || "",
  };
}

async function getMember(email, env) {
  const e = await getEntity((await db(env)).members, "member", email);
  return memberFromEntity(e);
}

async function listMembers(env) {
  const out = [];
  const iter = (await db(env)).members.listEntities({
    queryOptions: { filter: "PartitionKey eq 'member'" },
  });
  for await (const e of iter) out.push(memberFromEntity(e));
  out.sort((a, b) => a.email.localeCompare(b.email));
  return out;
}

/** Create or update a member. Preserves tokenVersion/addedAt when the row exists. */
async function upsertMember({ email, displayName, phone, role, disabled, addedBy }, env) {
  const existing = await getMember(email, env);
  const entity = {
    partitionKey: "member",
    rowKey: email,
    displayName: displayName != null ? displayName : existing ? existing.displayName : "",
    phone: phone != null ? phone : existing ? existing.phone : "",
    role: role === "admin" ? "admin" : "member",
    disabled: disabled != null ? !!disabled : existing ? existing.disabled : false,
    tokenVersion: existing ? existing.tokenVersion : 0,
    addedBy: existing ? existing.addedBy : addedBy || "",
    addedAt: existing ? existing.addedAt : new Date().toISOString(),
  };
  await (await db(env)).members.upsertEntity(entity, "Replace");
  return memberFromEntity(entity);
}

async function deleteMember(email, env) {
  try {
    await (await db(env)).members.deleteEntity("member", email);
  } catch (err) {
    if (!err || err.statusCode !== 404) throw err;
  }
}

/** Force existing sessions for this member to expire (used on disable / role change). */
async function bumpTokenVersion(email, env) {
  const m = await getMember(email, env);
  if (!m) return;
  await (
    await db(env)
  ).members.updateEntity(
    { partitionKey: "member", rowKey: email, tokenVersion: m.tokenVersion + 1 },
    "Merge"
  );
}

async function touchMemberLogin(email, env) {
  try {
    await (
      await db(env)
    ).members.updateEntity(
      { partitionKey: "member", rowKey: email, lastLoginAt: new Date().toISOString() },
      "Merge"
    );
  } catch (err) {
    if (!err || err.statusCode !== 404) throw err;
  }
}

/* --------------------------------------------------------------- sign-in codes */

async function getAuthCode(email, env) {
  const e = await getEntity((await db(env)).codes, "code", email);
  if (!e) return null;
  return {
    email,
    codeHash: e.codeHash || "",
    expiresAt: e.expiresAt || "",
    attempts: typeof e.attempts === "number" ? e.attempts : 0,
    sentAt: e.sentAt || "",
    sendCount: typeof e.sendCount === "number" ? e.sendCount : 0,
    windowStartAt: e.windowStartAt || "",
  };
}

async function putAuthCode(email, fields, env) {
  await (
    await db(env)
  ).codes.upsertEntity({ partitionKey: "code", rowKey: email, ...fields }, "Replace");
}

async function updateAuthCode(email, fields, env) {
  await (
    await db(env)
  ).codes.updateEntity({ partitionKey: "code", rowKey: email, ...fields }, "Merge");
}

async function deleteAuthCode(email, env) {
  try {
    await (await db(env)).codes.deleteEntity("code", email);
  } catch (err) {
    if (!err || err.statusCode !== 404) throw err;
  }
}

/* ------------------------------------------------------------- rate limiting */

/**
 * Fixed-window counter. Returns { allowed, remaining, retryAfterSeconds }.
 * `key` should already be namespaced by the caller (e.g. "req:email:x@y").
 */
async function hitRateLimit(key, { max, windowSeconds }, env) {
  const now = Date.now();
  const client = (await db(env)).rate;
  const existing = await getEntity(client, "rl", key);
  let count = 0;
  let windowStart = now;

  if (existing && existing.windowStartMs && now - existing.windowStartMs < windowSeconds * 1000) {
    count = existing.count || 0;
    windowStart = existing.windowStartMs;
  }

  count += 1;
  await client.upsertEntity(
    { partitionKey: "rl", rowKey: key, count, windowStartMs: windowStart },
    "Replace"
  );

  // Table Storage has no TTL, so IP-keyed counters would accumulate forever.
  // Opportunistically sweep stale rows on a small fraction of calls.
  if (Math.random() < 0.02) {
    purgeExpiredRateLimits(env).catch(() => {});
  }

  if (count > max) {
    const retryAfterSeconds = Math.ceil((windowStart + windowSeconds * 1000 - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }
  return { allowed: true, remaining: max - count, retryAfterSeconds: 0 };
}

/**
 * Delete rate-limit rows whose window closed more than `olderThanMs` ago
 * (default 24h). Bounded per pass so it never turns into a long scan.
 */
async function purgeExpiredRateLimits(env, olderThanMs = 86_400_000) {
  const client = (await db(env)).rate;
  const cutoff = Date.now() - olderThanMs;
  const dead = [];
  const iter = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'rl'" } });
  for await (const e of iter) {
    if (!e.windowStartMs || e.windowStartMs < cutoff) dead.push(e.rowKey);
    if (dead.length >= 200) break;
  }
  await Promise.all(dead.map((rowKey) => client.deleteEntity("rl", rowKey).catch(() => {})));
  return dead.length;
}

/* --------------------------------------------------------------------- audit */

async function audit(event, { email = "", ip = "", detail = "" } = {}, env) {
  const now = new Date();
  const rowKey = `${now.toISOString()}-${crypto.randomBytes(4).toString("hex")}`;
  try {
    await (
      await db(env)
    ).audit.createEntity({
      partitionKey: now.toISOString().slice(0, 10),
      rowKey,
      event,
      email,
      ip,
      detail: typeof detail === "string" ? detail : JSON.stringify(detail),
    });
  } catch (err) {
    // Never let audit failure break a request
    // eslint-disable-next-line no-console
    console.error(`audit(${event}) failed: ${err.message}`);
  }
}

/* ---------------------------------------------------------------------- duty */

function dutyFromEntity(e) {
  if (!e) return null;
  return {
    number: e.number || "",
    label: e.label || "",
    setBy: e.setBy || "",
    setByName: e.setByName || "",
    method: e.method || "",
    setAt: e.setAt || "",
  };
}

async function getDuty(env) {
  return dutyFromEntity(await getEntity((await db(env)).duty, "duty", "current"));
}

/**
 * Set the forwarding number and append a history row.
 * @param {{number:string, label?:string, setBy?:string, setByName?:string, method:string}} entry
 */
async function setDuty(entry, env) {
  const setAt = new Date().toISOString();
  const fields = {
    number: entry.number,
    label: entry.label || "",
    setBy: entry.setBy || "",
    setByName: entry.setByName || "",
    method: entry.method || "",
    setAt,
  };
  await (
    await db(env)
  ).duty.upsertEntity({ partitionKey: "duty", rowKey: "current", ...fields }, "Replace");
  // reverse-timestamp row key so listing is newest-first
  const reverse = String(1e15 - Date.now()).padStart(16, "0");
  await (
    await db(env)
  ).duty.createEntity({
    partitionKey: "duty",
    rowKey: `h:${reverse}`,
    ...fields,
  });
  return dutyFromEntity({ ...fields, rowKey: "current" });
}

async function listDutyHistory(limit, env) {
  const out = [];
  const iter = (await db(env)).duty.listEntities({
    queryOptions: { filter: "PartitionKey eq 'duty' and RowKey gt 'h:' and RowKey lt 'h;'" },
  });
  for await (const e of iter) {
    out.push({
      number: e.number || "",
      label: e.label || "",
      setBy: e.setBy || "",
      setByName: e.setByName || "",
      method: e.method || "",
      setAt: e.setAt || "",
    });
    if (out.length >= (limit || 40)) break;
  }
  return out;
}

/** Distinct numbers used before, newest first — the quick-pick list. */
async function listDutyContacts(limit, env) {
  const history = await listDutyHistory(80, env);
  const seen = new Set();
  const out = [];
  for (const h of history) {
    if (!h.number || seen.has(h.number)) continue;
    seen.add(h.number);
    out.push({ number: h.number, label: h.label || "", lastUsedAt: h.setAt });
    if (out.length >= (limit || 10)) break;
  }
  return out;
}

/* ------------------------------------------------------------------- content */

/** Editable site content stored as one JSON array per key ("events" / "training"). */
async function getContent(key, env) {
  const e = await getEntity((await db(env)).content, "content", key);
  if (!e || !e.json) return null;
  try {
    const parsed = JSON.parse(e.json);
    return {
      items: Array.isArray(parsed) ? parsed : [],
      updatedBy: e.updatedBy || "",
      updatedAt: e.updatedAt || "",
    };
  } catch {
    return { items: [], updatedBy: "", updatedAt: "" };
  }
}

async function setContent(key, items, updatedBy, env) {
  const updatedAt = new Date().toISOString();
  await (
    await db(env)
  ).content.upsertEntity(
    {
      partitionKey: "content",
      rowKey: key,
      json: JSON.stringify(Array.isArray(items) ? items : []),
      updatedBy: updatedBy || "",
      updatedAt,
    },
    "Replace"
  );
  return { items, updatedBy, updatedAt };
}

/* ----------------------------------------------------------------- enquiries */

function enquiryFromEntity(e) {
  if (!e) return null;
  let notes = [];
  try {
    notes = e.notes ? JSON.parse(e.notes) : [];
  } catch {
    notes = [];
  }
  return {
    id: e.rowKey,
    name: e.name || "",
    email: e.email || "",
    phone: e.phone || "",
    message: e.message || "",
    source: e.source || "website",
    legacyRef: e.legacyRef || "",
    receivedAt: e.receivedAt || "",
    status: e.status || "new",
    handledBy: e.handledBy || "",
    notes: Array.isArray(notes) ? notes : [],
    updatedAt: e.updatedAt || "",
  };
}

/** Newest-first row key: reverse timestamp of when the enquiry came in. */
function enquiryRowKey(receivedMs) {
  const reverse = String(1e15 - receivedMs).padStart(16, "0");
  return `${reverse}-${crypto.randomBytes(3).toString("hex")}`;
}

async function recordEnquiry(data, env) {
  const receivedAt = data.receivedAt || new Date().toISOString();
  const receivedMs = Date.parse(receivedAt) || Date.now();
  const id = enquiryRowKey(receivedMs);
  await (
    await db(env)
  ).enquiries.createEntity({
    partitionKey: "enquiry",
    rowKey: id,
    name: String(data.name || "").slice(0, 200),
    email: String(data.email || "").slice(0, 254),
    phone: String(data.phone || "").slice(0, 40),
    message: String(data.message || "").slice(0, 4000),
    source: data.source || "website",
    legacyRef: data.legacyRef ? String(data.legacyRef).slice(0, 40) : "",
    receivedAt,
    status: "new",
    handledBy: "",
    notes: "[]",
    updatedAt: receivedAt,
  });
  return id;
}

async function listEnquiries(limit, env) {
  const out = [];
  const iter = (await db(env)).enquiries.listEntities({
    queryOptions: { filter: "PartitionKey eq 'enquiry'" },
  });
  for await (const e of iter) {
    out.push(enquiryFromEntity(e));
    if (out.length >= (limit || 500)) break;
  }
  return out;
}

async function getEnquiry(id, env) {
  return enquiryFromEntity(await getEntity((await db(env)).enquiries, "enquiry", id));
}

async function updateEnquiry(id, patch, env) {
  const merge = { partitionKey: "enquiry", rowKey: id, updatedAt: new Date().toISOString() };
  if (patch.status) merge.status = patch.status;
  if (patch.handledBy != null) merge.handledBy = patch.handledBy;
  if (patch.notes) merge.notes = JSON.stringify(patch.notes);
  await (await db(env)).enquiries.updateEntity(merge, "Merge");
  return getEnquiry(id, env);
}

async function deleteEnquiry(id, env) {
  try {
    await (await db(env)).enquiries.deleteEntity("enquiry", id);
  } catch (err) {
    if (!err || err.statusCode !== 404) throw err;
  }
}

/* ------------------------------------------------------- social studio settings */

/** Admin-editable system-prompt guidelines for the social copy assistant. */
async function getSocialPromptConfig(env) {
  const e = await getEntity((await db(env)).content, "settings", "socialPrompt");
  if (!e || !e.prompt) return null;
  return { prompt: e.prompt, updatedBy: e.updatedBy || "", updatedAt: e.updatedAt || "" };
}

async function setSocialPromptConfig(prompt, updatedBy, env) {
  const updatedAt = new Date().toISOString();
  await (
    await db(env)
  ).content.upsertEntity(
    {
      partitionKey: "settings",
      rowKey: "socialPrompt",
      prompt,
      updatedBy: updatedBy || "",
      updatedAt,
    },
    "Replace"
  );
  return { prompt, updatedBy, updatedAt };
}

module.exports = {
  TABLES,
  _reset,
  getSocialPromptConfig,
  setSocialPromptConfig,
  recordEnquiry,
  listEnquiries,
  getEnquiry,
  updateEnquiry,
  deleteEnquiry,
  getDuty,
  setDuty,
  listDutyHistory,
  listDutyContacts,
  getContent,
  setContent,
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
  purgeExpiredRateLimits,
  audit,
};
