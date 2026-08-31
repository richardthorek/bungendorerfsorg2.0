/**
 * Tests for public/js/alert-banner.js — the admin-published homepage banner
 * (WEBSITE_ROADMAP.md §4, "Bet 3").
 *
 * This is additive content, not part of the honest-failure-state system in
 * emergency-data.js: a fetch error here must fail silently (no degraded
 * state, no visible element) rather than surface as a safety issue.
 */

const sanitizeCalls = [];
global.DOMPurify = {
  sanitize: (html) => {
    sanitizeCalls.push(html);
    return html;
  },
};

function loadSourceFiles() {
  const fs = require("fs");
  const path = require("path");
  ["error-handler.js", "alert-banner.js"].forEach((file) => {
    const code = fs.readFileSync(path.join(__dirname, "../public/js", file), "utf8");
    eval(code);
  });
}

function renderBannerDOM() {
  document.body.innerHTML = `
    <p id="alertBanner" class="alert-banner" hidden>
      <span id="alertBannerText" class="alert-banner__text"></span>
    </p>
  `;
}

describe("alert-banner.js", () => {
  beforeEach(() => {
    jest.resetModules();
    sanitizeCalls.length = 0;
    renderBannerDOM();
    loadSourceFiles();
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("hides the banner (no empty element) when there is no active banner", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });

    await window.loadAlertBanner();

    const wrap = document.getElementById("alertBanner");
    expect(wrap.hidden).toBe(true);
    expect(document.getElementById("alertBannerText").innerHTML).toBe("");
  });

  test("renders a live banner's message and defaults to info severity", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ message: "Crews backburning off Bungendore Rd.", severity: "info" }],
    });

    await window.loadAlertBanner();

    const wrap = document.getElementById("alertBanner");
    expect(wrap.hidden).toBe(false);
    expect(wrap.getAttribute("data-severity")).toBe("info");
    expect(document.getElementById("alertBannerText").innerHTML).toBe(
      "Crews backburning off Bungendore Rd."
    );
  });

  test("renders warning severity and sanitises the message through DOMPurify", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { message: "<img src=x onerror=alert(1)>Road closed", severity: "warning" },
      ],
    });

    await window.loadAlertBanner();

    const wrap = document.getElementById("alertBanner");
    expect(wrap.hidden).toBe(false);
    expect(wrap.getAttribute("data-severity")).toBe("warning");
    expect(sanitizeCalls).toContain("<img src=x onerror=alert(1)>Road closed");
  });

  test("an unexpected severity value falls back to info rather than breaking rendering", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ message: "Hello", severity: "danger" }],
    });

    await window.loadAlertBanner();

    expect(document.getElementById("alertBanner").getAttribute("data-severity")).toBe("info");
  });

  test("fails silently (banner stays hidden, no throw) when the fetch errors", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(window.loadAlertBanner()).resolves.toBeUndefined();

    expect(document.getElementById("alertBanner").hidden).toBe(true);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
