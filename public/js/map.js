/* global mapboxgl */

function initMap() {
  fetch(`${getApiBaseUrl()}/api/mapbox-token`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      const accessToken = data?.token;
      if (!accessToken) {
        throw new Error("Mapbox token missing from API response");
      }
      createStandardMap(accessToken);
    })
    .catch((error) => {
      console.error("Error fetching Mapbox token:", error);
      showMapError(error);
    });
}

function createStandardMap(accessToken) {
  mapboxgl.accessToken = accessToken;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/standard",
    center: [149.4431761913284, -35.25870948687002],
    zoom: 10,
    pitch: 55,
    bearing: -12,
    antialias: true,
    attributionControl: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  const updateLightPreset = () => {
    const lightPreset = prefersDark.matches ? "night" : "day";
    if (typeof map.setConfigProperty === "function") {
      map.setConfigProperty("basemap", "lightPreset", lightPreset);
      map.setConfigProperty("basemap", "show3dObjects", true);
      map.setConfigProperty("basemap", "showPlaceLabels", true);
      map.setConfigProperty("basemap", "showPointOfInterestLabels", true);
      map.setConfigProperty("basemap", "showRoadLabels", true);
      map.setConfigProperty("basemap", "showTransitLabels", true);
    }
  };

  map.on("load", () => {
    updateLightPreset();
    loadIncidentData(map);
  });

  prefersDark.addEventListener("change", updateLightPreset);
}

function loadIncidentData(map) {
  const icons = {
    advice: "/Images/advice.png",
    watchAndAct: "/Images/watch-and-act.png",
    emergencyWarning: "/Images/emergency-warning.png",
    other: "/Images/other.png",
    station: "/Images/station.png",
  };

  fetch(`${getApiBaseUrl()}/api/fire-incidents`, {
    method: "GET",
    headers: {
      "X-Request-ID": "Get-Fire-Incidents",
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      const features = Array.isArray(data?.features) ? data.features : [];
      const filteredFeatures = filterFeaturesForEnvironment(features);
      const categoryCounts = {
        Other: 0,
        Advice: 0,
        "Watch and Act": 0,
        "Emergency Warning": 0,
      };

      populateFireInfoTable({ features: filteredFeatures });

      const bounds = new mapboxgl.LngLatBounds();
      const incidentsList = [];

      filteredFeatures.forEach((feature) => {
        const coordinates = getFeatureCoordinates(feature);
        if (!coordinates) {
          return;
        }

        const iconUrl = getIconUrlForFeature(feature, categoryCounts, icons);
        const fields = extractFields(feature.properties?.description || "");
        const alertLevel = fields.alertlevel || "Not Applicable";
        const location = fields.location || "Unknown";
        const councilArea = fields.councilarea || "Unknown";
        const status = fields.status || "Unknown";
        const type = fields.type || "Unknown";
        const size = fields.size || "Unknown";
        const responsibleAgency = fields.responsibleagency || "Unknown";
        const updated = fields.updated || "Unknown";

        const cardHTML = `
          <article class="feature-card compact">
            <div class="compact-header">
              <span id="feature-card-header-span">
                <img src="${iconUrl}" alt="${alertLevel}" class="cardIcon"> ${status}
              </span>
              <p>${feature.properties?.title || "Incident"}</p>
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

        const markerEl = document.createElement("img");
        markerEl.src = iconUrl;
        markerEl.alt = alertLevel;
        markerEl.width = 32;
        markerEl.height = 32;
        markerEl.style.cursor = "pointer";

        new mapboxgl.Marker({ element: markerEl, anchor: "bottom" })
          .setLngLat(coordinates)
          .setPopup(new mapboxgl.Popup({ offset: 24 }).setHTML(DOMPurify.sanitize(cardHTML)))
          .addTo(map);

        bounds.extend(coordinates);

        incidentsList.push({
          title: feature.properties?.title || "Unknown",
          status: status || alertLevel || "Unknown",
          location: location || "Unknown location",
        });
      });

      addStationMarker(map, bounds, icons.station);
      updateIncidentSummary(categoryCounts, icons);
      updateEmergencyWidget(incidentsList, categoryCounts);

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 80,
          maxZoom: 12,
        });
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
          incidents: [],
        });
      }
    });
}

function addStationMarker(map, bounds, stationIconUrl) {
  const stationCoordinates = [149.43974909148088, -35.26165168903826];
  const stationCard = document.getElementById("stationCard");
  const stationCardContent = stationCard ? stationCard.innerHTML : "Bungendore RFS Station";

  const markerEl = document.createElement("img");
  markerEl.src = stationIconUrl;
  markerEl.alt = "Station";
  markerEl.width = 32;
  markerEl.height = 32;
  markerEl.style.cursor = "pointer";

  new mapboxgl.Marker({ element: markerEl, anchor: "bottom" })
    .setLngLat(stationCoordinates)
    .setPopup(new mapboxgl.Popup({ offset: 24 }).setHTML(DOMPurify.sanitize(stationCardContent)))
    .addTo(map);

  bounds.extend(stationCoordinates);
}

function getFeatureCoordinates(feature) {
  if (!feature?.geometry) {
    return null;
  }

  if (feature.geometry.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
    return feature.geometry.coordinates;
  }

  if (feature.geometry.type === "GeometryCollection" && Array.isArray(feature.geometry.geometries)) {
    const pointGeometry = feature.geometry.geometries.find(
      (geometry) => geometry.type === "Point" && Array.isArray(geometry.coordinates)
    );
    return pointGeometry ? pointGeometry.coordinates : null;
  }

  return null;
}

function getIconUrlForFeature(feature, categoryCounts, icons) {
  const category = feature.properties?.category || "";

  if (category.includes("Emergency Warning")) {
    categoryCounts["Emergency Warning"]++;
    return icons.emergencyWarning;
  }

  if (category.includes("Watch and Act")) {
    categoryCounts["Watch and Act"]++;
    return icons.watchAndAct;
  }

  if (category.includes("Advice")) {
    categoryCounts["Advice"]++;
    return icons.advice;
  }

  categoryCounts.Other++;
  return icons.other;
}

function updateIncidentSummary(categoryCounts, icons) {
  const incidentCountCell = document.getElementById("incidentCountCell");
  const incidentCountLabel = document.getElementById("incidentCountLabel");
  const incidentTotalCount = document.getElementById("incidentTotalCount");

  let tableHTML = "<table>";

  if (categoryCounts["Emergency Warning"] > 0) {
    tableHTML += `
      <tr>
        <td><img src="${icons.emergencyWarning}" alt="Emergency Warning" /></td>
        <td>${categoryCounts["Emergency Warning"]}</td>
      </tr>
    `;
  }

  if (categoryCounts["Watch and Act"] > 0) {
    tableHTML += `
      <tr>
        <td><img src="${icons.watchAndAct}" alt="Watch and Act" /></td>
        <td>${categoryCounts["Watch and Act"]}</td>
      </tr>
    `;
  }

  if (categoryCounts.Advice > 0) {
    tableHTML += `
      <tr>
        <td><img src="${icons.advice}" alt="Advice" /></td>
        <td>${categoryCounts.Advice}</td>
      </tr>
    `;
  }

  if (categoryCounts.Other > 0) {
    tableHTML += `
      <tr>
        <td><img src="${icons.other}" alt="Other" /></td>
        <td>${categoryCounts.Other}</td>
      </tr>
    `;
  }

  tableHTML += "</table>";

  const totalIncidents =
    categoryCounts["Emergency Warning"] +
    categoryCounts["Watch and Act"] +
    categoryCounts.Advice +
    categoryCounts.Other;

  if (incidentTotalCount) {
    incidentTotalCount.textContent = `${totalIncidents}`;
  }

  if (incidentCountCell) {
    incidentCountCell.innerHTML = totalIncidents === 0 ? "" : DOMPurify.sanitize(tableHTML);
  }

  if (incidentCountLabel) {
    incidentCountLabel.textContent =
      totalIncidents === 0 ? "No active incidents in our area" : "Current incidents in our area";
  }
}

function updateEmergencyWidget(incidentsList, categoryCounts) {
  if (typeof window.updateEmergencyDashboard !== "function") {
    return;
  }

  const totalIncidents =
    categoryCounts["Emergency Warning"] +
    categoryCounts["Watch and Act"] +
    categoryCounts.Advice +
    categoryCounts.Other;

  const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
  const fireDangerMessage = document.getElementById("fireDangerMessage");

  window.updateEmergencyDashboard({
    dangerLevel: fireDangerRatingCell?.textContent || "MODERATE",
    message: fireDangerMessage?.textContent || "Plan and prepare for fires in your area",
    incidentCount: totalIncidents,
    incidents: incidentsList.slice(0, 5),
  });
}

function filterFeaturesForEnvironment(features) {
  const hostname = window.location.hostname;
  const isDevHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".githubpreview.dev") ||
    hostname.endsWith(".app.github.dev");
  const isLiveDevHost = hostname.includes("lively-flower-0577f4700-livedev");
  const isTest = isDevHost || isLiveDevHost;

  if (isTest) {
    return features;
  }

  return features.filter((feature) => {
    const description = feature.properties?.description || "";
    return (
      description.includes("COUNCIL AREA: Queanbeyan-Palerang") ||
      description.includes("COUNCIL AREA: ACT")
    );
  });
}

function showMapError(error) {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    return;
  }

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

document.addEventListener("DOMContentLoaded", initMap);
