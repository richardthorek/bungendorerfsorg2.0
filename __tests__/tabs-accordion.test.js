/**
 * Tests for public/js/tabs-accordion.js — mobile accordion headers
 * (WEBSITE_ROADMAP.md Workstream 6, accessibility).
 *
 * The accordion headers are real <button> elements now, and toggling one
 * must keep aria-expanded in sync with the "active" class so screen readers
 * announce open/closed state, not just visually show it.
 *
 * tabs-accordion.js wires everything up inside a single DOMContentLoaded
 * handler with no exported functions, so (unlike emergency-data.js) the
 * script can only be loaded and DOMContentLoaded dispatched once per test
 * file — re-running it would bind a second set of listeners on top of the
 * first. Tests below share one DOM/one script load and reset element state
 * (classes/aria-expanded) between assertions instead of rebuilding the DOM.
 */

function loadTabsAccordion() {
  const fs = require("fs");
  const path = require("path");
  const code = fs.readFileSync(path.join(__dirname, "../public/js/tabs-accordion.js"), "utf8");
  eval(code);
}

function renderAccordionDOM() {
  document.body.innerHTML = `
    <div class="tab-navigation" role="tablist" aria-label="Main content sections">
      <button class="tab-btn active" role="tab" aria-selected="true" aria-controls="fire-info-tab"
        id="tab-fire-info" data-tab="fire-info" tabindex="0">Fire Information</button>
      <button class="tab-btn" role="tab" aria-selected="false" aria-controls="prepare-tab"
        id="tab-prepare" data-tab="prepare" tabindex="-1">Prepare</button>
    </div>
    <div class="tab-content-container">
      <div class="tab-panel active" role="tabpanel" id="fire-info-tab" aria-labelledby="tab-fire-info">
        <button type="button" class="accordion-header mobile-only" data-accordion="fire-info"
          aria-expanded="false" aria-controls="fire-info-accordion-content">Fire Information</button>
        <div class="accordion-content" data-content="fire-info" id="fire-info-accordion-content">
          <article id="info"><h2>Fire Information</h2></article>
        </div>
      </div>
      <div class="tab-panel" role="tabpanel" id="prepare-tab" aria-labelledby="tab-prepare">
        <button type="button" class="accordion-header mobile-only" data-accordion="prepare"
          aria-expanded="false" aria-controls="prepare-accordion-content">Prepare</button>
        <div class="accordion-content" data-content="prepare" id="prepare-accordion-content">
          <article id="prepare"><h2>Prepare</h2></article>
        </div>
      </div>
    </div>
  `;
}

/** Reset every accordion header back to "closed" so each test starts clean. */
function resetAccordionState() {
  document.querySelectorAll(".accordion-header.mobile-only").forEach((header) => {
    header.classList.remove("active");
    header.setAttribute("aria-expanded", "false");
    if (header.nextElementSibling) {
      header.nextElementSibling.classList.remove("active");
    }
  });
}

// tabs-accordion.js has no exported functions — everything lives inside one
// DOMContentLoaded closure — so it must be loaded and dispatched exactly
// once for this whole file; a second load would bind a second set of
// listeners on top of the first and double-toggle everything. This runs
// once before any describe/test block below.
beforeAll(() => {
  // Mobile viewport so the "first accordion open by default" branch runs.
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: 500,
  });
  renderAccordionDOM();
  loadTabsAccordion();
  document.dispatchEvent(new Event("DOMContentLoaded"));
});

describe("initial state on load", () => {
  test("first accordion is expanded by default on mobile", () => {
    const firstHeader = document.querySelector('[data-accordion="fire-info"]');
    expect(firstHeader.getAttribute("aria-expanded")).toBe("true");
    expect(firstHeader.classList.contains("active")).toBe(true);
    expect(firstHeader.nextElementSibling.classList.contains("active")).toBe(true);
  });
});

describe("tabs-accordion.js accordion aria-expanded behaviour", () => {
  beforeEach(() => {
    resetAccordionState();
  });

  test("accordion headers are real buttons with aria-expanded/aria-controls", () => {
    const headers = document.querySelectorAll(".accordion-header.mobile-only");
    expect(headers.length).toBeGreaterThan(0);
    headers.forEach((header) => {
      expect(header.tagName).toBe("BUTTON");
      expect(header.getAttribute("aria-controls")).toBe(
        header.nextElementSibling && header.nextElementSibling.id
      );
      expect(header.hasAttribute("aria-expanded")).toBe(true);
    });
  });

  test("clicking a closed accordion header opens it and sets aria-expanded=true", () => {
    const target = document.querySelector('[data-accordion="prepare"]');
    expect(target.getAttribute("aria-expanded")).toBe("false");

    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(target.getAttribute("aria-expanded")).toBe("true");
    expect(target.classList.contains("active")).toBe(true);
    expect(target.nextElementSibling.classList.contains("active")).toBe(true);
  });

  test("opening one accordion closes the others and flips their aria-expanded to false", () => {
    const first = document.querySelector('[data-accordion="fire-info"]');
    const second = document.querySelector('[data-accordion="prepare"]');
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    second.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(first.classList.contains("active")).toBe(false);
  });

  test("clicking an open accordion header closes it (aria-expanded=false)", () => {
    const first = document.querySelector('[data-accordion="fire-info"]');
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(first.getAttribute("aria-expanded")).toBe("true");

    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(first.getAttribute("aria-expanded")).toBe("false");
    expect(first.classList.contains("active")).toBe(false);
  });

  test("native button .click() (Enter/Space activation) toggles aria-expanded", () => {
    // Real <button> elements dispatch a native "click" for Enter/Space
    // activation, so tabs-accordion.js only needs to listen for "click" —
    // no manual keydown handler required.
    const target = document.querySelector('[data-accordion="prepare"]');
    target.click();
    expect(target.getAttribute("aria-expanded")).toBe("true");
  });
});
