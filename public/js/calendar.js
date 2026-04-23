document.addEventListener("DOMContentLoaded", () => {
  const membershipCalendar = document.getElementById("membershipCalendar");
  const communityEventsCalendar = document.getElementById("communityEventsCalendar");
  const modal = document.getElementById("eventModal");
  const closeButton = document.getElementById("eventModalClose");

  // Show loading state
  if (membershipCalendar) {
    showLoadingMessage("membershipCalendar", "Loading training events...");
  }
  if (communityEventsCalendar) {
    showLoadingMessage("communityEventsCalendar", "Loading community events...");
  }

  // Fetch events data from the URL
  fetch(`${getApiBaseUrl()}/api/calendar-events`)
    .then((response) => response.json())
    .then((data) => {
      const events = Array.isArray(data?.value) ? data.value : [];

      // Keep only upcoming events (start of today in local timezone or later).
      const todayStart = luxon.DateTime.now().setZone("Australia/Sydney").startOf("day");
      const futureEvents = events
        .filter((event) => {
          const startDateTime = luxon.DateTime.fromISO(event.start?.dateTime || event.start, {
            zone: "utc",
          }).setZone("Australia/Sydney");
          return startDateTime >= todayStart;
        })
        .sort((a, b) => {
          const aStart = luxon.DateTime.fromISO(a.start?.dateTime || a.start, { zone: "utc" });
          const bStart = luxon.DateTime.fromISO(b.start?.dateTime || b.start, { zone: "utc" });
          return aStart - bStart;
        });

      // Filter and display Membership events
      const membershipEvents = futureEvents.filter(
        (event) => Array.isArray(event.categories) && event.categories.includes("Public - Training")
      );
      displayEvents(membershipEvents, membershipCalendar);

      // Filter and display Community Events
      const communityEvents = futureEvents.filter(
        (event) =>
          Array.isArray(event.categories) &&
          event.categories.includes("Public - Community Engagement")
      );
      displayEvents(communityEvents, communityEventsCalendar);
    })
    .catch((error) => {
      console.error("Error fetching events:", error);
      const errorMessage = getUserFriendlyErrorMessage(error);
      // Show error in both calendars
      if (membershipCalendar) {
        showErrorMessage("membershipCalendar", errorMessage, true);
      }
      if (communityEventsCalendar) {
        showErrorMessage("communityEventsCalendar", errorMessage, true);
      }
    });

  // When the user clicks on the close button, close the modal
  closeButton.onclick = () => modal.removeAttribute("open");

  // When the user clicks anywhere outside of the modal, close it
  window.onclick = (event) => {
    if (event.target === modal) {
      modal.removeAttribute("open");
    }
  };
});

function displayEvents(events, container) {
  container.innerHTML = ""; // Clear any existing content

  if (events.length === 0) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "events-empty";
    emptyEl.textContent = "No upcoming events scheduled at this time.";
    container.appendChild(emptyEl);
    return;
  }

  events.forEach((event) => {
    const eventElement = document.createElement("div");
    eventElement.className = "event";

    const titleElement = document.createElement("div");
    titleElement.className = "event-title";
    titleElement.textContent = event.subject;
    titleElement.style.cursor = "pointer";

    // Convert start and end times to Bungendore, NSW, Australia time zone
    const startDate = luxon.DateTime.fromISO(event.start.dateTime || event.start, {
      zone: "utc",
    }).setZone("Australia/Sydney");
    const endDate = luxon.DateTime.fromISO(event.end.dateTime || event.end, {
      zone: "utc",
    }).setZone("Australia/Sydney");

    const dateTimeElement = document.createElement("div");
    dateTimeElement.className = "event-date-time";
    dateTimeElement.textContent = event.isAllDay
      ? `Date: ${startDate.toLocaleString(luxon.DateTime.DATE_MED)}`
      : `Date: ${startDate.toLocaleString(luxon.DateTime.DATETIME_MED)} - ${endDate.toLocaleString(luxon.DateTime.DATETIME_MED)}`;

    eventElement.appendChild(titleElement);
    eventElement.appendChild(dateTimeElement);

    if (event.location) {
      const locationElement = document.createElement("div");
      locationElement.className = "event-location";
      locationElement.textContent = `Location: ${event.location.displayName}`;
      eventElement.appendChild(locationElement);
    }

    // Add click event to title to show modal with event details
    titleElement.addEventListener("click", () => showModal(event));

    container.appendChild(eventElement);
  });
}
