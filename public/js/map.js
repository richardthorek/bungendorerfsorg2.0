function initMap() {
  const map = L.map("map", {
    center: [-35.25870948687002, 149.4431761913284], // Centered on New South Wales, Australia
    zoom: 10,
    zoomControl: false, // Disable the zoom control
  });

  // Fetch the Mapbox token from the backend API
  fetch("/mapbox-token")
    .then((response) => response.json())
    .then((data) => {
      const accessToken = data.token;

      // Define navigation guidance light and dark mode tile layers using Mapbox
      const lightTileLayer = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/navigation-guidance-day-v4/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
        {
          attribution:
            "&copy; <a href=\"https://www.mapbox.com/about/maps/\">Mapbox</a> contributors",
        }
      );

      const darkTileLayer = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/navigation-guidance-night-v4/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
        {
          attribution:
            "&copy; <a href=\"https://www.mapbox.com/about/maps/\">Mapbox</a> contributors",
        }
      );

      // Function to set the appropriate tile layer based on the color scheme
      function setTileLayer() {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          darkTileLayer.addTo(map);
        } else {
          lightTileLayer.addTo(map);
        }
      }

      // Set the initial tile layer
      setTileLayer();

      // Listen for changes in the color scheme preference
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", setTileLayer);

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
            html: "<i class=\"fa fa-fire\" style=\"font-size: 32px; color: grey;\"></i>",
            iconSize: [32, 32],
            className: "custom-div-icon",
          });
        }
      }

      // Fallback icon in case custom icons fail
      const defaultIcon = L.divIcon({
        html: "<i class=\"fa fa-fire\" style=\"font-size: 32px; color: grey;\"></i>",
        iconSize: [32, 32],
        className: "custom-div-icon",
      });

      const icons = {
        advice: createIcon("/Images/advice.png") || defaultIcon,
        watchAndAct: createIcon("/Images/watch-and-act.png") || defaultIcon,
        emergencyWarning: createIcon("/Images/emergency-warning.png") || defaultIcon,
        other: createIcon("/Images/other.png") || defaultIcon,
      };

      // Create a feature group to hold the markers
      const markers = L.featureGroup().addTo(map);

      // Fetch GeoJSON data and add markers to the map
      const targetUrl = "/api/fire-incidents";

      fetch(targetUrl, {
        method: "GET",
        headers: {
          "X-Request-ID": "Get-Fire-Incidents", // Custom header to identify the request
          "Content-Type": "application/json",
        },
      })
        .then((response) => response.json())
        .then((data) => {
          const features = Array.isArray(data?.features) ? data.features : [];
          const categoryCounts = {
            Other: 0,
            Advice: 0,
            "Watch and Act": 0,
            "Emergency Warning": 0,
          };

          // Check if the current URL is localhost:3000
          const hostname = window.location.hostname;
          const isDevHost =
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "0.0.0.0" ||
            hostname.endsWith(".githubpreview.dev") ||
            hostname.endsWith(".app.github.dev");
          const isLiveDevHost = hostname.includes("lively-flower-0577f4700-livedev");
          const isTest = isDevHost || isLiveDevHost;

          // Filter features that contain "COUNCIL AREA: Queanbeyan-Palerang" or "COUNCIL AREA: ACT" in the description
          const filteredFeatures = isTest
            ? data.features
            : data.features.filter(
                (feature) =>
                  feature.properties &&
                  feature.properties.description &&
                  (feature.properties.description.includes("COUNCIL AREA: Queanbeyan-Palerang") ||
                    feature.properties.description.includes("COUNCIL AREA: ACT"))
            );

          // Populate the table with filtered features
          populateFireInfoTable({ features: filteredFeatures });

          L.geoJSON(
            { features: filteredFeatures },
            {
              pointToLayer: function (feature, latlng) {
                // Determine the icon based on the warning type
                const icon = getIconForFeature(feature, icons, categoryCounts);
                const marker = L.marker(latlng, { icon: icon });
                markers.addLayer(marker); // Add marker to the feature group
                return marker;
              },

              // Create a nice card for each clicked feature
              onEachFeature: function (feature, layer) {
                if (feature.properties && feature.properties.title) {
                  // Deconstruct the description into key-value pairs
                  const description = feature.properties.description;
                  const {
                    alertLevel,
                    location,
                    councilArea,
                    status,
                    type,
                    fire,
                    size,
                    responsibleAgency,
                    updated,
                  } = extractFields(description);

                  // Define a mapping of alert levels to icon URLs
                  const alertLevelIcons = {
                    "Not Applicable": "/Images/other.png",
                    Advice: "/Images/advice.png",
                    "Watch and Act": "/Images/watch-and-act.png",
                    "Emergency Warning": "/Images/emergency-warning.png",
                  };

                  // Get the icon URL for the alert level
                  const alertIconUrl =
                    alertLevelIcons[alertLevel] || alertLevelIcons["Not Applicable"];

                  // Check if the image exists
                  const img = new Image();
                  img.src = alertIconUrl;
                  img.onerror = function () {
                    console.error(`Image not found: ${alertIconUrl}`);
                    img.src = alertLevelIcons["Not Applicable"]; // Fallback to default icon
                  };

                  // Create a nicely formatted card
                  const cardHTML = `
                    <article class="feature-card compact">
                      <div class="compact-header">
                        <span id="feature-card-header-span">
                          <img src="${alertIconUrl}" alt="${alertLevel}" class="cardIcon"> ${status}
                        </span>
                        <p>${feature.properties.title}</p>
                      </div>
                      <div class="card-content">
                        <p>${location}</p>
                        <div class="three-column-grid">
                          <p>${councilArea}</p>
                          <p>${type}</p>
                          <p>${size}</p>
                        </div>
                      </div>
                      <div>
                        <p class="align-bottom">${responsibleAgency} Updated ${updated}</p>
                      </div>
                    </article>
                  `;
                  // Bind the formatted card to the popup
                  layer.bindPopup(cardHTML);
                }
              },
            }
          ).addTo(map);

          // Create a mini table in the incidentCountCell
          const incidentCountCell = document.getElementById("incidentCountCell");
          const incidentCountLabel = document.getElementById("incidentCountLabel");
          const incidentTotalCount = document.getElementById("incidentTotalCount");
          let tableHTML = "<table>";

          if (categoryCounts["Emergency Warning"] > 0) {
            tableHTML += `
              <tr>
                <td><img src="${icons.emergencyWarning.options.iconUrl}" alt="Emergency Warning" /></td>
                <td>${categoryCounts["Emergency Warning"]}</td>
              </tr>
            `;
          }
          if (categoryCounts["Watch and Act"] > 0) {
            tableHTML += `
              <tr>
                <td><img src="${icons.watchAndAct.options.iconUrl}" alt="Watch and Act" /></td>
                <td>${categoryCounts["Watch and Act"]}</td>
              </tr>
            `;
          }
          if (categoryCounts["Advice"] > 0) {
            tableHTML += `
              <tr>
                <td><img src="${icons.advice.options.iconUrl}" alt="Advice" /></td>
                <td>${categoryCounts["Advice"]}</td>
              </tr>
            `;
          }
          if (categoryCounts["Other"] > 0) {
            tableHTML += `
              <tr>
                <td><img src="${icons.other.options.iconUrl}" alt="Other" /></td>
                <td>${categoryCounts["Other"]}</td>
              </tr>
            `;
          }

          tableHTML += "</table>";

          const totalIncidents = categoryCounts["Emergency Warning"] + categoryCounts["Watch and Act"] +
                                categoryCounts["Advice"] + categoryCounts["Other"];

          if (incidentTotalCount) {
            incidentTotalCount.textContent = `${totalIncidents}`;
          }

          if (incidentCountCell) {
            if (totalIncidents === 0) {
              incidentCountCell.innerHTML = "";
            } else {
              incidentCountCell.innerHTML = DOMPurify.sanitize(tableHTML);
            }
          }

          if (incidentCountLabel) {
            incidentCountLabel.textContent = totalIncidents === 0
              ? "No active incidents in our area"
              : "Current incidents in our area";
          }

          // Update emergency dashboard with incident data
          if (typeof window.updateEmergencyDashboard === 'function') {

            // Build incidents list for mobile view
            const incidentsList = filteredFeatures.slice(0, 5).map(feature => {
              const fields = extractFields(feature.properties.description);
              return {
                title: feature.properties.title || 'Unknown',
                status: fields.status || fields.alertlevel || 'Unknown',
                location: fields.location || 'Unknown location'
              };
            });

            // Get current danger level from the page
            const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
            const fireDangerMessage = document.getElementById("fireDangerMessage");

            if (fireDangerRatingCell && fireDangerMessage) {
              window.updateEmergencyDashboard({
                dangerLevel: fireDangerRatingCell.textContent || 'MODERATE',
                message: fireDangerMessage.textContent || 'Plan and prepare for fires in your area',
                incidentCount: totalIncidents,
                incidents: incidentsList
              });
            }
          }

          // Ensure the station marker is included in the bounds calculation
          const stationIcon = L.icon({
            iconUrl: "/Images/station.png",
            iconSize: [32, 32], // size of the icon
            iconAnchor: [16, 16], // point of the icon which will correspond to marker's location
            popupAnchor: [0, -16], // point from which the popup should open relative to the iconAnchor
            className: "station-icon", // custom class for additional styling
          });

          const stationMarker = L.marker(
            [-35.26165168903826, 149.43974909148088],
            { icon: stationIcon }
          );

          // Get the station card content
          const stationCardContent = document.getElementById("stationCard").innerHTML;

          stationMarker.bindPopup(stationCardContent);

          markers.addLayer(stationMarker); // Add the station marker to the markers layer group

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
        .catch((error) => {
          console.error("Error fetching the GeoJSON data:", error);
          const errorMessage = getUserFriendlyErrorMessage(error);
          const incidentCountCell = document.getElementById("incidentCountCell");
          const incidentCountLabel = document.getElementById("incidentCountLabel");
          const incidentTotalCount = document.getElementById("incidentTotalCount");

          if (incidentTotalCount) {
            incidentTotalCount.textContent = "0";
          }

          if (incidentCountCell) {
            incidentCountCell.innerHTML = DOMPurify.sanitize(`
              <div role="alert" style="color: var(--rfs-error-color, #c33); padding: 1rem;">
                <i class="fas fa-exclamation-triangle"></i> ${errorMessage}
              </div>
            `);
          }

          if (incidentCountLabel) {
            incidentCountLabel.textContent = "No active incidents in our area";
          }

          populateFireInfoTable({ features: [] });

          if (typeof window.updateEmergencyDashboard === "function") {
            const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
            const fireDangerMessage = document.getElementById("fireDangerMessage");
            window.updateEmergencyDashboard({
              dangerLevel: fireDangerRatingCell?.textContent || "NO RATING",
              message: fireDangerMessage?.textContent || "Rating information currently unavailable.",
              incidentCount: 0,
              incidents: []
            });
          }
        });
    })
     .catch((error) => {
       console.error("Error fetching Mapbox token:", error);
       // Display error on map container if available
       const mapContainer = document.getElementById("map");
       if (mapContainer) {
         const errorMessage = getUserFriendlyErrorMessage(error);
         mapContainer.innerHTML = DOMPurify.sanitize(`
           <div role="alert" style="
             display: flex;
             align-items: center;
             justify-content: center;
             height: 100%;
             background-color: var(--rfs-error-bg, #fee);
             border: 2px solid var(--rfs-error-border, #c33);
             color: var(--rfs-error-color, #c33);
             padding: 2rem;
             text-align: center;
           ">
             <div>
               <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
               <p style="font-weight: bold; margin-bottom: 0.5rem;">Unable to Load Map</p>
               <p>${errorMessage}</p>
               <button onclick="location.reload()" style="
                 margin-top: 1rem;
                 padding: 0.5rem 1rem;
                 cursor: pointer;
                 border: 1px solid var(--rfs-error-border, #c33);
                 background-color: white;
                 color: var(--rfs-error-color, #c33);
                 border-radius: 4px;
               ">Retry</button>
             </div>
           </div>
         `);
       }
     });
}

// Ensure the map is initialized after the DOM content is loaded
document.addEventListener("DOMContentLoaded", initMap);

// Helper function to get the appropriate icon for a feature and update category counts
function getIconForFeature(feature, icons, categoryCounts) {
  let icon;
  if (feature.properties.category.includes("Advice")) {
    icon = icons.advice;
    categoryCounts["Advice"]++;
  } else if (feature.properties.category.includes("Watch and Act")) {
    icon = icons.watchAndAct;
    categoryCounts["Watch and Act"]++;
  } else if (feature.properties.category.includes("Emergency Warning")) {
    icon = icons.emergencyWarning;
    categoryCounts["Emergency Warning"]++;
  } else {
    icon = icons.other;
    categoryCounts["Other"]++;
  }
  return icon;
}