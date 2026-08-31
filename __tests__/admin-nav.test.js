/**
 * Loads the real admin page + admin.js in jsdom and checks the nav gates
 * correctly by role. Regression guard for the `data-admin` bare-attribute bug
 * (dataset.admin === "" is falsy, so the Members tab never un-hid).
 */

const fs = require("fs");
const path = require("path");

function bodyHtml() {
  const full = fs.readFileSync(path.join(__dirname, "..", "public", "admin.html"), "utf8");
  return full.replace(/^[\s\S]*?<body>/i, "").replace(/<\/body>[\s\S]*$/i, "");
}

function loadAdmin(meResponse) {
  jest.resetModules();
  document.body.innerHTML = bodyHtml();
  location.hash = "";

  global.fetch = jest.fn((url) => {
    if (url === "/api/auth/me") {
      return Promise.resolve({
        ok: meResponse.ok !== false,
        status: meResponse.ok === false ? 401 : 200,
        json: () => Promise.resolve(meResponse.body || {}),
      });
    }
    // any other call (enquiries badge, duty status, …) — empty ok
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  require("../public/js/admin.js");
  return new Promise((r) => setTimeout(r, 0)); // let the me-fetch promise settle
}

const membersTab = () => document.querySelector('.nav__item[data-view="members"]');

afterEach(() => {
  delete global.fetch;
});

test("admin sees the Members tab", async () => {
  await loadAdmin({ body: { email: "boss@rfs.nsw.gov.au", name: "Boss", role: "admin" } });
  expect(membersTab().hidden).toBe(false);
});

test("a plain member does not see the Members tab", async () => {
  await loadAdmin({ body: { email: "m@rfs.nsw.gov.au", name: "M", role: "member" } });
  expect(membersTab().hidden).toBe(true);
});

test("signed-out shows the sign-in view, not the dashboard", async () => {
  await loadAdmin({ ok: false });
  expect(document.getElementById("signinView").hidden).toBe(false);
  expect(document.getElementById("appView").hidden).toBe(true);
});
