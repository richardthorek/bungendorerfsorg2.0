function extractFields(description) {
  const statusMatch = description.match(/STATUS: ([^<]*)/);
  const typeMatch = description.match(/TYPE: ([^<]*)/);
  const updatedMatch = description.match(/UPDATED: ([^<]*)/);

  const status = statusMatch ? statusMatch[1] : "N/A";
  const type = typeMatch ? typeMatch[1] : "N/A";
  const updated = updatedMatch ? updatedMatch[1] : "N/A";

  return { status, type, updated };
}

function populateFireInfoTable(data) {
  const fireInfoTableContainer = document.getElementById(
    "fireInfoTableContainer"
  );
  //   let tableHTML = `
  //         <table>
  //             <thead>
  //                 <tr>
  //                     <th>Alert Level</th>
  //                     <th>Incident</th>
  //                     <th>Details</th>
  //                 </tr>
  //             </thead>
  //             <tbody>
  //     `;

  let tableHTML = "";

  data.features.forEach((feature) => {
    const { title, category, description } = feature.properties;
    const { status, type, updated } = extractFields(description);
    let iconUrl;

    if (category.includes("Advice")) {
      iconUrl = "/Images/advice.png";
    } else if (category.includes("Watch and Act")) {
      iconUrl = "/Images/watch-and-act.png";
    } else if (category.includes("Emergency Warning")) {
      iconUrl = "/Images/emergency-warning.png";
    } else {
      iconUrl = "/Images/other.png";
    }

    tableHTML += `
                <article class="card">
                    <header class="card-header">
                        <img src="${iconUrl}" alt="${category}" class="icon-category" />
                        <a href="https://www.rfs.nsw.gov.au/fire-information/fires-near-me" target="_blank">${title}</a>
                    
                    </header>
                   
                        <ul>
                            <li>${status}</li>
                            <li>${type}</li>
                        
                        </ul>
                
                    <footer>${updated}</footer>
                </article>
            `;
  });

  tableHTML += `
            </div>
        `;
  fireInfoTableContainer.innerHTML = tableHTML;
}

function initMap() {
  var map = L.map("map", {
    center: [-35.25870948687002, 149.4431761913284], // Centered on New South Wales, Australia
    zoom: 10,
    zoomControl: false, // Disable the zoom control
  });

  // Fetch the Mapbox token from an external URL using a POST request
  fetch(
    "https://prod-13.eastasia.logic.azure.com:443/workflows/a1e2c15b9b8c4bc09f218255271f73b4/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=59cN9YlOmJPsmVOoixCmKXD2ZDhmk4ZjGEE-IXL1hOQ",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request: "mapbox-token" }),
    }
  )
    .then((response) => response.json())
    .then((data) => {
      var accessToken = data.token;

      // Define navigation guidance light and dark mode tile layers using Mapbox
      var lightTileLayer = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/navigation-guidance-day-v4/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
        {
          attribution:
            '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> contributors',
        }
      );

      var darkTileLayer = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/navigation-guidance-night-v4/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
        {
          attribution:
            '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> contributors',
        }
      );

      // Function to set the appropriate tile layer based on the color scheme
      function setTileLayer() {
        if (
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
        ) {
          darkTileLayer.addTo(map);
        } else {
          lightTileLayer.addTo(map);
        }
      }

      // Set the initial tile layer
      setTileLayer();

      // Listen for changes in the color scheme preference
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", setTileLayer);

      // Define custom icons with error handling
      function createIcon(iconUrl) {
        try {
          return L.icon({
            iconUrl: iconUrl,
            iconSize: [32, 32], // size of the icon
            iconAnchor: [16, 32], // point of the icon which will correspond to marker's location
            popupAnchor: [0, -32], // point from which the popup should open relative to the iconAnchor
          });
        } catch (error) {
          console.error("Error creating icon:", error);
          return L.divIcon({
            html: '<i class="fa fa-fire" style="font-size: 32px; color: grey;"></i>',
            iconSize: [32, 32],
            className: "custom-div-icon",
          });
        }
      }

      // Fallback icon in case custom icons fail
      var defaultIcon = L.divIcon({
        html: '<i class="fa fa-fire" style="font-size: 32px; color: grey;"></i>',
        iconSize: [32, 32],
        className: "custom-div-icon",
      });

      var adviceIcon = createIcon("/Images/advice.png") || defaultIcon;
      var watchAndActIcon =
        createIcon("/Images/watch-and-act.png") || defaultIcon;
      var emergencyWarningIcon =
        createIcon("/Images/emergency-warning.png") || defaultIcon;
      var otherIcon = createIcon("/Images/other.png") || defaultIcon;

      // Create a feature group to hold the markers
      var markers = L.featureGroup().addTo(map);

      // Fetch GeoJSON data and add markers to the map
      const targetUrl =
        "https://prod-16.australiaeast.logic.azure.com:443/workflows/0e1db2551604467787d10a1079e2ca00/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=PPxJa5-zzi3BE7-vp98G6nDRymYIoRgvKw4lZU44Cv4";

      fetch(targetUrl)
        .then((response) => response.json())
        .then((data) => {
          const categoryCounts = {
            Other: 0,
            Advice: 0,
            "Watch and Act": 0,
            "Emergency Warning": 0,
          };

          // Check if the current URL is localhost:3000
          const isTest =
          (window.location.hostname === "localhost" && window.location.port === "3000") ||
          window.location.href === "https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net/";

          // Filter features that contain "COUNCIL AREA: Queanbeyan-Palerang" or "COUNCIL AREA: ACT" in the description
          const filteredFeatures = isTest
            ? data.features
            : data.features.filter(
                (feature) =>
                  feature.properties &&
                  feature.properties.description &&
                  (feature.properties.description.includes(
                    "COUNCIL AREA: Queanbeyan-Palerang"
                  ) ||
                    feature.properties.description.includes(
                      "COUNCIL AREA: ACT"
                    ))
              );

          // Populate the table with filtered features
          populateFireInfoTable({ features: filteredFeatures });

          L.geoJSON(
            { features: filteredFeatures },
            {
              pointToLayer: function (feature, latlng) {
                // Determine the icon based on the warning type
                var icon;
                if (feature.properties.category.includes("Advice")) {
                  icon = adviceIcon;
                  categoryCounts["Advice"]++;
                } else if (
                  feature.properties.category.includes("Watch and Act")
                ) {
                  icon = watchAndActIcon;
                  categoryCounts["Watch and Act"]++;
                } else if (
                  feature.properties.category.includes("Emergency Warning")
                ) {
                  icon = emergencyWarningIcon;
                  categoryCounts["Emergency Warning"]++;
                } else {
                  icon = otherIcon;
                  categoryCounts["Other"]++;
                }
                var marker = L.marker(latlng, { icon: icon });
                markers.addLayer(marker); // Add marker to the feature group
                return marker;
              },
              onEachFeature: function (feature, layer) {
                if (feature.properties && feature.properties.title) {
                  layer.bindPopup(
                    "<h3>" +
                      feature.properties.title +
                      "</h3>" +
                      "<p>" +
                      feature.properties.description +
                      "</p>"
                  );
                }
              },
            }
          ).addTo(map);

          // Create a mini table in the incidentCountCell
          const incidentCountCell =
            document.getElementById("incidentCountCell");
          let tableHTML = "<table>";

          if (categoryCounts["Emergency Warning"] > 0) {
            tableHTML += `
                            <tr>
                                <td><img src="${emergencyWarningIcon.options.iconUrl}" alt="Emergency Warning" /></td>
                                <td>${categoryCounts["Emergency Warning"]}</td>
                            </tr>
                        `;
          }
          if (categoryCounts["Watch and Act"] > 0) {
            tableHTML += `
                            <tr>
                                <td><img src="${watchAndActIcon.options.iconUrl}" alt="Watch and Act" /></td>
                       
                                <td>${categoryCounts["Watch and Act"]}</td>
                            </tr>
                        `;
          }
          if (categoryCounts["Advice"] > 0) {
            tableHTML += `
                            <tr>
                                <td><img src="${adviceIcon.options.iconUrl}" alt="Advice" /></td>
                                <td>${categoryCounts["Advice"]}</td>
                            </tr>
                        `;
          }
          if (categoryCounts["Other"] > 0) {
            tableHTML += `
                            <tr>
                                <td><img src="${otherIcon.options.iconUrl}" alt="Other" /></td>
                                <td>${categoryCounts["Other"]}</td>
                            </tr>
                        `;
          }





  

          tableHTML += "</table>";
          incidentCountCell.innerHTML = tableHTML;

          // Ensure the station marker is included in the bounds calculation
          var stationIcon = L.icon({
            iconUrl: "/Images/station.png",
            iconSize: [32, 32], // size of the icon
            iconAnchor: [16, 16], // point of the icon which will correspond to marker's location
            popupAnchor: [0, -16], // point from which the popup should open relative to the iconAnchor
            className: "station-icon", // custom class for additional styling
          });

          var stationMarker = L.marker(
            [-35.26165168903826, 149.43974909148088],
            { icon: stationIcon }
          );
          stationMarker.bindPopup("<h4>Bungendore RFS Station</h4>");
          markers.addLayer(stationMarker); // Add the station marker to the markers layer group

          // Add custom CSS for circular background
          var style = document.createElement("style");
          style.innerHTML = `
                        .station-icon {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-sizing: border-box; /* Include padding in the element's total width and height */
                        }
                    `;
          document.head.appendChild(style);

          // Check if there are any markers before fitting bounds
          if (markers.getLayers().length > 0) {
            // Fit the map view to the bounds of the markers with 10% padding
            map.fitBounds(markers.getBounds(), {
              padding: [map.getSize().x * 0.1, map.getSize().y * 0.1], // 10% padding on each side
            });
          } else {
            console.log("No markers to fit bounds to.");
          }
        })
        .catch((error) =>
          console.error("Error fetching the GeoJSON data:", error)
        );
    })
    .catch((error) => console.error("Error fetching Mapbox token:", error));
}

// Ensure the map is initialized after the DOM content is loaded
document.addEventListener("DOMContentLoaded", function () {
  initMap();
});

document.addEventListener("DOMContentLoaded", function () {
  const heroLogo = document.querySelector(".hero .logo");
  const navLogo = document.querySelector(".nav-logo");

  function toggleNavLogo() {
    const heroLogoRect = heroLogo.getBoundingClientRect();
    if (heroLogoRect.bottom < 0) {
      navLogo.classList.add("visible");
    } else {
      navLogo.classList.remove("visible");
    }
  }

  window.addEventListener("scroll", toggleNavLogo);
  toggleNavLogo(); // Initial check
});

document.addEventListener("DOMContentLoaded", function () {
  const BFDPContent = document.getElementById("BFDPContent");

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
                <td><input type="checkbox" ${
                  inDangerPeriod ? "checked" : ""
                } disabled></td>
            </tr>
        </table>
    `;

  BFDPContent.innerHTML = tableHTML;
});

document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("contactModal");
  const btn = document.getElementById("contactUsBtn");
  const span = document.getElementsByClassName("close")[0];
  const form = document.getElementById("contactForm");
  const submitButton = document.getElementById("submitButton"); // Select the submit button

  // When the user clicks the button, open the modal
  btn.onclick = function () {
    modal.setAttribute("open", "");
  };

  // When the user clicks on <span> (x), close the modal
  span.onclick = function () {
    modal.removeAttribute("open");
  };

  // When the user clicks anywhere outside of the modal, close it
  window.onclick = function (event) {
    if (event.target == modal) {
      modal.removeAttribute("open");
    }
  };

  // Handle form submission
  form.addEventListener("submit", function (event) {
    event.preventDefault(); // Prevent the default form submission

    // Replace the submit button text with a span indicating busy state
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = '<span aria-busy="true"></span>';

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    fetch(
      "https://prod-03.australiaeast.logic.azure.com:443/workflows/aa6b3f9f93d940dabfaa6d12a84080bc/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=SVh_1oD-jjy4E5BuxJZrY-Ng87jvC2Pg0IEP3s71fsY",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    )
      .then((response) => response.json())
      .then((data) => {
        console.log("Success:", data);

        // Create a visual indication of success
        const successMessage = document.createElement("div");
        successMessage.textContent = "Form submitted successfully!";
        successMessage.style.color = "green";
        successMessage.style.textAlign = "center";
        successMessage.style.marginTop = "10px";
        form.appendChild(successMessage);

        // Restore the original submit button text
        submitButton.innerHTML = originalButtonText;

        // Wait for 2 second, then reset the form and remove the success message
        setTimeout(() => {
          form.reset();
          form.removeChild(successMessage);
          modal.removeAttribute("open");
        }, 2000);
      })
      .catch((error) => {
        console.error("Error:", error);
        // Remove aria-busy attribute in case of error
        submitButton.removeAttribute("aria-busy");
      });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const emailInput = document.getElementById("emailInput");

  emailInput.addEventListener("input", () => {
    const emailValue = emailInput.value;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailPattern.test(emailValue)) {
      emailInput.setAttribute("aria-invalid", "false");
    } else {
      emailInput.setAttribute("aria-invalid", "true");
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const fireDangerTableContainer = document.getElementById(
    "fireDangerTableContainer"
  );
  const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
  const incidentCountCell = document.getElementById("incidentCountCell");
  const fireMessagesDiv = document.getElementById("fireMessages"); // Select the <div> element

  // Fetch the fire danger rating messages from the JSON file
  fetch("/Content/AFDRSMessages.json")
    .then((response) => response.json())
    .then((fireDangerRatings) => {
      // Fetch the XML data for the fire danger rating
      fetch(
        "https://prod-23.australiaeast.logic.azure.com:443/workflows/5db5283afc564a449079c0d2c1fe3622/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=WFE08wwCYaxwAvCQrRnLrUrVPbhC8VzyiPx9IZuHHkg"
      )
        .then((response) => response.text())
        .then((data) => {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(data, "application/xml");
          const districts = xmlDoc.getElementsByTagName("District");

          let southernRangesDistrict = null;
          for (let i = 0; i < districts.length; i++) {
            const districtName =
              districts[i].getElementsByTagName("Name")[0].textContent;
            if (districtName === "Southern Ranges") {
              southernRangesDistrict = districts[i];
              break;
            }
          }

          if (southernRangesDistrict) {
            let dangerLevelToday =
              southernRangesDistrict.getElementsByTagName("DangerLevelToday")[0]
                .textContent;
            dangerLevelToday = dangerLevelToday.trim().toUpperCase(); // Trim and convert to uppercase

            const ratingInfo = fireDangerRatings.FireDangerRatings.find(
              (rating) => rating.Rating === dangerLevelToday
            );

            if (!ratingInfo) {
              console.error(
                `No rating information found for danger level: ${dangerLevelToday}`
              );
              return;
            }

            // Construct style string conditionally
            let styleString = "font-weight: bold;"; // Add font-weight: bold
            if (ratingInfo.color) {
              styleString += `color: ${ratingInfo.color}; `;
            }
            if (ratingInfo["background-color"]) {
              styleString += `background-color: ${ratingInfo["background-color"]}; `;
            }

            // Set the fire danger rating cell content and style
            fireDangerRatingCell.textContent = dangerLevelToday;
            fireDangerRatingCell.setAttribute("style", styleString);

            // Create the old table structure
            const oldTable = document.createElement("table");
            oldTable.innerHTML = `
                            <tr>
                                <th colspan="2" style="${styleString}">
                                    Today's Fire Danger Rating
                                </th>
                            </tr>
                            <tr>
                                <td>
                                    <table>
                                        <tr>
                                        </tr>
                                        <tr>
                                            <td>${dangerLevelToday}</td>
                                        </tr>
                                        <tr>
                                        </tr>
                                        <tr>
                                            <td>${ratingInfo.FireBehaviour}</td>
                                        </tr>
                                    </table>
                                </td>
                                <td>
                                    <ul>
                                        ${ratingInfo.SupportingMessages.map(
                                          (message) => `<li>${message}</li>`
                                        ).join("")}
                                    </ul>
                                </td>
                            </tr>
                        `;

            fireDangerTableContainer.appendChild(oldTable);

            // Inject the matching keyMessage into the fireMessages div
            const keyMessage = ratingInfo.KeyMessage;
            if (keyMessage) {
              fireMessagesDiv.textContent = keyMessage;
            }
          } else {
            console.error(
              "Southern Ranges district not found in the XML data."
            );
          }
        })
        .catch((error) => console.error("Error fetching the XML data:", error));
    })
    .catch((error) => console.error("Error fetching the JSON data:", error));
});

document.addEventListener("DOMContentLoaded", () => {
  const membershipCalendar = document.getElementById("membershipCalendar");
  const communityEventsCalendar = document.getElementById(
    "communityEventsCalendar"
  );
  const modal = document.getElementById("eventModal");
  const modalContent = document.getElementById("modalEventContent");
  const closeButton = document.getElementById("eventModalClose"); // Updated to select the button

  // Fetch events data from the URL
  fetch(
    "https://prod-12.australiaeast.logic.azure.com:443/workflows/a975849d90b74eed9c08c780967fc18d/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=zRG6Cx6kxtdPpmuM4m5cSyhItIAAZhs-NqAa6WIF6Ts"
  ) // Replace with the actual URL
    .then((response) => response.json())
    .then((data) => {
      const events = data.value;

      // Filter and display Membership events
      const membershipEvents = events.filter((event) =>
        event.categories.includes("Public - Training")
      );
      displayEvents(membershipEvents, membershipCalendar);

      // Filter and display Community Events
      const communityEvents = events.filter((event) =>
        event.categories.includes("Public - Community Engagement")
      );
      displayEvents(communityEvents, communityEventsCalendar);
    })
    .catch((error) => console.error("Error fetching events:", error));

  // When the user clicks on the close button, close the modal
  closeButton.onclick = function () {
    modal.removeAttribute("open");
  };

  // When the user clicks anywhere outside of the modal, close it
  window.onclick = function (event) {
    if (event.target == modal) {
      modal.removeAttribute("open");
    }
  };
});

function displayEvents(events, container) {
  container.innerHTML = ""; // Clear any existing content

  events.forEach((event) => {
    const eventElement = document.createElement("div");
    eventElement.className = "event";

    const titleElement = document.createElement("div");
    titleElement.className = "event-title";
    titleElement.textContent = event.subject;
    titleElement.style.cursor = "pointer";

    // Convert start and end times to Bungendore, NSW, Australia time zone
    const startDate = luxon.DateTime.fromISO(
      event.start.dateTime || event.start,
      { zone: "utc" }
    ).setZone("Australia/Sydney");
    const endDate = luxon.DateTime.fromISO(event.end.dateTime || event.end, {
      zone: "utc",
    }).setZone("Australia/Sydney");

    const dateTimeElement = document.createElement("div");
    dateTimeElement.className = "event-date-time";

    eventElement.appendChild(titleElement);

    if (event.isAllDay) {
      dateTimeElement.textContent = `Date: ${startDate.toLocaleString(
        luxon.DateTime.DATE_MED
      )}`;
    } else {
      dateTimeElement.textContent = `Date: ${startDate.toLocaleString(
        luxon.DateTime.DATETIME_MED
      )} - ${endDate.toLocaleString(luxon.DateTime.DATETIME_MED)}`;
    }

    eventElement.appendChild(dateTimeElement);

    if (event.location) {
      const locationElement = document.createElement("div");
      locationElement.className = "event-location";
      locationElement.textContent = `Location: ${event.location.displayName}`;
      eventElement.appendChild(locationElement);
    }

    // Add click event to title to show modal with event details
    titleElement.addEventListener("click", () => {
      showModal(event);
    });

    container.appendChild(eventElement);
  });
}

function showModal(event) {
  const modal = document.getElementById("eventModal");
  const modalContent = document.getElementById("modalEventContent");

  // Clear previous content
  modalContent.innerHTML = "";

  // Add event details to modal
  const titleElement = document.createElement("h2");
  titleElement.textContent = event.subject;
  modalContent.appendChild(titleElement);

  const startDate = luxon.DateTime.fromISO(
    event.start.dateTime || event.start,
    { zone: "utc" }
  ).setZone("Australia/Sydney");
  const endDate = luxon.DateTime.fromISO(event.end.dateTime || event.end, {
    zone: "utc",
  }).setZone("Australia/Sydney");

  const dateTimeElement = document.createElement("p");
  if (event.isAllDay) {
    dateTimeElement.textContent = `Date: ${startDate.toLocaleString(
      luxon.DateTime.DATE_MED
    )}`;
  } else {
    dateTimeElement.textContent = `Date: ${startDate.toLocaleString(
      luxon.DateTime.DATETIME_MED
    )} - ${endDate.toLocaleString(luxon.DateTime.DATETIME_MED)}`;
  }
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
