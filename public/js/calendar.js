document.addEventListener("DOMContentLoaded", () => {
  const membershipCalendar = document.getElementById("membershipCalendar");
  const communityEventsCalendar = document.getElementById("communityEventsCalendar");

  if (membershipCalendar) {
    renderTrainingSchedule("membershipCalendar");
  }
  if (communityEventsCalendar) {
    renderCommunityEvents("communityEventsCalendar");
  }
});

const WEEKDAYS = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };

// Parses recurrence strings like "second-saturday" or "every-friday".
function parseRecurrence(rule) {
  const parts = String(rule).split("-");
  const weekday = WEEKDAYS[parts[parts.length - 1]];
  if (!weekday) return null;

  if (parts[0] === "every") {
    return { ordinal: null, weekday };
  }
  const ordinal = ORDINALS[parts[0]];
  return ordinal ? { ordinal, weekday } : null;
}

function nthWeekdayOfMonth(year, month, weekday, ordinal) {
  if (ordinal === -1) {
    let date = luxon.DateTime.local(year, month, 1).endOf("month").startOf("day");
    while (date.weekday !== weekday) {
      date = date.minus({ days: 1 });
    }
    return date;
  }

  let date = luxon.DateTime.local(year, month, 1).startOf("day");
  let count = 0;
  while (date.month === month) {
    if (date.weekday === weekday) {
      count += 1;
      if (count === ordinal) return date;
    }
    date = date.plus({ days: 1 });
  }
  return null;
}

function nextWeeklyOccurrence(today, weekday) {
  let date = today;
  while (date.weekday !== weekday) {
    date = date.plus({ days: 1 });
  }
  return date;
}

function nextOccurrence(recurrence, today) {
  const { ordinal, weekday } = recurrence;
  if (ordinal === null) {
    return nextWeeklyOccurrence(today, weekday);
  }

  let candidate = nthWeekdayOfMonth(today.year, today.month, weekday, ordinal);
  if (!candidate || candidate < today) {
    const nextMonth = today.plus({ months: 1 });
    candidate = nthWeekdayOfMonth(nextMonth.year, nextMonth.month, weekday, ordinal);
  }
  return candidate;
}

function buildEventCard(title, dateLabel, location) {
  const eventElement = document.createElement("div");
  eventElement.className = "event";

  const titleElement = document.createElement("div");
  titleElement.className = "event-title";
  titleElement.textContent = title;
  eventElement.appendChild(titleElement);

  const dateTimeElement = document.createElement("div");
  dateTimeElement.className = "event-date-time";
  dateTimeElement.textContent = dateLabel;
  eventElement.appendChild(dateTimeElement);

  if (location) {
    const locationElement = document.createElement("div");
    locationElement.className = "event-location";
    locationElement.textContent = location;
    eventElement.appendChild(locationElement);
  }

  return eventElement;
}

function renderEmpty(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  const emptyEl = document.createElement("p");
  emptyEl.className = "events-empty";
  emptyEl.textContent = message;
  container.appendChild(emptyEl);
}

function renderTrainingSchedule(containerId) {
  showLoadingMessage(containerId, "Loading training schedule...");

  fetch("/Content/trainingSchedule.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then((items) => {
      const today = luxon.DateTime.now().setZone("Australia/Sydney").startOf("day");
      const schedule = (Array.isArray(items) ? items : [])
        .map((item) => {
          const recurrence = parseRecurrence(item.recurrence);
          const nextDate = recurrence ? nextOccurrence(recurrence, today) : null;
          return nextDate ? { ...item, nextDate } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.nextDate - b.nextDate);

      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";

      if (schedule.length === 0) {
        renderEmpty(containerId, "No training sessions scheduled at this time.");
        return;
      }

      schedule.forEach((item) => {
        const dateLabel = `Next: ${item.nextDate.toLocaleString(luxon.DateTime.DATE_MED_WITH_WEEKDAY)}${item.time ? `, ${item.time}` : ""}`;
        container.appendChild(buildEventCard(item.title, dateLabel, item.location));
      });
    })
    .catch((error) => {
      console.error("Error loading training schedule:", error);
      showErrorMessage(containerId, getUserFriendlyErrorMessage(error), true);
    });
}

function renderCommunityEvents(containerId) {
  showLoadingMessage(containerId, "Loading community events...");

  fetch("/Content/communityEvents.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    })
    .then((items) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";

      const events = Array.isArray(items) ? items : [];
      if (events.length === 0) {
        renderEmpty(containerId, "No community events listed at this time.");
        return;
      }

      events.forEach((item) => {
        container.appendChild(buildEventCard(item.name, item.timing, item.description));
      });
    })
    .catch((error) => {
      console.error("Error loading community events:", error);
      showErrorMessage(containerId, getUserFriendlyErrorMessage(error), true);
    });
}
