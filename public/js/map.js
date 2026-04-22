/* global mapboxgl */

// ─── Icon URLs ────────────────────────────────────────────────────────────────
const ICONS = {
  advice: "/Images/advice.png",
  watchAndAct: "/Images/watch-and-act.png",
  emergencyWarning: "/Images/emergency-warning.png",
  other: "/Images/other.png",
  station: "/Images/station.png",
};

// ─── Category helpers ─────────────────────────────────────────────────────────
function getCategoryKey(category) {
  if (category.includes("Emergency Warning")) return "emergencyWarning";
  if (category.includes("Watch and Act")) return "watchAndAct";
  if (category.includes("Advice")) return "advice";
  return "other";
}

function getCategoryClass(category) {
  return getCategoryKey(category).replace(/([A-Z])/g, (m) => "-" + m.toLowerCase());
}

/** Area fill colour per alert level for polygon overlays */
const AREA_FILL_COLOUR = {
  emergencyWarning: "#d7261e",
  watchAndAct: "#f5a623",
  advice: "#215e9e",
  other: "#5f6368",
};

// ─── Marker element builders ──────────────────────────────────────────────────
/**
 * Custom Mapbox marker using the existing Australian Warning System PNG triangle.
 * The wrapper div resets all Mapbox default marker styles so only the image shows.
 */
function createMarkerElement(iconUrl, altText, category) {
  const wrapper = document.createElement("div");
  wrapper.className = "aws-marker aws-marker--" + getCategoryClass(category);
  wrapper.setAttribute("role", "button");
  wrapper.setAttribute("tabindex", "0");
  wrapper.setAttribute("aria-label", altText);

  const img = document.createElement("img");
  img.src = iconUrl;
  img.alt = altText;
  img.draggable = false;
  img.className = "aws-marker__img";

  wrapper.appendChild(img);
  return wrapper;
}

function createStationMarkerElement() {
  const wrapper = document.createElement("div");
  wrapper.className = "aws-marker aws-marker--station";
  wrapper.setAttribute("role", "button");
  wrapper.setAttribute("tabindex", "0");
  wrapper.setAttribute("aria-label", "Bungendore RFS Station");

  const img = document.createElement("img");
  img.src = ICONS.station;
  img.alt = "Bungendore RFS Station";
  img.draggable = false;
  img.className = "aws-marker__img aws-marker__img--station";

  wrapper.appendChild(img);
  return wrapper;
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function showDetailPanel(html) {
  const panel = document.getElementById("mapDetailPanel");
  const layout = document.querySelector(".map-layout");
  if (panel) {
    panel.innerHTML = DOMPurify.sanitize(html);
    panel.removeAttribute("hidden");
  }
  if (layout) layout.classList.add("panel-visible");
}

function clearDetailPanel() {
  const panel = document.getElementById("mapDetailPanel");
  const layout = document.querySelector(".map-layout");
  if (panel) {
    panel.innerHTML = "";
    panel.setAttribute("hidden", "");
  }
  if (layout) layout.classList.remove("panel-visible");
}

function buildIncidentDetailHTML(title, category, fields) {
  const alertLevel = fields.alertlevel || "Not Applicable";
  const location = fields.location || "Unknown";
  const councilArea = fields.councilarea || "Unknown";
  const status = fields.status || "Unknown";
  const type = fields.type || "Unknown";
  const size = fields.size || "Unknown";
  const agency = fields.responsibleagency || "Unknown";
  const updated = fields.updated || "Unknown";
  const iconUrl = ICONS[getCategoryKey(category)] || ICONS.other;
  const badgeClass = getCategoryClass(category);

  return (
    "<div class=\"map-detail-header\">" +
    "<img src=\"" + iconUrl + "\" alt=\"" + alertLevel + "\" class=\"map-detail-icon\" />" +
    "<div><p class=\"map-detail-title\">" + title + "</p>" +
    "<span class=\"map-detail-badge " + badgeClass + "\">" + alertLevel + "</span></div>" +
    "</div>" +
    "<dl class=\"map-detail-dl\">" +
    "<div class=\"detail-row\"><dt class=\"detail-label\">Status</dt><dd>" + status + "</dd></div>" +
    "<div class=\"detail-row\"><dt class=\"detail-label\">Location</dt><dd>" + location + "</dd></div>" +
    "<div class=\"detail-row\"><dt class=\"detail-label\">Council</dt><dd>" + councilArea + "</dd></div>" +
    "<div class=\"detail-row\"><dt class=\"detail-label\">Type</dt><dd>" + type + "</dd></div>" +
    "<div class=\"detail-row\"><dt class=\"detail-label\">Size</dt><dd>" + size + "</dd></div>" +
    "<div class=\"detail-row\"><dt class=\"detail-label\">Agency</dt><dd>" + agency + "</dd></div>" +
    "<div class=\"detail-row\"><dt class=\"detail-label\">Updated</dt><dd>" + updated + "</dd></div>" +
    "</dl>"
  );
}

function buildStationDetailHTML() {
  const stationCard = document.getElementById("stationCard");
  const raw = stationCard ? stationCard.innerHTML : "<p>Bungendore RFS Station</p>";
  return (
    "<div class=\"map-detail-header\">" +
    "<img src=\"" + ICONS.station + "\" alt=\"Station\" class=\"map-detail-icon\" />" +
    "<p class=\"map-detail-title\">Bungendore RFS Station</p></div>" +
    "<div class=\"map-detail-station-body\">" + raw + "</div>"
  );
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function getFeatureCoordinates(feature) {
  if (!feature || !feature.geometry) return null;

  if (feature.geometry.type === "Point") {
    return feature.geometry.coordinates;
  }

  if (feature.geometry.type === "GeometryCollection") {
    const pt = feature.geometry.geometries.find(function(g) {
      return g.type === "Point" && Array.isArray(g.coordinates);
    });
    return pt ? pt.coordinates : null;
  }

  return null;
}

function getNonPointGeometries(feature) {
  if (!feature || !feature.geometry) return [];

  if (feature.geometry.type === "GeometryCollection") {
    return feature.geometry.geometries.filter(function(g) { return g.type !== "Point"; });
  }

  if (feature.geometry.type !== "Point") {
    return [feature.geometry];
  }

  return [];
}

// ─── Area/polygon layers ──────────────────────────────────────────────────────

function addIncidentAreaLayers(map, areaFeatureCollection) {
  if (map.getSource("incident-areas")) {
    map.getSource("incident-areas").setData(areaFeatureCollection);
    return;
  }

  map.addSource("incident-areas", { type: "geojson", data: areaFeatureCollection });

  map.addLayer({
    id: "incident-areas-fill",
    type: "fill",
    source: "incident-areas",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": [
        "match", ["get", "categoryKey"],
        "emergencyWarning", AREA_FILL_COLOUR.emergencyWarning,
        "watchAndAct", AREA_FILL_COLOUR.watchAndAct,
        "advice", AREA_FILL_COLOUR.advice,
        AREA_FILL_COLOUR.other,
      ],
      "fill-opacity": 0.22,
    },
  });

  map.addLayer({
    id: "incident-areas-outline",
    type: "line",
    source: "incident-areas",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "line-color": [
        "match", ["get", "categoryKey"],
        "emergencyWarning", AREA_FILL_COLOUR.emergencyWarning,
        "watchAndAct", AREA_FILL_COLOUR.watchAndAct,
        "advice", AREA_FILL_COLOUR.advice,
        AREA_FILL_COLOUR.other,
      ],
      "line-width": 2,
      "line-opacity": 0.75,
    },
  });

  map.addLayer({
    id: "incident-areas-line",
    type: "line",
    source: "incident-areas",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": [
        "match", ["get", "categoryKey"],
        "emergencyWarning", AREA_FILL_COLOUR.emergencyWarning,
        "watchAndAct", AREA_FILL_COLOUR.watchAndAct,
        "advice", AREA_FILL_COLOUR.advice,
        AREA_FILL_COLOUR.other,
      ],
      "line-width": 2.5,
      "line-dasharray": [3, 2],
    },
  });

  map.on("click", "incident-areas-fill", function(e) {
    const props = (e.features[0] && e.features[0].properties) || {};
    const fields = extractFields(props.description || "");
    showDetailPanel(buildIncidentDetailHTML(props.title || "Incident", props.category || "", fields));
  });

  map.on("mouseenter", "incident-areas-fill", function() { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "incident-areas-fill", function() { map.getCanvas().style.cursor = ""; });
}

// ─── Icon selection ───────────────────────────────────────────────────────────

function getIconUrlForFeature(feature, categoryCounts) {
  const category = (feature.properties && feature.properties.category) || "";

  if (category.includes("Emergency Warning")) {
    categoryCounts["Emergency Warning"]++;
    return ICONS.emergencyWarning;
  }
  if (category.includes("Watch and Act")) {
    categoryCounts["Watch and Act"]++;
    return ICONS.watchAndAct;
  }
  if (category.includes("Advice")) {
    categoryCounts.Advice++;
    return ICONS.advice;
  }

  categoryCounts.Other++;
  return ICONS.other;
}

// ─── Incident loading ─────────────────────────────────────────────────────────

function loadIncidentData(map) {
  fetch(getApiBaseUrl() + "/api/fire-incidents", {
    method: "GET",
    headers: {
      "X-Request-ID": "Get-Fire-Incidents",
      "Content-Type": "application/json",
    },
  })
    .then(function(response) {
      if (!response.ok) throw new Error("HTTP error! status: " + response.status);
      return response.json();
    })
    .then(function(data) {
      const features = Array.isArray(data && data.features) ? data.features : [];
      const filteredFeatures = filterFeaturesForEnvironment(features);
      const categoryCounts = { Other: 0, Advice: 0, "Watch and Act": 0, "Emergency Warning": 0 };

      populateFireInfoTable({ features: filteredFeatures });

      const bounds = new mapboxgl.LngLatBounds();
      const incidentsList = [];
      const areaFeatures = [];

      filteredFeatures.forEach(function(feature) {
        const category = (feature.properties && feature.properties.category) || "";
        const iconUrl = getIconUrlForFeature(feature, categoryCounts);
        const fields = extractFields((feature.properties && feature.properties.description) || "");
        const title = (feature.properties && feature.properties.title) || "Incident";
        const alertLevel = fields.alertlevel || "Not Applicable";
        const categoryKey = getCategoryKey(category);

        // Collect non-point geometries for area rendering
        getNonPointGeometries(feature).forEach(function(geom) {
          areaFeatures.push({
            type: "Feature",
            geometry: geom,
            properties: {
              category: category,
              categoryKey: categoryKey,
              title: title,
              description: (feature.properties && feature.properties.description) || "",
            },
          });
        });

        // Point marker
        const coordinates = getFeatureCoordinates(feature);
        if (coordinates) {
          const markerEl = createMarkerElement(iconUrl, alertLevel, category);

          (function(t, c, f) {
            markerEl.addEventListener("click", function() {
              showDetailPanel(buildIncidentDetailHTML(t, c, f));
            });
            markerEl.addEventListener("keydown", function(e) {
              if (e.key === "Enter" || e.key === " ") {
                showDetailPanel(buildIncidentDetailHTML(t, c, f));
              }
            });
          })(title, category, fields);

          new mapboxgl.Marker({ element: markerEl, anchor: "bottom" })
            .setLngLat(coordinates)
            .addTo(map);

          bounds.extend(coordinates);
        }

        incidentsList.push({
          title: title,
          status: fields.status || alertLevel || "Unknown",
          location: fields.location || "Unknown location",
        });
      });

      if (areaFeatures.length > 0) {
        addIncidentAreaLayers(map, { type: "FeatureCollection", features: areaFeatures });
      }

      addStationMarker(map, bounds);
      updateIncidentSummary(categoryCounts);
      updateEmergencyWidget(incidentsList, categoryCounts);

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 12 });
      }
    })
    .catch(function(error) {
      console.error("Error fetching the GeoJSON data:", error);
      const errorMessage = getUserFriendlyErrorMessage(error);
      const incidentCountCell = document.getElementById("incidentCountCell");
      const incidentCountLabel = document.getElementById("incidentCountLabel");
      const incidentTotalCount = document.getElementById("incidentTotalCount");

      if (incidentTotalCount) incidentTotalCount.textContent = "0";

      if (incidentCountCell) {
        incidentCountCell.innerHTML = DOMPurify.sanitize(
          "<div role=\"alert\" style=\"color:var(--rfs-error-color,#c33);padding:1rem;\">" +
          "<i class=\"fas fa-exclamation-triangle\"></i> " + errorMessage + "</div>"
        );
      }

      if (incidentCountLabel) incidentCountLabel.textContent = "No active incidents in our area";

      populateFireInfoTable({ features: [] });

      if (typeof window.updateEmergencyDashboard === "function") {
        const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
        const fireDangerMessage = document.getElementById("fireDangerMessage");
        window.updateEmergencyDashboard({
          dangerLevel: (fireDangerRatingCell && fireDangerRatingCell.textContent) || "NO RATING",
          message: (fireDangerMessage && fireDangerMessage.textContent) || "Rating information currently unavailable.",
          incidentCount: 0,
          incidents: [],
        });
      }
    });
}

// ─── Station marker ───────────────────────────────────────────────────────────

function addStationMarker(map, bounds) {
  const stationCoordinates = [149.43974909148088, -35.26165168903826];
  const markerEl = createStationMarkerElement();

  markerEl.addEventListener("click", function() {
    showDetailPanel(buildStationDetailHTML());
  });

  markerEl.addEventListener("keydown", function(e) {
    if (e.key === "Enter" || e.key === " ") {
      showDetailPanel(buildStationDetailHTML());
    }
  });

  new mapboxgl.Marker({ element: markerEl, anchor: "bottom" })
    .setLngLat(stationCoordinates)
    .addTo(map);

  bounds.extend(stationCoordinates);
}

// ─── Incident summary widget ──────────────────────────────────────────────────

function updateIncidentSummary(categoryCounts) {
  const incidentCountCell = document.getElementById("incidentCountCell");
  const incidentCountLabel = document.getElementById("incidentCountLabel");
  const incidentTotalCount = document.getElementById("incidentTotalCount");

  const total =
    categoryCounts["Emergency Warning"] +
    categoryCounts["Watch and Act"] +
    categoryCounts.Advice +
    categoryCounts.Other;

  if (incidentTotalCount) incidentTotalCount.textContent = String(total);

  const rows = [
    ["Emergency Warning", ICONS.emergencyWarning],
    ["Watch and Act", ICONS.watchAndAct],
    ["Advice", ICONS.advice],
    ["Other", ICONS.other],
  ]
    .filter(function(pair) { return categoryCounts[pair[0]] > 0; })
    .map(function(pair) {
      return "<tr><td><img src=\"" + pair[1] + "\" alt=\"" + pair[0] + "\" /></td><td>" + categoryCounts[pair[0]] + "</td></tr>";
    })
    .join("");

  if (incidentCountCell) {
    incidentCountCell.innerHTML = total === 0 ? "" : DOMPurify.sanitize("<table>" + rows + "</table>");
  }

  if (incidentCountLabel) {
    incidentCountLabel.textContent =
      total === 0 ? "No active incidents in our area" : "Current incidents in our area";
  }
}

function updateEmergencyWidget(incidentsList, categoryCounts) {
  if (typeof window.updateEmergencyDashboard !== "function") return;

  const total =
    categoryCounts["Emergency Warning"] +
    categoryCounts["Watch and Act"] +
    categoryCounts.Advice +
    categoryCounts.Other;

  const fireDangerRatingCell = document.getElementById("fireDangerRatingCell");
  const fireDangerMessage = document.getElementById("fireDangerMessage");

  window.updateEmergencyDashboard({
    dangerLevel: (fireDangerRatingCell && fireDangerRatingCell.textContent) || "MODERATE",
    message: (fireDangerMessage && fireDangerMessage.textContent) || "Plan and prepare for fires in your area",
    incidentCount: total,
    incidents: incidentsList.slice(0, 5),
  });
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function filterFeaturesForEnvironment(features) {
  const hostname = window.location.hostname;
  const isTest =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".githubpreview.dev") ||
    hostname.endsWith(".app.github.dev") ||
    hostname.includes("lively-flower-0577f4700-livedev");

  if (isTest) return features;

  return features.filter(function(feature) {
    const desc = (feature.properties && feature.properties.description) || "";
    return desc.includes("COUNCIL AREA: Queanbeyan-Palerang") || desc.includes("COUNCIL AREA: ACT");
  });
}

// ─── Error display ────────────────────────────────────────────────────────────

function showMapError(error) {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;

  const errorMessage = getUserFriendlyErrorMessage(error);
  mapContainer.innerHTML = DOMPurify.sanitize(
    "<div role=\"alert\" style=\"" +
    "display:flex;align-items:center;justify-content:center;height:100%;" +
    "background-color:var(--rfs-error-bg,#fee);" +
    "border:2px solid var(--rfs-error-border,#c33);" +
    "color:var(--rfs-error-color,#c33);padding:2rem;text-align:center;\">" +
    "<div>" +
    "<i class=\"fas fa-exclamation-triangle\" style=\"font-size:2rem;margin-bottom:1rem;\"></i>" +
    "<p style=\"font-weight:bold;margin-bottom:0.5rem;\">Unable to Load Map</p>" +
    "<p>" + errorMessage + "</p>" +
    "<button onclick=\"location.reload()\" style=\"margin-top:1rem;padding:0.5rem 1rem;" +
    "cursor:pointer;border:1px solid var(--rfs-error-border,#c33);" +
    "background-color:white;color:var(--rfs-error-color,#c33);border-radius:4px;\">Retry</button>" +
    "</div></div>"
  );
}

// ─── Lighting preset (time-of-day + site theme) ───────────────────────────────

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
  let currentLightPreset = "";

  const getTimeOfDayPreset = function() {
    const hour = new Date().getHours();
    if (hour < 5) return "night";
    if (hour < 7) return "dawn";
    if (hour < 17) return "day";
    if (hour < 19) return "dusk";
    return "night";
  };

  const resolveStyledLightPreset = function() {
    const timePreset = getTimeOfDayPreset();
    if (!prefersDark.matches) return timePreset;
    return timePreset === "day" ? "dusk" : timePreset;
  };

  const updateLightPreset = function() {
    const lightPreset = resolveStyledLightPreset();
    if (lightPreset === currentLightPreset) return;
    if (typeof map.setConfigProperty === "function") {
      map.setConfigProperty("basemap", "lightPreset", lightPreset);
      map.setConfigProperty("basemap", "show3dObjects", true);
      map.setConfigProperty("basemap", "showPlaceLabels", true);
      map.setConfigProperty("basemap", "showPointOfInterestLabels", true);
      map.setConfigProperty("basemap", "showRoadLabels", true);
      map.setConfigProperty("basemap", "showTransitLabels", true);
      currentLightPreset = lightPreset;
    }
  };

  map.on("load", function() {
    updateLightPreset();
    loadIncidentData(map);
    window.setInterval(updateLightPreset, 5 * 60 * 1000);
  });

  // Clicking empty map area clears the detail panel
  map.on("click", function(e) {
    if (!e.originalEvent.defaultPrevented) {
      clearDetailPanel();
    }
  });

  if (typeof prefersDark.addEventListener === "function") {
    prefersDark.addEventListener("change", updateLightPreset);
  } else if (typeof prefersDark.addListener === "function") {
    prefersDark.addListener(updateLightPreset);
  }

  // ── Fullscreen toggle ────────────────────────────────────────────────────
  const expandBtn = document.getElementById("mapExpandBtn");
  const mapContainerEl = document.getElementById("fireInfoMapContainer");

  function updateExpandBtnState(isExpanded) {
    expandBtn.setAttribute("aria-expanded", String(isExpanded));
    const icon = expandBtn.querySelector("i");
    const label = expandBtn.querySelector("span");
    if (icon) icon.className = isExpanded ? "fas fa-compress" : "fas fa-expand";
    if (label) label.textContent = isExpanded ? "Close" : "Expand";
  }

  if (expandBtn && mapContainerEl) {
    // Prefer native Fullscreen API – escapes any transform/overflow ancestor
    const canFullscreen =
      typeof mapContainerEl.requestFullscreen === "function" ||
      typeof mapContainerEl.webkitRequestFullscreen === "function" ||
      typeof mapContainerEl.mozRequestFullScreen === "function" ||
      typeof mapContainerEl.msRequestFullscreen === "function";

    const enterFullscreen = function() {
      if (mapContainerEl.requestFullscreen) return mapContainerEl.requestFullscreen();
      if (mapContainerEl.webkitRequestFullscreen) return mapContainerEl.webkitRequestFullscreen();
      if (mapContainerEl.mozRequestFullScreen) return mapContainerEl.mozRequestFullScreen();
      if (mapContainerEl.msRequestFullscreen) return mapContainerEl.msRequestFullscreen();
    };

    const exitFullscreen = function() {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
      if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
      if (document.msExitFullscreen) return document.msExitFullscreen();
    };

    const getFullscreenElement = function() {
      return document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        null;
    };

    // Listen to native fullscreenchange to keep button in sync
    ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach(function(evName) {
      document.addEventListener(evName, function() {
        const isExpanded = getFullscreenElement() === mapContainerEl ||
          mapContainerEl.classList.contains("map-expanded");
        updateExpandBtnState(isExpanded);
      });
    });

    // ResizeObserver fires when the map canvas container actually changes size,
    // which is the correct moment to call map.resize() (after CSS transitions complete).
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(function() {
        map.resize();
      });
      ro.observe(map.getContainer());
    }

    expandBtn.addEventListener("click", function() {
      if (canFullscreen) {
        if (!getFullscreenElement()) {
          enterFullscreen();
        } else {
          exitFullscreen();
        }
      } else {
        // CSS-class fallback
        const isExpanded = mapContainerEl.classList.toggle("map-expanded");
        document.body.classList.toggle("map-fullscreen-active", isExpanded);
        updateExpandBtnState(isExpanded);
      }
    });
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function initMap() {
  fetch(getApiBaseUrl() + "/api/mapbox-token")
    .then(function(response) {
      if (!response.ok) throw new Error("HTTP error! status: " + response.status);
      return response.json();
    })
    .then(function(data) {
      if (!data || !data.token) throw new Error("Mapbox token missing from API response");
      createStandardMap(data.token);
    })
    .catch(function(error) {
      console.error("Error fetching Mapbox token:", error);
      showMapError(error);
    });
}

document.addEventListener("DOMContentLoaded", initMap);
