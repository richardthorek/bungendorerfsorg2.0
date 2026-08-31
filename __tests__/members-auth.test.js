/**
 * Members' area — identity gate, sign-in codes, sessions, and the
 * auth / members handlers. The storage layer and the code email are
 * replaced with in-memory fakes.
 */

process.env.AUTH_JWT_SECRET = "test-secret-that-is-at-least-32-chars-long!!";
process.env.AUTH_ALLOWED_EMAIL_DOMAIN = "rfs.nsw.gov.au";
process.env.AUTH_SESSION_MINUTES = "60";

/* ------------------------------------------------------------ in-memory store */

const mockDb = { members: new Map(), codes: new Map(), rate: new Map(), audit: [] };

function resetDb() {
  mockDb.members.clear();
  mockDb.codes.clear();
  mockDb.rate.clear();
  mockDb.audit.length = 0;
}

jest.mock("../api/shared/store", () => ({
  async getMember(email) {
    return mockDb.members.get(email) || null;
  },
  async listMembers() {
    return [...mockDb.members.values()].sort((a, b) => a.email.localeCompare(b.email));
  },
  async upsertMember({ email, displayName, role, disabled, addedBy }) {
    const existing = mockDb.members.get(email);
    const m = {
      email,
      displayName: displayName != null ? displayName : existing ? existing.displayName : "",
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
}));

const mockSentCodes = [];
jest.mock("../api/shared/otpEmail", () => ({
  async sendSignInCode(email, code) {
    mockSentCodes.push({ email, code });
    return { id: "fake" };
  },
}));

const identity = require("../api/shared/identity");
const auth = require("../api/shared/auth");
const handlers = require("../api/shared/handlers");

beforeEach(() => {
  resetDb();
  mockSentCodes.length = 0;
});

/* ---------------------------------------------------------------- identity */

describe("identity gate", () => {
  test("normalizeEmail lowercases, trims, rejects junk", () => {
    expect(identity.normalizeEmail("  Foo@RFS.NSW.GOV.AU ")).toBe("foo@rfs.nsw.gov.au");
    expect(identity.normalizeEmail("not-an-email")).toBe("");
    expect(identity.normalizeEmail("a b@x.com")).toBe("");
    expect(identity.normalizeEmail(42)).toBe("");
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
