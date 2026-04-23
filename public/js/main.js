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

  // Helper function for bushfire danger period check
  function isBushfireDangerPeriod() {
    const now = new Date();
    const month = now.getMonth() + 1; // getMonth() is zero-based
    return month >= 10 || month <= 3;
  }

  // Bushfire Danger Period Content
  const BFDPContent = document.getElementById("BFDPContent");
  if (BFDPContent) {
    // Check if element exists
    const inDangerPeriod = isBushfireDangerPeriod();
    const statusText = inDangerPeriod
      ? "We are currently in the bushfire danger period. If you would like to light a fire any larger than a cooking fire you must;"
      : "We are not currently in the bushfire danger period. If you would like to light a fire any larger than a cooking fire you must;";

    const tableHTML = `
    <p>${statusText}</p>
    <table>
      <tr>
        <td>Not light your fire on days of total fire ban or high fire danger</td>
        <td><input type="checkbox" checked disabled></td>
      </tr>
      <tr>
        <td>Notify your neighbours</td>
        <td><input type="checkbox" checked disabled></td>
      </tr>
      <tr>
        <td>Notify the RFS of your burn</td>
        <td><input type="checkbox" checked disabled></td>
      </tr>
      <tr>
        <td>Have been issued a fire permit</td>
        <td><input type="checkbox" ${inDangerPeriod ? "checked" : ""} disabled></td>
      </tr>
    </table>
  `;
    BFDPContent.innerHTML = DOMPurify.sanitize(tableHTML);
  }

  // Fire Danger Rating and Incidents
  const fireDangerTableContainer = document.getElementById("fireDangerTableContainer");
  const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
  const fireDangerMessage = document.getElementById("fireDangerMessage");

  if (fireDangerRatingCell && fireDangerMessage) {
    // Check if necessary strip elements exist
    fetch("/Content/AFDRSMessages.json")
      .then((response) => response.json())
      .then((fireDangerRatings) => {
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
            }
          })
          .catch((error) => {
            console.error("Error fetching the XML data:", error);
            if (fireDangerRatingCell) {
              fireDangerRatingCell.textContent = "No Rating";
              fireDangerRatingCell.setAttribute("data-level", "NO RATING");
            }
            if (fireDangerMessage) fireDangerMessage.textContent = "Could not load rating message.";

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
      });
  }
});
