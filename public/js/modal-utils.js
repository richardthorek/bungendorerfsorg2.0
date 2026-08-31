// Shared modal utilities: native <dialog> open/close + focus trap/restore.
/* exported showModal, openDialog, closeDialog */

/**
 * Selector for elements that can receive keyboard focus, used by the focus
 * trap below. Good enough for the two dialogs in this app (form controls,
 * buttons, links) without pulling in a full tabbable-element library.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

// Tracks, per-dialog, the element that had focus before it opened so it can
// be restored on close (WCAG 2.2 AA 2.4.3 — focus order/return).
const triggerElements = new WeakMap();

/**
 * Keep Tab/Shift+Tab cycling within the dialog while it's open (WCAG 2.2 AA
 * 2.1.2 — no keyboard trap *outside* intended bounds, and no focus escaping
 * to page content hidden behind the modal backdrop).
 */
function trapFocus(dialog, event) {
  if (event.key !== "Tab") return;

  const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Open a <dialog> using the native showModal() API, which gives us
 * top-layer stacking, a backdrop, and Escape-to-close for free. Adds a
 * focus trap and remembers the triggering element so focus can be restored
 * on close.
 * @param {HTMLDialogElement} dialog
 * @param {HTMLElement} [triggerEl] - element to restore focus to on close;
 *   defaults to document.activeElement at call time.
 */
function openDialog(dialog, triggerEl) {
  if (!dialog || typeof dialog.showModal !== "function") return;

  triggerElements.set(dialog, triggerEl || document.activeElement);

  if (!dialog.dataset.focusTrapBound) {
    dialog.addEventListener("keydown", (event) => trapFocus(dialog, event));
    // Native <dialog> fires "close" for Escape, form method="dialog", and
    // dialog.close() alike — one place to restore focus for all of them.
    dialog.addEventListener("close", () => {
      const trigger = triggerElements.get(dialog);
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    });
    dialog.dataset.focusTrapBound = "true";
  }

  if (!dialog.open) {
    dialog.showModal();
  }

  // Move focus inside the dialog (first focusable element, falling back to
  // the dialog itself) so screen reader users land inside it immediately.
  const focusable = dialog.querySelector(FOCUSABLE_SELECTOR);
  (focusable || dialog).focus();
}

/**
 * Close a <dialog> opened with openDialog(). Triggers the "close" event
 * above, which restores focus to the original trigger element.
 * @param {HTMLDialogElement} dialog
 */
function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.open) {
    dialog.close();
  }
}

/**
 * Render a calendar event's details into #eventModal and open it.
 * @param {Object} event - Microsoft Graph-shaped calendar event.
 */
function showModal(event) {
  const modal = document.getElementById("eventModal");
  const modalContent = document.getElementById("modalEventContent");
  if (!modal || !modalContent) return;

  // Clear previous content
  modalContent.innerHTML = "";

  // Add event details to modal
  const titleElement = document.createElement("h2");
  titleElement.textContent = event.subject;
  modalContent.appendChild(titleElement);

  const startDate = luxon.DateTime.fromISO(event.start.dateTime || event.start, {
    zone: "utc",
  }).setZone("Australia/Sydney");
  const endDate = luxon.DateTime.fromISO(event.end.dateTime || event.end, { zone: "utc" }).setZone(
    "Australia/Sydney"
  );

  const dateTimeElement = document.createElement("p");
  dateTimeElement.textContent = event.isAllDay
    ? `Date: ${startDate.toLocaleString(luxon.DateTime.DATE_MED)}`
    : `Date: ${startDate.toLocaleString(luxon.DateTime.DATETIME_MED)} - ${endDate.toLocaleString(luxon.DateTime.DATETIME_MED)}`;
  modalContent.appendChild(dateTimeElement);

  if (event.location) {
    const locationElement = document.createElement("p");
    locationElement.textContent = `Location: ${event.location.displayName}`;
    modalContent.appendChild(locationElement);
  }

  if (event.body) {
    const descriptionElement = document.createElement("div");
    descriptionElement.innerHTML = DOMPurify.sanitize(event.body);
    modalContent.appendChild(descriptionElement);
  }

  // Show the modal
  openDialog(modal);
}

// Wire up the event modal's own close button here, alongside the code that
// owns #eventModal — previously nothing listened for clicks on it.
document.addEventListener("DOMContentLoaded", () => {
  const eventModal = document.getElementById("eventModal");
  const eventModalClose = document.getElementById("eventModalClose");
  if (eventModal && eventModalClose) {
    eventModalClose.addEventListener("click", () => closeDialog(eventModal));
  }
  if (eventModal) {
    // Backdrop click (outside the <article> card) closes the modal — see
    // the matching handler in contact.js for #contactModal.
    eventModal.addEventListener("click", (event) => {
      if (event.target === eventModal) {
        closeDialog(eventModal);
      }
    });
  }
});

window.showModal = showModal;
window.openDialog = openDialog;
window.closeDialog = closeDialog;
