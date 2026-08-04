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

    tableHTML += `
      <article class="feature-card compact">
        <div class="compact-header">
          <span id="feature-card-header-span">
            <img src="${iconUrl}" alt="${alertlevel}" class="cardIcon">
            ${status}
          </span>
          <p class="compact-card-heading">${title}</p>
        </div>
        <div class="card-content">
          <p>${location}</p>
          <div class="three-column-grid">
            <p>${councilarea}</p>
            <p>${type}</p>
            <p>${size}</p>
          </div>
        </div>
        <div>
          <p class="align-bottom">${responsibleagency} Updated ${updated}</p>
        </div>
      </article>
    `;
  });

  fireInfoTableContainer.innerHTML = DOMPurify.sanitize(tableHTML);
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
      if (linkEl) {
        linkEl.textContent = "Total Fire Ban info →";
        linkEl.href = "https://www.rfs.nsw.gov.au/fire-information/BFDP";
      }
      return;
    }

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

              // Update emergency dashboard with fire danger data
              if (typeof window.updateEmergencyDashboard === "function") {
                // Get incident count from the page if available
                const incidentCountCell = document.getElementById("incidentCountCell");
                let incidentCount = 0;
                if (incidentCountCell && incidentCountCell.textContent) {
                  const countMatch = incidentCountCell.textContent.match(/\d+/);
                  incidentCount = countMatch ? parseInt(countMatch[0], 10) : 0;
                }

                window.updateEmergencyDashboard({
                  dangerLevel: dangerLevelToday,
                  message: ratingInfo.FireBehaviour || ratingInfo.KeyMessage,
                  incidentCount: incidentCount,
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
                incidentCount: 0,
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
