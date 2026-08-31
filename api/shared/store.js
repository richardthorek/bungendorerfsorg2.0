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
 */

const crypto = require("crypto");
const { TableClient } = require("@azure/data-tables");

const TABLES = {
  members: "members",
  codes: "authcodes",
  rate: "ratelimits",
  audit: "auditlog",
};

let clients = null;

function connectionString(env) {
  const cs = (env || process.env).BRFS_STORAGE_CONNECTION;
  if (!cs) throw new Error("BRFS_STORAGE_CONNECTION is not configured");
  return cs;
}

/** Lazily build (and memoize) a TableClient per table, creating the table once. */
function tables(env) {
  if (clients) return clients;
  const cs = connectionString(env);
  clients = {};
  for (const [key, name] of Object.entries(TABLES)) {
    const client = TableClient.fromConnectionString(cs, name, { allowInsecureConnection: true });
    clients[key] = client;
    client.createTable().catch((err) => {
      // 409 TableAlreadyExists is the normal path
      if (err && err.statusCode !== 409) {
        // eslint-disable-next-line no-console
        console.error(`createTable(${name}) failed: ${err.message}`);
      }
    });
  }
  return clients;
}

/** For tests / connection changes. */
function _reset() {
  clients = null;
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
    role: e.role === "admin" ? "admin" : "member",
    disabled: !!e.disabled,
    tokenVersion: typeof e.tokenVersion === "number" ? e.tokenVersion : 0,
    addedBy: e.addedBy || "",
    addedAt: e.addedAt || "",
    lastLoginAt: e.lastLoginAt || "",
  };
}

async function getMember(email, env) {
  const e = await getEntity(tables(env).members, "member", email);
  return memberFromEntity(e);
}

async function listMembers(env) {
  const out = [];
  const iter = tables(env).members.listEntities({
    queryOptions: { filter: "PartitionKey eq 'member'" },
  });
  for await (const e of iter) out.push(memberFromEntity(e));
  out.sort((a, b) => a.email.localeCompare(b.email));
  return out;
}

/** Create or update a member. Preserves tokenVersion/addedAt when the row exists. */
async function upsertMember({ email, displayName, role, disabled, addedBy }, env) {
  const existing = await getMember(email, env);
  const entity = {
    partitionKey: "member",
    rowKey: email,
    displayName: displayName != null ? displayName : existing ? existing.displayName : "",
    role: role === "admin" ? "admin" : "member",
    disabled: disabled != null ? !!disabled : existing ? existing.disabled : false,
    tokenVersion: existing ? existing.tokenVersion : 0,
    addedBy: existing ? existing.addedBy : addedBy || "",
    addedAt: existing ? existing.addedAt : new Date().toISOString(),
  };
  await tables(env).members.upsertEntity(entity, "Replace");
  return memberFromEntity(entity);
}

async function deleteMember(email, env) {
  try {
    await tables(env).members.deleteEntity("member", email);
  } catch (err) {
    if (!err || err.statusCode !== 404) throw err;
  }
}

/** Force existing sessions for this member to expire (used on disable / role change). */
async function bumpTokenVersion(email, env) {
  const m = await getMember(email, env);
  if (!m) return;
  await tables(env).members.updateEntity(
    { partitionKey: "member", rowKey: email, tokenVersion: m.tokenVersion + 1 },
    "Merge"
  );
}

async function touchMemberLogin(email, env) {
  try {
    await tables(env).members.updateEntity(
      { partitionKey: "member", rowKey: email, lastLoginAt: new Date().toISOString() },
      "Merge"
    );
  } catch (err) {
    if (!err || err.statusCode !== 404) throw err;
  }
}

/* --------------------------------------------------------------- sign-in codes */

async function getAuthCode(email, env) {
  const e = await getEntity(tables(env).codes, "code", email);
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
  await tables(env).codes.upsertEntity(
    { partitionKey: "code", rowKey: email, ...fields },
    "Replace"
  );
}

async function updateAuthCode(email, fields, env) {
  await tables(env).codes.updateEntity({ partitionKey: "code", rowKey: email, ...fields }, "Merge");
}

async function deleteAuthCode(email, env) {
  try {
    await tables(env).codes.deleteEntity("code", email);
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
  const client = tables(env).rate;
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

  if (count > max) {
    const retryAfterSeconds = Math.ceil((windowStart + windowSeconds * 1000 - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }
  return { allowed: true, remaining: max - count, retryAfterSeconds: 0 };
}

/* --------------------------------------------------------------------- audit */

async function audit(event, { email = "", ip = "", detail = "" } = {}, env) {
  const now = new Date();
  const rowKey = `${now.toISOString()}-${crypto.randomBytes(4).toString("hex")}`;
  try {
    await tables(env).audit.createEntity({
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

module.exports = {
  TABLES,
  _reset,
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
};
