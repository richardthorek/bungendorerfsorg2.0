/**
 * Tests for public/js/modal-utils.js — native <dialog> open/close helper,
 * focus trap, and focus restore (WEBSITE_ROADMAP.md Workstream 6,
 * accessibility).
 *
 * jsdom does not implement HTMLDialogElement.prototype.showModal()/close()
 * (still true as of the jsdom version pinned here), so real browsers'
 * behaviour is polyfilled minimally on each test's dialog element: toggling
 * the `open` property/attribute and firing the "close" event, which is all
 * openDialog()/closeDialog() actually depend on.
 */

global.DOMPurify = {
  sanitize: (html) => html,
};
global.luxon = {
  DateTime: {
    fromISO: () => ({
      setZone: () => ({
        toLocaleString: () => "1 Jan 2026",
      }),
    }),
    DATE_MED: "DATE_MED",
    DATETIME_MED: "DATETIME_MED",
  },
};

function loadModalUtils() {
  const fs = require("fs");
  const path = require("path");
  const code = fs.readFileSync(path.join(__dirname, "../public/js/modal-utils.js"), "utf8");
  eval(code);
}

/** Minimal showModal()/close() polyfill so openDialog/closeDialog can run. */
function polyfillDialog(dialog) {
  dialog.showModal = function () {
    this.open = true;
  };
  dialog.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

function renderDialogDOM() {
  document.body.innerHTML = `
    <button id="triggerBtn">Open</button>
    <dialog id="contactModal" role="dialog" aria-modal="true" aria-labelledby="contactModalTitle">
      <article>
        <header>
          <button type="button" class="close" aria-label="Close"></button>
          <h2 id="contactModalTitle">Contact Us</h2>
        </header>
        <form id="contactForm">
          <input id="contactNameInput" name="name" />
          <input id="lastFocusable" name="message" />
        </form>
      </article>
    </dialog>
    <dialog id="eventModal" role="dialog" aria-modal="true" aria-labelledby="eventModalTitle">
      <article>
        <header>
          <button type="button" id="eventModalClose" aria-label="Close"></button>
          <h2 id="eventModalTitle">Event</h2>
        </header>
        <div id="modalEventContent"></div>
      </article>
    </dialog>
  `;
  polyfillDialog(document.getElementById("contactModal"));
  polyfillDialog(document.getElementById("eventModal"));
}

// jsdom never computes layout, so offsetParent is always null — trapFocus()'s
// visibility filter (needed in real browsers to skip the hidden honeypot
// field) would otherwise always see an empty focusable list here and silently
// no-op. Stub it to reflect parentNode, which is enough to distinguish
// "attached and not display:none" (the only case under test) from detached.
beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentNode;
    },
  });
});

describe("modal-utils.js dialog open/close + focus behaviour", () => {
  beforeEach(() => {
    renderDialogDOM();
    loadModalUtils();
    document.dispatchEvent(new Event("DOMContentLoaded"));
  });

  test("openDialog calls showModal() and focuses the first focusable element inside", () => {
    const dialog = document.getElementById("contactModal");
    const trigger = document.getElementById("triggerBtn");

    window.openDialog(dialog, trigger);

    expect(dialog.open).toBe(true);
    expect(document.activeElement.classList.contains("close")).toBe(true);
  });

  test("closeDialog restores focus to the element that triggered openDialog", () => {
    const dialog = document.getElementById("contactModal");
    const trigger = document.getElementById("triggerBtn");
    trigger.focus();

    window.openDialog(dialog, trigger);
    expect(dialog.open).toBe(true);

    window.closeDialog(dialog);

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  test("closeDialog defaults to restoring focus to document.activeElement at open time when no trigger is passed", () => {
    const dialog = document.getElementById("contactModal");
    const trigger = document.getElementById("triggerBtn");
    trigger.focus();

    window.openDialog(dialog); // no explicit trigger — should capture activeElement

    window.closeDialog(dialog);

    expect(document.activeElement).toBe(trigger);
  });

  test("Tab from the last focusable element wraps to the first (focus trap)", () => {
    const dialog = document.getElementById("contactModal");
    window.openDialog(dialog);

    const first = dialog.querySelector(".close");
    const last = document.getElementById("lastFocusable");
    last.focus();

    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    Object.defineProperty(tabEvent, "target", { value: last });
    dialog.dispatchEvent(tabEvent);

    expect(document.activeElement).toBe(first);
  });

  test("Shift+Tab from the first focusable element wraps to the last (focus trap)", () => {
    const dialog = document.getElementById("contactModal");
    window.openDialog(dialog);

    const first = dialog.querySelector(".close");
    const last = document.getElementById("lastFocusable");
    first.focus();

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(tabEvent);

    expect(document.activeElement).toBe(last);
  });

  test("eventModal's close button closes the dialog (previously had no listener at all)", () => {
    const dialog = document.getElementById("eventModal");
    window.openDialog(dialog);
    expect(dialog.open).toBe(true);

    document.getElementById("eventModalClose").click();

    expect(dialog.open).toBe(false);
  });

  test("showModal() (calendar event helper) renders event details and opens #eventModal", () => {
    window.showModal({
      subject: "Working Bee",
      start: { dateTime: "2026-01-10T09:00:00Z" },
      end: { dateTime: "2026-01-10T11:00:00Z" },
      isAllDay: false,
    });

    const dialog = document.getElementById("eventModal");
    expect(dialog.open).toBe(true);
    expect(document.getElementById("modalEventContent").textContent).toContain("Working Bee");
  });
});
