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
  let tableHTML = "";

  data.features.forEach((feature) => {
    const { title, category, description } = feature.properties;
    const {
      alertlevel,
      location,
      councilarea,
      status,
      type,
      fire,
      size,
      responsibleagency,
      updated,
    } = extractFields(description);

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

document.addEventListener("DOMContentLoaded", () => {
  // Nav Logo Toggle
  const heroLogo = document.querySelector(".hero .logo");
  const navLogo = document.querySelector(".nav-logo");

  function toggleNavLogo() {
    if (heroLogo && navLogo) { // Check if elements exist
      const heroLogoRect = heroLogo.getBoundingClientRect();
      navLogo.classList.toggle("visible", heroLogoRect.bottom < 0);
    }
  }

  if (heroLogo && navLogo) { // Add event listener only if elements exist
    window.addEventListener("scroll", toggleNavLogo);
    toggleNavLogo(); // Initial check
  }

  // Bushfire Danger Period Content
  const BFDPContent = document.getElementById("BFDPContent");
  if (BFDPContent) { // Check if element exists
    function isBushfireDangerPeriod() {
      const now = new Date();
      const month = now.getMonth() + 1; // getMonth() is zero-based
      return month >= 10 || month <= 3;
    }

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
  const fireDangerMessage = document.getElementById("fireDangerMessage"); // New element for the message
  // const incidentCountCell = document.getElementById("incidentCountCell"); // This variable is declared but not used.
  const fireMessagesDiv = document.getElementById("fireMessages");

  if (fireDangerRatingCell && fireDangerMessage && fireMessagesDiv) { // Check if all necessary elements exist
    fetch("/Content/AFDRSMessages.json")
      .then((response) => response.json())
      .then((fireDangerRatings) => {
        fetch("/api/fire-danger")
          .then((response) => response.text())
          .then((data) => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(data, "application/xml");
            const districts = xmlDoc.getElementsByTagName("District");

            const southernRangesDistrict = Array.from(districts).find(
              (district) => district.getElementsByTagName("Name")[0].textContent === "Southern Ranges"
            );

            if (southernRangesDistrict) {
              let dangerLevelToday =
                southernRangesDistrict.getElementsByTagName("DangerLevelToday")[0].textContent;
              dangerLevelToday = dangerLevelToday.trim().toUpperCase();

              const ratingInfo = fireDangerRatings.FireDangerRatings.find(
                (rating) => rating.Rating === dangerLevelToday
              );

              if (!ratingInfo) {
                console.error(`No rating information found for danger level: ${dangerLevelToday}`);
                // Display a default message if ratingInfo is not found
                fireDangerRatingCell.textContent = "N/A";
                fireDangerMessage.textContent = "Rating information currently unavailable.";
                fireMessagesDiv.textContent = "Fire danger information is currently unavailable.";
                return;
              }

              const styleString = `
              font-weight: bold;
              ${ratingInfo.color ? `color: ${ratingInfo.color};` : ""}
              ${ratingInfo["background-color"] ? `background-color: ${ratingInfo["background-color"]};` : ""}
            `;

              fireDangerRatingCell.textContent = dangerLevelToday;
              fireDangerRatingCell.setAttribute("style", styleString);
              fireDangerMessage.textContent = ratingInfo.FireBehaviour; // Populate the new message element

              if (fireDangerTableContainer) {
                fireDangerTableContainer.innerHTML = ''; // Clear out old table if it exists
              }

              const keyMessage = ratingInfo.KeyMessage;
              if (keyMessage) {
                fireMessagesDiv.textContent = keyMessage;
              }
            } else {
              console.error("Southern Ranges district not found in the XML data.");
            }
          })
          .catch((error) => {
            console.error("Error fetching the XML data:", error);
            // Display error messages in the UI
            if (fireDangerRatingCell) fireDangerRatingCell.textContent = "Error";
            if (fireDangerMessage) fireDangerMessage.textContent = "Could not load rating message.";
            if (fireMessagesDiv) fireMessagesDiv.textContent = "Could not load fire danger information.";
          });
      })
      .catch((error) => {
        console.error("Error fetching the JSON data:", error);
        // Display error messages in the UI
        if (fireDangerRatingCell) fireDangerRatingCell.textContent = "Error";
        if (fireDangerMessage) fireDangerMessage.textContent = "Could not load rating message.";
        if (fireMessagesDiv) fireMessagesDiv.textContent = "Could not load fire danger information.";
      });
  }
});