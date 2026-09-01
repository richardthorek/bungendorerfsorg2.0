/* exported extractFields, populateFireInfoTable, getIconUrl */
function extractFields(description) {
  const fields = [
    "ALERT LEVEL",
    "LOCATION",
    "COUNCIL AREA",
    "STATUS",
    "TYPE",
    "FIRE",
    "SIZE",
    "RESPONSIBLE AGENCY",
    "UPDATED",
  ];

  return fields.reduce((acc, field) => {
    const match = description.match(new RegExp(`${field}: ([^<]*)`));
    acc[field.toLowerCase().replace(/ /g, "")] = match ? match[1].trim() : "N/A";
    return acc;
  }, {});
}

function populateFireInfoTable(data) {
  const fireInfoTableContainer = document.getElementById("fireInfoTableContainer");
  const features = Array.isArray(data?.features) ? data.features : [];
  let tableHTML = "";

  if (!fireInfoTableContainer) {
    return;
  }

  // Honest degraded state (roadmap §2.1): a failed fetch must never render as
  // "no active incidents" — that reads as "all clear" when it actually means
  // "we don't know". Callers pass data.error instead of an empty features list.
  if (data?.error) {
    fireInfoTableContainer.innerHTML = DOMPurify.sanitize(
      `<p class="data-label data-label--degraded" role="alert"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> ${data.error}</p>`
    );
    return;
  }

  if (features.length === 0) {
    fireInfoTableContainer.innerHTML = DOMPurify.sanitize(
      "<p class=\"data-label\">No active incidents in our area.</p>"
    );
    return;
  }

  features.forEach((feature) => {
    const { title, category, description } = feature.properties;
    const { alertlevel, location, councilarea, status, type, size, responsibleagency, updated } =
      extractFields(description);

    const iconUrl = getIconUrl(category);
    const level = getLevelSlug(category);

    tableHTML += `
      <article class="incident-card" data-level="${level}">
        <header class="incident-card__header">
          <img src="${iconUrl}" alt="${alertlevel}" class="incident-card__icon">
          <div class="incident-card__heading">
            <span class="incident-card__badge">${status}</span>
            <h4 class="incident-card__title">${title}</h4>
          </div>
        </header>
        <p class="incident-card__location">
          <i class="fas fa-map-marker-alt" aria-hidden="true"></i> ${location}
        </p>
        <dl class="incident-card__meta">
          <div><dt>Council area</dt><dd>${councilarea}</dd></div>
          <div><dt>Type</dt><dd>${type}</dd></div>
          <div><dt>Size</dt><dd>${size}</dd></div>
        </dl>
        <footer class="incident-card__footer">
          ${responsibleagency} &middot; Updated ${updated}
        </footer>
      </article>
    `;
  });

  fireInfoTableContainer.innerHTML = DOMPurify.sanitize(tableHTML);
}

function getLevelSlug(category) {
  if (category.includes("Advice")) return "advice";
  if (category.includes("Watch and Act")) return "watch-and-act";
  if (category.includes("Emergency Warning")) return "emergency-warning";
  return "other";
}

function getIconUrl(category) {
  if (category.includes("Advice")) {
    return "/Images/advice.png";
  } else if (category.includes("Watch and Act")) {
    return "/Images/watch-and-act.png";
  } else if (category.includes("Emergency Warning")) {
    return "/Images/emergency-warning.png";
  } else {
    return "/Images/other.png";
  }
}

window.extractFields = extractFields;
window.populateFireInfoTable = populateFireInfoTable;
window.getIconUrl = getIconUrl;

document.addEventListener("DOMContentLoaded", () => {
  // Nav Logo Toggle
  const heroLogo = document.querySelector(".hero .logo");
  const navLogo = document.querySelector(".nav-logo");

  function toggleNavLogo() {
    if (heroLogo && navLogo) {
      // Check if elements exist
      const heroLogoRect = heroLogo.getBoundingClientRect();
      navLogo.classList.toggle("visible", heroLogoRect.bottom < 0);
    }
  }

  if (heroLogo && navLogo) {
    // Add event listener only if elements exist
    window.addEventListener("scroll", toggleNavLogo);
    toggleNavLogo(); // Initial check
  }

  // Bush Fire Danger Period (BFDP) check.
  //
  // The RFS Commissioner can vary the BFDP start/end date per district, and
  // publishes the authoritative, currently-in-force dates as a live table
  // at https://www.rfs.nsw.gov.au/fire-information/BFDP. That page has no
  // public data feed, so instead of guessing or scraping it, the actual
  // dates for our district live in Content/bfdpDates.json — a small file a
  // brigade member updates by hand (checking that RFS page) whenever the
  // Commissioner varies them. bfdpPeriod is populated from it below; if the
  // file is missing or hasn't loaded yet, this falls back to the statewide
  // statutory default (1 Oct – 31 Mar) so the strip cell still shows a
  // reasonable state immediately on page load.
  let bfdpPeriod = null; // { start: Date, end: Date }, set once bfdpDates.json loads (see below)

  function isBushfireDangerPeriod() {
    const now = new Date();
    if (bfdpPeriod) {
      return now >= bfdpPeriod.start && now <= bfdpPeriod.end;
    }
    const month = now.getMonth() + 1; // getMonth() is zero-based
    return month >= 10 || month <= 3;
  }

  // Cell 4 (Controlled Burn) — combines the live district feed (Total Fire
  // Ban + fire danger rating, read from the same XML already fetched below
  // for Cell 1) with the Bush Fire Danger Period calendar, so the strip
  // shows the one requirement that actually applies today.
  //
  // The Bush Fire Danger Period (BFDP) and the daily Fire Danger Rating
  // (FDR) are two separate things and must not be conflated: the BFDP is a
  // fixed statutory season (default 1 Oct – 31 Mar) that alone determines
  // whether a fire permit is required at all; the FDR is a day-to-day
  // condition rating that determines Total Fire Bans and, only *within* an
  // active BFDP, whether an existing permit gets suspended for the day. A
  // High+ rating on a day outside the BFDP has no bearing on permits,
  // because no permit is required or in force to suspend.
  // Escalates: Total Fire Ban (no burning at all, any time of year) >
  // BFDP + High+ rating (permit may be suspended) > BFDP alone (permit
  // required) > outside BFDP (notify-only, year-round baseline).
  // Total Fire Ban is represented by the standard prohibition pictogram (a
  // flame inside a red "no" circle), not by an invented colour scale — see
  // .icon-prohibit in main.css. Swapped in only while a ban is actually in
  // effect; every other state keeps the plain flame icon.
  function setBurnIcon(isBanned) {
    const iconSlot = document.getElementById("stripBurnIcon");
    if (!iconSlot) return;
    iconSlot.innerHTML = DOMPurify.sanitize(
      isBanned
        ? "<span class=\"icon-prohibit\"><i class=\"fas fa-fire\"></i><i class=\"fas fa-ban icon-prohibit__ring\"></i></span>"
        : "<i class=\"fas fa-fire\"></i>"
    );
  }

  function updateControlledBurnCell(fireBanToday, dangerLevelToday) {
    const statusEl = document.getElementById("stripBurnStatus");
    const subEl = document.getElementById("stripBurnSub");
    const linkEl = document.getElementById("stripBurnLink");
    if (!statusEl || !subEl) return;

    if (fireBanToday === "Yes") {
      statusEl.textContent = "No Burning";
      statusEl.setAttribute("data-state", "toban");
      subEl.textContent =
        "Total Fire Ban in effect — all permits and exemptions are suspended today.";
      setBurnIcon(true);
      if (linkEl) {
        linkEl.textContent = "Total Fire Ban info →";
        linkEl.href = "https://www.rfs.nsw.gov.au/fire-information/BFDP";
      }
      return;
    }

    setBurnIcon(false);

    if (linkEl) {
      linkEl.textContent = "Notify RFS →";
      linkEl.href = "https://www.rfs.nsw.gov.au/notify";
    }

    const inDangerPeriod = isBushfireDangerPeriod();
    const highDangerLevels = ["HIGH", "EXTREME", "CATASTROPHIC"];
    const isHighDanger = Boolean(dangerLevelToday) && highDangerLevels.includes(dangerLevelToday);

    if (inDangerPeriod && isHighDanger) {
      statusEl.textContent = "Check Permit";
      statusEl.setAttribute("data-state", "high");
      subEl.textContent =
        "Bush Fire Danger Period, and fire danger is High or above today — your permit may be suspended. Check before you light up.";
    } else if (inDangerPeriod) {
      statusEl.textContent = "Permit Required";
      statusEl.setAttribute("data-state", "bfdp");
      subEl.textContent =
        "Bush Fire Danger Period: get a permit, and notify the RFS & your neighbours 24 hrs ahead.";
    } else {
      statusEl.textContent = "Notify First";
      statusEl.setAttribute("data-state", "normal");
      subEl.textContent =
        "No permit needed, but notify the RFS & your neighbours at least 24 hrs ahead.";
    }
  }

  // Permit & burning rules — expandable detail on the Controlled Burn card
  // (always relevant, so it's not one of the awareness carousel's rotating
  // cards). Click-to-expand rather than hover-only so it works by touch and
  // keyboard, not just a mouse.
  const permitDetailsToggle = document.getElementById("permitDetailsToggle");
  const permitDetails = document.getElementById("permitDetails");
  if (permitDetailsToggle && permitDetails) {
    permitDetailsToggle.addEventListener("click", function () {
      const expanded = permitDetailsToggle.getAttribute("aria-expanded") === "true";
      permitDetailsToggle.setAttribute("aria-expanded", String(!expanded));
      permitDetails.hidden = expanded;
    });
  }

  // Fire Danger Rating and Incidents
  const fireDangerTableContainer = document.getElementById("fireDangerTableContainer");
  const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
  const fireDangerMessage = document.getElementById("fireDangerMessage");

  if (fireDangerRatingCell && fireDangerMessage) {
    // Check if necessary strip elements exist
    Promise.all([
      fetch("/Content/AFDRSMessages.json").then((response) => response.json()),
      fetch("/Content/bfdpDates.json")
        .then((response) => response.json())
        .catch(() => null), // isBushfireDangerPeriod() falls back to the statutory default
    ])
      .then(([fireDangerRatings, bfdpDates]) => {
        if (bfdpDates) {
          bfdpPeriod = { start: new Date(bfdpDates.start), end: new Date(bfdpDates.end) };
        }
        fetch(`${getApiBaseUrl()}/api/fire-danger`)
          .then((response) => {
            if (!response.ok) {
              throw new Error("Failed to fetch fire danger data");
            }
            // /api/fire-danger is in sw.js's CACHEABLE_API_PATHS list, so a
            // network failure can be silently served from the service
            // worker's own cache — this fetch() still "succeeds" from here,
            // with nothing distinguishing it from a genuinely live read.
            // There's no last-known-good UI built for this cell (unlike
            // emergency-data.js's incident/warning data), so the honest
            // choice is to treat it the same as any other fetch failure
            // rather than silently render a possibly-stale rating as live.
            if (response.headers && response.headers.get("X-SW-Served-From") === "cache") {
              throw new Error("Failed to fetch fire danger data");
            }
            // Same reasoning for api/shared/fireDataProxy.js's own server-side
            // stale-while-revalidate cache: a successful 200 can still carry
            // data up to 30 minutes old (X-Data-Freshness: stale) when the
            // Logic App itself was unreachable. Treat it as a fetch failure
            // rather than render a possibly-stale rating as a live one.
            if (response.headers && response.headers.get("X-Data-Freshness") === "stale") {
              throw new Error("Failed to fetch fire danger data");
            }
            return response.text();
          })
          .then((data) => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(data, "application/xml");
            const districts = xmlDoc.getElementsByTagName("District");

            const southernRangesDistrict = Array.from(districts).find(
              (district) =>
                district.getElementsByTagName("Name")[0].textContent === "Southern Ranges"
            );

            if (southernRangesDistrict) {
              const dangerNode = southernRangesDistrict.getElementsByTagName("DangerLevelToday")[0];
              let dangerLevelToday = dangerNode ? dangerNode.textContent : "";
              dangerLevelToday = dangerLevelToday
                .replace(/-/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .toUpperCase();

              const fireBanNode = southernRangesDistrict.getElementsByTagName("FireBanToday")[0];
              const fireBanToday = fireBanNode ? fireBanNode.textContent.trim() : "";
              updateControlledBurnCell(fireBanToday, dangerLevelToday);

              const ratingInfo = fireDangerRatings.FireDangerRatings.find(
                (rating) =>
                  String(rating.Rating || "")
                    .replace(/-/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .toUpperCase() === dangerLevelToday
              );

              if (!ratingInfo || !dangerLevelToday) {
                console.error(`No rating information found for danger level: ${dangerLevelToday}`);
                fireDangerRatingCell.textContent = "No Rating";
                fireDangerRatingCell.setAttribute("data-level", "NO RATING");
                fireDangerMessage.textContent = "Rating information currently unavailable.";
                return;
              }

              fireDangerRatingCell.textContent = dangerLevelToday;
              fireDangerRatingCell.setAttribute("data-level", dangerLevelToday);
              fireDangerRatingCell.removeAttribute("style"); // CSS data-level rules handle all colour; no inline override
              fireDangerMessage.textContent = ratingInfo.FireBehaviour;

              if (fireDangerTableContainer) {
                fireDangerTableContainer.innerHTML = ""; // Clear out old table if it exists
              }

              // Update emergency dashboard with fire danger data only — incident
              // count is emergency-data.js's exclusive responsibility (see
              // updateEmergencyDashboard's doc comment); asserting a guessed
              // count here would race with, and can clobber, the real one.
              if (typeof window.updateEmergencyDashboard === "function") {
                window.updateEmergencyDashboard({
                  dangerLevel: dangerLevelToday,
                  message: ratingInfo.FireBehaviour || ratingInfo.KeyMessage,
                });
              }
            } else {
              console.error("Southern Ranges district not found in the XML data.");
              fireDangerRatingCell.textContent = "No Rating";
              fireDangerRatingCell.setAttribute("data-level", "NO RATING");
              fireDangerMessage.textContent = "Rating information currently unavailable.";
              updateControlledBurnCell("", "");
            }
          })
          .catch((error) => {
            console.error("Error fetching the XML data:", error);
            if (fireDangerRatingCell) {
              fireDangerRatingCell.textContent = "No Rating";
              fireDangerRatingCell.setAttribute("data-level", "NO RATING");
            }
            if (fireDangerMessage) fireDangerMessage.textContent = "Could not load rating message.";
            updateControlledBurnCell("", "");

            if (typeof window.updateEmergencyDashboard === "function") {
              window.updateEmergencyDashboard({
                dangerLevel: "NO RATING",
                message: "Rating information currently unavailable.",
              });
            }
          });
      })
      .catch((error) => {
        console.error("Error fetching the JSON data:", error);
        if (fireDangerRatingCell) fireDangerRatingCell.textContent = "Error";
        if (fireDangerMessage) fireDangerMessage.textContent = "Could not load rating message.";
        updateControlledBurnCell("", "");
      });
  }
});
