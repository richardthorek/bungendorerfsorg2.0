/**
 * Members' area — identity gate, sign-in codes, sessions, and the
 * auth / members handlers. The storage layer and the code email are
 * replaced with in-memory fakes.
 */

process.env.AUTH_JWT_SECRET = "test-secret-that-is-at-least-32-chars-long!!";
process.env.AUTH_ALLOWED_EMAIL_DOMAIN = "rfs.nsw.gov.au";
process.env.AUTH_SESSION_MINUTES = "60";

/* ------------------------------------------------------------ in-memory store */

const mockDb = {
  members: new Map(),
  codes: new Map(),
  rate: new Map(),
  audit: [],
  duty: { current: null, history: [] },
  content: {},
  enquiries: [],
};

function resetDb() {
  mockDb.members.clear();
  mockDb.codes.clear();
  mockDb.rate.clear();
  mockDb.audit.length = 0;
  mockDb.duty.current = null;
  mockDb.duty.history.length = 0;
  mockDb.content = {};
  mockDb.enquiries.length = 0;
}

jest.mock("../api/shared/store", () => ({
  async getMember(email) {
    return mockDb.members.get(email) || null;
  },
  async listMembers() {
    return [...mockDb.members.values()].sort((a, b) => a.email.localeCompare(b.email));
  },
  async upsertMember({ email, displayName, phone, role, disabled, addedBy }) {
    const existing = mockDb.members.get(email);
    const m = {
      email,
      displayName: displayName != null ? displayName : existing ? existing.displayName : "",
      phone: phone != null ? phone : existing ? existing.phone : "",
      role: role === "admin" ? "admin" : "member",
      disabled: disabled != null ? !!disabled : existing ? existing.disabled : false,
      tokenVersion: existing ? existing.tokenVersion : 0,
      addedBy: existing ? existing.addedBy : addedBy || "",
      addedAt: existing ? existing.addedAt : new Date().toISOString(),
      lastLoginAt: existing ? existing.lastLoginAt : "",
    };
    mockDb.members.set(email, m);
    return m;
  },
  async deleteMember(email) {
    mockDb.members.delete(email);
  },
  async bumpTokenVersion(email) {
    const m = mockDb.members.get(email);
    if (m) m.tokenVersion += 1;
  },
  async touchMemberLogin(email) {
    const m = mockDb.members.get(email);
    if (m) m.lastLoginAt = new Date().toISOString();
  },
  async getAuthCode(email) {
    return mockDb.codes.get(email) || null;
  },
  async putAuthCode(email, fields) {
    mockDb.codes.set(email, { email, attempts: 0, ...fields });
  },
  async updateAuthCode(email, fields) {
    const existing = mockDb.codes.get(email);
    if (existing) mockDb.codes.set(email, { ...existing, ...fields });
  },
  async deleteAuthCode(email) {
    mockDb.codes.delete(email);
  },
  async hitRateLimit(key, { max }) {
    const n = (mockDb.rate.get(key) || 0) + 1;
    mockDb.rate.set(key, n);
    return n > max
      ? { allowed: false, remaining: 0, retryAfterSeconds: 60 }
      : { allowed: true, remaining: max - n, retryAfterSeconds: 0 };
  },
  async audit(event, meta) {
    mockDb.audit.push({ event, ...meta });
  },
  async getDuty() {
    return mockDb.duty.current || null;
  },
  async setDuty(entry) {
    const setAt = new Date().toISOString();
    mockDb.duty.current = { ...entry, setAt };
    mockDb.duty.history.unshift({ ...entry, setAt });
    return mockDb.duty.current;
  },
  async listDutyHistory(limit) {
    return mockDb.duty.history.slice(0, limit || 20);
  },
  async listDutyContacts(limit) {
    const seen = new Set();
    const out = [];
    for (const h of mockDb.duty.history) {
      if (!h.number || seen.has(h.number)) continue;
      seen.add(h.number);
      out.push({ number: h.number, label: h.label || "", lastUsedAt: h.setAt });
      if (out.length >= (limit || 10)) break;
    }
    return out;
  },
  async getContent(key) {
    return mockDb.content[key] || null;
  },
  async setContent(key, items, updatedBy) {
    const rec = { items, updatedBy, updatedAt: new Date().toISOString() };
    mockDb.content[key] = rec;
    return rec;
  },
  async recordEnquiry(data) {
    const id = "e" + (mockDb.enquiries.length + 1);
    mockDb.enquiries.unshift({
      id,
      name: data.name || "",
      email: data.email || "",
      phone: data.phone || "",
      message: data.message || "",
      source: data.source || "website",
      legacyRef: data.legacyRef || "",
      receivedAt: data.receivedAt || new Date().toISOString(),
      status: "new",
      handledBy: "",
      notes: [],
    });
    return id;
  },
  async listEnquiries() {
    return mockDb.enquiries.slice();
  },
  async getEnquiry(id) {
    return mockDb.enquiries.find((e) => e.id === id) || null;
  },
  async updateEnquiry(id, patch) {
    const e = mockDb.enquiries.find((x) => x.id === id);
    if (!e) return null;
    if (patch.status) e.status = patch.status;
    if (patch.handledBy != null) e.handledBy = patch.handledBy;
    if (patch.notes) e.notes = patch.notes;
    return e;
  },
  async deleteEnquiry(id) {
    mockDb.enquiries = mockDb.enquiries.filter((e) => e.id !== id);
  },
}));

const mockSentCodes = [];
jest.mock("../api/shared/otpEmail", () => ({
  async sendSignInCode(email, code) {
    mockSentCodes.push({ email, code });
    return { id: "fake" };
  },
}));

const mockAlerts = [];
jest.mock("../api/shared/dutyAlert", () => ({
  async sendDutyChangeAlert(change) {
    mockAlerts.push(change);
    return { sent: true };
  },
}));

const identity = require("../api/shared/identity");
const auth = require("../api/shared/auth");
const handlers = require("../api/shared/handlers");

beforeEach(() => {
  resetDb();
  mockSentCodes.length = 0;
  mockAlerts.length = 0;
});

/* ---------------------------------------------------------------- identity */

describe("identity gate", () => {
  test("normalizeEmail lowercases, trims, rejects junk", () => {
    expect(identity.normalizeEmail("  Foo@RFS.NSW.GOV.AU ")).toBe("foo@rfs.nsw.gov.au");
    expect(identity.normalizeEmail("not-an-email")).toBe("");
    expect(identity.normalizeEmail("a b@x.com")).toBe("");
    expect(identity.normalizeEmail("two@@x.com")).toBe("");
    expect(identity.normalizeEmail("@nope.com")).toBe("");
    expect(identity.normalizeEmail("nope@domain.")).toBe("");
    expect(identity.normalizeEmail(42)).toBe("");
  });

  test("normalizeEmail is not vulnerable to ReDoS", () => {
    const hostile = "x@" + "!.".repeat(50000) + " ";
    const start = Date.now();
    expect(identity.normalizeEmail(hostile)).toBe("");
    expect(Date.now() - start).toBeLessThan(50);
  });

  test("isAllowedDomain only passes the configured domain", () => {
    expect(identity.isAllowedDomain("x@rfs.nsw.gov.au")).toBe(true);
    expect(identity.isAllowedDomain("x@gmail.com")).toBe(false);
    expect(identity.isAllowedDomain("x@notrfs.nsw.gov.au")).toBe(false);
    expect(identity.isAllowedDomain("x@rfs.nsw.gov.au.evil.com")).toBe(false);
  });

  test("sessionMinutes reads env, defaults to 60", () => {
    expect(identity.sessionMinutes({ AUTH_SESSION_MINUTES: "30" })).toBe(30);
    expect(identity.sessionMinutes({})).toBe(60);
  });
});

/* ------------------------------------------------------------------- auth */

describe("codes and sessions", () => {
  test("generateCode is always 6 digits", () => {
    for (let i = 0; i < 50; i++) expect(auth.generateCode()).toMatch(/^\d{6}$/);
  });

  test("hashCode is bound to the email", () => {
    const a = auth.hashCode("123456", "a@rfs.nsw.gov.au");
    const b = auth.hashCode("123456", "b@rfs.nsw.gov.au");
    expect(a).not.toBe(b);
    expect(auth.codeMatches("123456", "a@rfs.nsw.gov.au", a)).toBe(true);
    expect(auth.codeMatches("123456", "b@rfs.nsw.gov.au", a)).toBe(false);
    expect(auth.codeMatches("000000", "a@rfs.nsw.gov.au", a)).toBe(false);
  });

  test("session JWT round-trips and carries role + tokenVersion", () => {
    const token = auth.issueSession({
      email: "x@rfs.nsw.gov.au",
      role: "admin",
      displayName: "X",
      tokenVersion: 2,
    });
    const claims = auth.verifyToken(token);
    expect(claims.sub).toBe("x@rfs.nsw.gov.au");
    expect(claims.role).toBe("admin");
    expect(claims.tv).toBe(2);
    expect(auth.verifyToken("garbage")).toBeNull();
  });

  test("cookie helpers", () => {
    expect(auth.parseCookies("a=1; brfs_session=xyz")).toMatchObject({ brfs_session: "xyz" });
    expect(auth.sessionCookie("t")).toContain("HttpOnly");
    expect(auth.sessionCookie("t")).toContain("Secure");
    expect(auth.sessionCookie("t")).toContain("SameSite=Lax");
    expect(auth.clearCookie()).toContain("Max-Age=0");
  });
});

/* -------------------------------------------------------------- handlers */

function req(body, headers) {
  return { body: body || {}, headers: headers || {}, method: "POST" };
}

async function signIn(email, role) {
  const store = require("../api/shared/store");
  await store.upsertMember({ email, displayName: "T", role: role || "member" });
  await handlers.handleAuthRequest(req({ email }));
  const code = mockSentCodes[mockSentCodes.length - 1].code;
  const res = await handlers.handleAuthVerify(req({ email, code }));
  const cookie = res.setCookie.split(";")[0];
  return { cookieHeader: cookie, res };
}

describe("handleAuthRequest", () => {
  test("non-member email: generic ok, no code sent", async () => {
    const res = await handlers.handleAuthRequest(req({ email: "stranger@rfs.nsw.gov.au" }));
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(mockSentCodes).toHaveLength(0);
  });

  test("wrong domain: generic ok, no code sent", async () => {
    const store = require("../api/shared/store");
    await store.upsertMember({ email: "person@gmail.com", role: "member" });
    const res = await handlers.handleAuthRequest(req({ email: "person@gmail.com" }));
    expect(res.status).toBe(200);
    expect(mockSentCodes).toHaveLength(0);
  });

  test("member: stores a code and emails it", async () => {
    const store = require("../api/shared/store");
    await store.upsertMember({ email: "m@rfs.nsw.gov.au", role: "member" });
    const res = await handlers.handleAuthRequest(req({ email: "m@rfs.nsw.gov.au" }));
    expect(res.status).toBe(200);
    expect(mockSentCodes).toEqual([
      { email: "m@rfs.nsw.gov.au", code: expect.stringMatching(/^\d{6}$/) },
    ]);
  });

  test("rate limit returns 429", async () => {
    const store = require("../api/shared/store");
    await store.upsertMember({ email: "m@rfs.nsw.gov.au", role: "member" });
    let last;
    for (let i = 0; i < 5; i++)
      last = await handlers.handleAuthRequest(req({ email: "m@rfs.nsw.gov.au" }));
    expect(last.status).toBe(429);
  });
});

describe("handleAuthVerify", () => {
  test("wrong code increments attempts and 400s", async () => {
    const store = require("../api/shared/store");
    await store.upsertMember({ email: "m@rfs.nsw.gov.au", role: "member" });
    await handlers.handleAuthRequest(req({ email: "m@rfs.nsw.gov.au" }));
    const res = await handlers.handleAuthVerify(req({ email: "m@rfs.nsw.gov.au", code: "000000" }));
    expect(res.status).toBe(400);
    expect(mockDb.codes.get("m@rfs.nsw.gov.au").attempts).toBe(1);
  });

  test("correct code issues a session cookie and clears the code", async () => {
    const store = require("../api/shared/store");
    await store.upsertMember({ email: "m@rfs.nsw.gov.au", role: "member" });
    await handlers.handleAuthRequest(req({ email: "m@rfs.nsw.gov.au" }));
    const code = mockSentCodes[0].code;
    const res = await handlers.handleAuthVerify(req({ email: "m@rfs.nsw.gov.au", code }));
    expect(res.status).toBe(200);
    expect(res.setCookie).toContain("brfs_session=");
    expect(res.body.member.email).toBe("m@rfs.nsw.gov.au");
    expect(mockDb.codes.has("m@rfs.nsw.gov.au")).toBe(false);
  });

  test("code locks after 5 attempts", async () => {
    const store = require("../api/shared/store");
    await store.upsertMember({ email: "m@rfs.nsw.gov.au", role: "member" });
    await handlers.handleAuthRequest(req({ email: "m@rfs.nsw.gov.au" }));
    for (let i = 0; i < 5; i++) {
      await handlers.handleAuthVerify(req({ email: "m@rfs.nsw.gov.au", code: "111111" }));
    }
    const res = await handlers.handleAuthVerify(
      req({ email: "m@rfs.nsw.gov.au", code: mockSentCodes[0].code })
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/new code/i);
  });
});

describe("handleAuthMe", () => {
  test("no cookie -> 401", async () => {
    const res = await handlers.handleAuthMe({ headers: {} });
    expect(res.status).toBe(401);
  });

  test("valid cookie -> member", async () => {
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    const res = await handlers.handleAuthMe({ headers: { cookie: cookieHeader } });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("m@rfs.nsw.gov.au");
    expect(res.body.expiresAt).toBeTruthy();
  });

  test("disabling a member revokes the live session", async () => {
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    mockDb.members.get("m@rfs.nsw.gov.au").disabled = true;
    const res = await handlers.handleAuthMe({ headers: { cookie: cookieHeader } });
    expect(res.status).toBe(401);
  });

  test("signing out invalidates the token server-side", async () => {
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    await handlers.handleAuthLogout({ headers: { cookie: cookieHeader } });
    const res = await handlers.handleAuthMe({ headers: { cookie: cookieHeader } });
    expect(res.status).toBe(401);
  });
});

describe("members management", () => {
  const CSRF = { "x-brfs-auth": "1" };

  test("non-admin is refused", async () => {
    const { cookieHeader } = await signIn("plain@rfs.nsw.gov.au", "member");
    const res = await handlers.handleMembersList({ headers: { cookie: cookieHeader } });
    expect(res.status).toBe(403);
  });

  test("admin can list, add, and remove", async () => {
    const { cookieHeader } = await signIn("boss@rfs.nsw.gov.au", "admin");
    const headers = { cookie: cookieHeader, ...CSRF };

    const add = await handlers.handleMembersUpsert({
      headers,
      body: { email: "New.Person@rfs.nsw.gov.au", displayName: "New Person", role: "member" },
    });
    expect(add.status).toBe(201);
    expect(add.body.member.email).toBe("new.person@rfs.nsw.gov.au");

    const list = await handlers.handleMembersList({ headers: { cookie: cookieHeader } });
    expect(list.body.members.map((m) => m.email)).toContain("new.person@rfs.nsw.gov.au");

    const del = await handlers.handleMembersDelete({ headers }, "new.person@rfs.nsw.gov.au");
    expect(del.status).toBe(200);
    expect(mockDb.members.has("new.person@rfs.nsw.gov.au")).toBe(false);
  });

  test("add rejects non-domain address", async () => {
    const { cookieHeader } = await signIn("boss@rfs.nsw.gov.au", "admin");
    const res = await handlers.handleMembersUpsert({
      headers: { cookie: cookieHeader, ...CSRF },
      body: { email: "outsider@gmail.com" },
    });
    expect(res.status).toBe(400);
  });

  test("mutations without the CSRF header are refused", async () => {
    const { cookieHeader } = await signIn("boss@rfs.nsw.gov.au", "admin");
    const res = await handlers.handleMembersUpsert({
      headers: { cookie: cookieHeader },
      body: { email: "x@rfs.nsw.gov.au" },
    });
    expect(res.status).toBe(403);
  });

  test("cannot remove the last admin", async () => {
    const { cookieHeader } = await signIn("only@rfs.nsw.gov.au", "admin");
    const res = await handlers.handleMembersDelete(
      { headers: { cookie: cookieHeader, ...CSRF } },
      "only@rfs.nsw.gov.au"
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last admin/i);
  });
});

/* ------------------------------------------------------------------- phone */

describe("normalizeAuPhone", () => {
  const { normalizeAuPhone, maskPhone } = require("../api/shared/phone");

  test("accepts local, spaced, and +61 forms", () => {
    expect(normalizeAuPhone("0488880286")).toBe("+61488880286");
    expect(normalizeAuPhone("0488 880 286")).toBe("+61488880286");
    expect(normalizeAuPhone("+61 488 880 286")).toBe("+61488880286");
    expect(normalizeAuPhone("(02) 6238 1234")).toBe("+61262381234");
  });

  test("rejects junk", () => {
    expect(normalizeAuPhone("12345")).toBe("");
    expect(normalizeAuPhone("+1 555 0100")).toBe("");
    expect(normalizeAuPhone("")).toBe("");
  });

  test("maskPhone shows only the last four", () => {
    expect(maskPhone("+61488880286")).toMatch(/0286$/);
    expect(maskPhone("+61488880286")).not.toContain("4888");
  });
});

/* -------------------------------------------------------------- duty line */

describe("duty line", () => {
  const CSRF = { "x-brfs-auth": "1" };

  test("lookup 503s when nothing is set, 200s with { Main } once set", async () => {
    let r = await handlers.handleDutyLookup({ headers: {} });
    expect(r.status).toBe(503);

    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    await handlers.handleDutySet({
      headers: { cookie: cookieHeader, ...CSRF },
      body: { number: "0488880286" },
    });

    r = await handlers.handleDutyLookup({ headers: {} });
    expect(r).toEqual({ status: 200, body: { Main: "+61488880286" } });
  });

  test("lookup accepts the key as a header or a ?key= query param", async () => {
    process.env.DUTY_LOOKUP_KEY = "s3cr3t";
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    await handlers.handleDutySet({
      headers: { cookie: cookieHeader, "x-brfs-auth": "1" },
      body: { number: "0488880286" },
    });
    try {
      expect((await handlers.handleDutyLookup({ headers: {} })).status).toBe(401);
      expect((await handlers.handleDutyLookup({ headers: { "x-duty-key": "nope" } })).status).toBe(
        401
      );
      expect(
        (await handlers.handleDutyLookup({ headers: {}, query: { key: "wrong" } })).status
      ).toBe(401);

      expect(
        (await handlers.handleDutyLookup({ headers: { "x-duty-key": "s3cr3t" } })).body
      ).toEqual({ Main: "+61488880286" });
      expect(
        (await handlers.handleDutyLookup({ headers: {}, query: { key: "s3cr3t" } })).body
      ).toEqual({ Main: "+61488880286" });
    } finally {
      delete process.env.DUTY_LOOKUP_KEY;
    }
  });

  test("set requires a session and the CSRF header, and validates the number", async () => {
    const anon = await handlers.handleDutySet({ headers: {}, body: { number: "0488880286" } });
    expect(anon.status).toBe(401);

    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    const noCsrf = await handlers.handleDutySet({
      headers: { cookie: cookieHeader },
      body: { number: "0488880286" },
    });
    expect(noCsrf.status).toBe(403);

    const bad = await handlers.handleDutySet({
      headers: { cookie: cookieHeader, ...CSRF },
      body: { number: "nope" },
    });
    expect(bad.status).toBe(400);
  });

  test("status returns the current number + label and a recent-contacts list", async () => {
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    const hdr = { cookie: cookieHeader, ...CSRF };
    await handlers.handleDutySet({ headers: hdr, body: { number: "0488880286", label: "Sandi" } });
    await handlers.handleDutySet({ headers: hdr, body: { number: "0412345678", label: "Tony" } });

    const r = await handlers.handleDutyStatus({ headers: { cookie: cookieHeader } });
    expect(r.status).toBe(200);
    expect(r.body.number).toBe("+61412345678");
    expect(r.body.label).toBe("Tony");
    expect(r.body.masked).toMatch(/5678$/);
    // the current number is excluded from the quick-pick list
    expect(r.body.contacts).toEqual([
      expect.objectContaining({ number: "+61488880286", label: "Sandi" }),
    ]);
  });

  test("one-click set from a saved contact carries its label", async () => {
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    const hdr = { cookie: cookieHeader, ...CSRF };
    const r = await handlers.handleDutySet({
      headers: hdr,
      body: { number: "0499111222", label: "Station landline" },
    });
    expect(r.body.label).toBe("Station landline");
    const store = require("../api/shared/store");
    expect((await store.getDuty()).label).toBe("Station landline");
  });

  test("setting the number over the web fires a change alert", async () => {
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    await handlers.handleDutySet({
      headers: { cookie: cookieHeader, "x-brfs-auth": "1" },
      body: { number: "0488880286" },
    });
    expect(mockAlerts).toHaveLength(1);
    expect(mockAlerts[0].number).toBe("+61488880286");
    expect(mockAlerts[0].method).toBe("web");
  });
});

/* -------------------------------------------------------- brigade phone by SMS */

describe("handleDutyClaim", () => {
  const env = { DUTY_CLAIM_PIN: "4821", DUTY_FALLBACK_NUMBER: "+61419983748" };

  test("non-command text is passed through (handled:false)", async () => {
    const r = await handlers.handleDutyClaim(
      { headers: {}, body: { From: "+61488880286", Body: "hi is anyone there" } },
      env
    );
    expect(r.body).toEqual({ handled: false });
  });

  test("wrong PIN makes no change", async () => {
    const r = await handlers.handleDutyClaim(
      { headers: {}, body: { From: "+61488880286", Body: "BRIGADE 0000" } },
      env
    );
    expect(r.body.handled).toBe(true);
    expect(r.body.reply).toMatch(/PIN/i);
    expect(await require("../api/shared/store").getDuty(env)).toBeNull();
  });

  test("BRIGADE <pin> forwards to the sender and alerts", async () => {
    const r = await handlers.handleDutyClaim(
      { headers: {}, body: { From: "0488 880 286", Body: "BRIGADE 4821" } },
      env
    );
    expect(r.body.handled).toBe(true);
    expect(r.body.reply).toMatch(/you're on/i);
    const duty = await require("../api/shared/store").getDuty(env);
    expect(duty.number).toBe("+61488880286");
    expect(duty.method).toBe("sms");
    expect(mockAlerts).toHaveLength(1);
  });

  test("attributes the change to a member whose phone is on file", async () => {
    await require("../api/shared/store").upsertMember({
      email: "sms@rfs.nsw.gov.au",
      displayName: "Sam SMS",
      phone: "+61488880286",
      role: "member",
    });
    await handlers.handleDutyClaim(
      { headers: {}, body: { From: "+61488880286", Body: "duty 4821" } },
      env
    );
    const duty = await require("../api/shared/store").getDuty(env);
    expect(duty.setBy).toBe("sms@rfs.nsw.gov.au");
    expect(duty.setByName).toBe("Sam SMS");
  });

  test("OFF <pin> reverts to the fallback number", async () => {
    await handlers.handleDutyClaim(
      { headers: {}, body: { From: "+61488880286", Body: "BRIGADE 4821" } },
      env
    );
    const r = await handlers.handleDutyClaim(
      { headers: {}, body: { From: "+61488880286", Body: "OFF 4821" } },
      env
    );
    expect(r.body.reply).toMatch(/backup number/i);
    expect((await require("../api/shared/store").getDuty(env)).number).toBe("+61419983748");
  });

  test("honours X-Duty-Key when configured", async () => {
    const keyed = { ...env, DUTY_LOOKUP_KEY: "s3cr3t" };
    const bad = await handlers.handleDutyClaim(
      { headers: {}, body: { From: "+61488880286", Body: "BRIGADE 4821" } },
      keyed
    );
    expect(bad.status).toBe(401);
    const ok = await handlers.handleDutyClaim(
      { headers: { "x-duty-key": "s3cr3t" }, body: { From: "+61488880286", Body: "BRIGADE 4821" } },
      keyed
    );
    expect(ok.body.handled).toBe(true);
  });
});

/* -------------------------------------------------------- editable content */

describe("content schema", () => {
  const { validateContent } = require("../api/shared/contentSchema");

  test("events require a name and cap fields", () => {
    expect(validateContent("events", [{ timing: "x" }]).ok).toBe(false);
    const r = validateContent("events", [
      { name: "  Show  ", timing: "TBC", description: "d", extra: "dropped" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.items[0]).toEqual({ name: "Show", timing: "TBC", description: "d" });
  });

  test("training rejects a bad recurrence", () => {
    expect(validateContent("training", [{ title: "T", recurrence: "someday" }]).ok).toBe(false);
    expect(validateContent("training", [{ title: "T", recurrence: "second-saturday" }]).ok).toBe(
      true
    );
    expect(
      validateContent("training", [{ title: "T", recurrence: "EVERY-FRIDAY" }]).items[0].recurrence
    ).toBe("every-friday");
  });

  test("unknown key is refused", () => {
    expect(validateContent("random", []).ok).toBe(false);
  });
});

describe("content handlers", () => {
  const CSRF = { "x-brfs-auth": "1" };

  test("GET is public and returns a plain array", async () => {
    const empty = await handlers.handleContentGet("events");
    expect(empty).toMatchObject({ status: 200, body: [] });

    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    await handlers.handleContentSet("events", {
      headers: { cookie: cookieHeader, ...CSRF },
      body: { items: [{ name: "Show", timing: "TBC" }] },
    });

    const got = await handlers.handleContentGet("events");
    expect(got.body).toEqual([{ name: "Show", timing: "TBC", description: "" }]);
  });

  test("PUT needs a session, the CSRF header, and valid data", async () => {
    const anon = await handlers.handleContentSet("events", { headers: {}, body: { items: [] } });
    expect(anon.status).toBe(401);

    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    const noCsrf = await handlers.handleContentSet("events", {
      headers: { cookie: cookieHeader },
      body: { items: [] },
    });
    expect(noCsrf.status).toBe(403);

    const bad = await handlers.handleContentSet("training", {
      headers: { cookie: cookieHeader, ...CSRF },
      body: { items: [{ title: "T", recurrence: "nope" }] },
    });
    expect(bad.status).toBe(400);

    const ok = await handlers.handleContentSet("training", {
      headers: { cookie: cookieHeader, ...CSRF },
      body: {
        items: [{ title: "Drill", recurrence: "every-friday", time: "7pm", location: "Stn" }],
      },
    });
    expect(ok.status).toBe(200);
    expect(mockDb.audit.some((a) => a.event === "content_updated")).toBe(true);
  });
});

/* -------------------------------------------------------------- enquiries */

describe("enquiry handlers", () => {
  const CSRF = { "x-brfs-auth": "1" };
  const store = () => require("../api/shared/store");

  async function seedOne() {
    return store().recordEnquiry({
      name: "Tony",
      email: "t@x.org",
      message: "burn pile at 39 Lake Rd",
    });
  }

  test("list requires a session", async () => {
    expect((await handlers.handleEnquiriesList({ headers: {} })).status).toBe(401);
    const { cookieHeader } = await signIn("m@rfs.nsw.gov.au");
    await seedOne();
    const r = await handlers.handleEnquiriesList({ headers: { cookie: cookieHeader } });
    expect(r.status).toBe(200);
    expect(r.body.enquiries).toHaveLength(1);
  });

  test("update sets status, records who picked it up, and appends notes", async () => {
    const id = await seedOne();
    const { cookieHeader } = await signIn("jo@rfs.nsw.gov.au");
    const hdr = { cookie: cookieHeader, ...CSRF };

    const bad = await handlers.handleEnquiryUpdate(id, {
      headers: hdr,
      body: { status: "banana" },
    });
    expect(bad.status).toBe(400);

    const noCsrf = await handlers.handleEnquiryUpdate(id, {
      headers: { cookie: cookieHeader },
      body: { status: "in-progress" },
    });
    expect(noCsrf.status).toBe(403);

    const upd = await handlers.handleEnquiryUpdate(id, {
      headers: hdr,
      body: { status: "in-progress", note: "Called Tony, booking a date" },
    });
    expect(upd.status).toBe(200);
    expect(upd.body.enquiry.status).toBe("in-progress");
    expect(upd.body.enquiry.handledBy).toBe("jo@rfs.nsw.gov.au");
    expect(upd.body.enquiry.notes[0].text).toMatch(/booking a date/);

    const missing = await handlers.handleEnquiryUpdate("nope", {
      headers: hdr,
      body: { status: "resolved" },
    });
    expect(missing.status).toBe(404);
  });

  test("delete is admin only", async () => {
    const id = await seedOne();
    const asMember = await signIn("plain@rfs.nsw.gov.au", "member");
    expect(
      (
        await handlers.handleEnquiryDelete(id, {
          headers: { cookie: asMember.cookieHeader, ...CSRF },
        })
      ).status
    ).toBe(403);

    const asAdmin = await signIn("boss@rfs.nsw.gov.au", "admin");
    const del = await handlers.handleEnquiryDelete(id, {
      headers: { cookie: asAdmin.cookieHeader, ...CSRF },
    });
    expect(del.status).toBe(200);
    expect(await store().getEnquiry(id)).toBeNull();
  });
});

describe("contact submission stores AND emails", () => {
  const { handleContactSubmission } = require("../api/contact/submit");

  test("records the enquiry and sends the alert", async () => {
    const store = require("../api/shared/store");
    const res = await handleContactSubmission(
      { name: "Jane", email: "jane@x.org", phone: "", message: "hello there team" },
      { logger: { log() {}, warn() {}, error() {} } }
    );
    expect(res.stored).toBe(true);
    const list = await store.listEnquiries();
    expect(list[0].name).toBe("Jane");
    expect(list[0].source).toBe("website");
  });
});
