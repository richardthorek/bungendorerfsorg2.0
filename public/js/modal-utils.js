// Shared modal utilities for calendar events
function showModal(event) {
  const modal = document.getElementById("eventModal");
  const modalContent = document.getElementById("modalEventContent");

  // Clear previous content
  modalContent.innerHTML = "";

  // Add event details to modal
  const titleElement = document.createElement("h2");
  titleElement.textContent = event.subject;
  modalContent.appendChild(titleElement);

  const startDate = luxon.DateTime.fromISO(event.start.dateTime || event.start, { zone: "utc" }).setZone("Australia/Sydney");
  const endDate = luxon.DateTime.fromISO(event.end.dateTime || event.end, { zone: "utc" }).setZone("Australia/Sydney");

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
  modal.setAttribute("open", "");
}
