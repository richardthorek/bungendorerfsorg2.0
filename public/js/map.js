/* global mapboxgl */

// ─── Icon URLs ────────────────────────────────────────────────────────────────
const ICONS = {
  advice: "/Images/advice.png",
  watchAndAct: "/Images/watch-and-act.png",
  emergencyWarning: "/Images/emergency-warning.png",
  other: "/Images/other.png",
  station: "/Images/station.png",
};

// ─── Map constants ────────────────────────────────────────────────────────────
const DEFAULT_MAP_CENTER = [149.4431761913284, -35.25870948687002];
// fitBounds padding for the hero map: left is computed dynamically (45% of the
// container width) to align with the CSS max-width on the hgroup, so incident
// markers are positioned in the right portion of the viewport.  The other sides
// use a fixed small offset.
const HERO_MAP_PADDING_SIDE = 40;
const HERO_MAP_MAX_ZOOM = 12;

/**
 * Build the asymmetric padding object for hero-map fitBounds.
 * Left padding covers 45% of the container width so markers land in the
 * right portion of the viewport, clear of the title panel.
 */
function heroMapFitPadding() {
  const el = document.getElementById("heroMap");
  // Fallback 200px ≈ 45% of a minimal 450px hero width; used only if the element
  // is unexpectedly absent from the DOM.
  const leftPad = el ? Math.round(el.clientWidth * 0.45) : 200;
  return { top: HERO_MAP_PADDING_SIDE, bottom: HERO_MAP_PADDING_SIDE, left: leftPad, right: HERO_MAP_PADDING_SIDE };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Resolve the Mapbox light preset based on time-of-day and the OS dark-mode preference.
 * @returns {"day"|"dusk"|"dawn"|"night"}
 */
function calculateLightPreset() {
  const hour = new Date().getHours();
  let preset;
  if (hour < 5) preset = "night";
  else if (hour < 7) preset = "dawn";
  else if (hour < 17) preset = "day";
  else if (hour < 19) preset = "dusk";
  else preset = "night";

  if (window.matchMedia("(prefers-color-scheme: dark)").matches && preset === "day") {
    preset = "dusk";
  }
  return preset;
}

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

// ─── Hero state management (Phase 2) ─────────────────────────────────────────

/** Stores the Mapbox token so the hero map can be initialised lazily */
let _heroMapToken = null;
/** Tracks whether the hero map instance has been created */
let _heroMapInitialised = false;

/**
 * Add incident and station markers to a hero map instance.
 * Called after the hero map's "load" event fires so the canvas is ready.
 * @param {mapboxgl.Map} heroMap - The hero map instance.
 * @param {Array<{coordinates: number[], iconUrl: string, alertLevel: string, category: string}>} markerData
 */
function addMarkersToHeroMap(heroMap, markerData) {
  if (!heroMap || !Array.isArray(markerData)) return;

  markerData.forEach(function(data) {
    if (!data.coordinates) return;
    const markerEl = createMarkerElement(data.iconUrl, data.alertLevel, data.category);
    new mapboxgl.Marker({ element: markerEl, anchor: "bottom" })
      .setLngLat(data.coordinates)
      .addTo(heroMap);
  });

  // Always show the station marker on the hero map
  const stationEl = createStationMarkerElement();
  new mapboxgl.Marker({ element: stationEl, anchor: "bottom" })
    .setLngLat([149.43974909148088, -35.26165168903826])
    .addTo(heroMap);
}

/**
 * Activate the Fire Information tab and scroll it into view.
 * Used when the user clicks anywhere on the hero map so they are taken
 * directly to the detailed incident information below the fold.
 */
function scrollToFireInfo() {
  const btn = document.querySelector("[data-tab=\"fire-info\"]");
  if (btn) btn.click();
}

/**
 * Add incident geometry layers (polygon fill, outline, line) to the hero map.
 * Mirrors addIncidentAreaLayers but uses hero-specific source/layer IDs so there
 * is no collision with the main Fire Info map, and omits the detail-panel click
 * handler (hero clicks are handled at the container level via scrollToFireInfo).
 *
 * @param {mapboxgl.Map} heroMap
 * @param {GeoJSON.FeatureCollection} areaFeatureCollection
 */
function addHeroAreaLayers(heroMap, areaFeatureCollection) {
  if (!heroMap || !areaFeatureCollection) return;

  if (heroMap.getSource("hero-incident-areas")) {
    heroMap.getSource("hero-incident-areas").setData(areaFeatureCollection);
    return;
  }

  heroMap.addSource("hero-incident-areas", { type: "geojson", data: areaFeatureCollection });

  heroMap.addLayer({
    id: "hero-areas-fill",
    type: "fill",
    source: "hero-incident-areas",
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

  heroMap.addLayer({
    id: "hero-areas-outline",
    type: "line",
    source: "hero-incident-areas",
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

  heroMap.addLayer({
    id: "hero-areas-line",
    type: "line",
    source: "hero-incident-areas",
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
}

/**
 * Toggle the hero between calm (photo) and incident-active (map-led) states.
 *
 * When there are active incidents and the hero map hasn't been initialised yet,
 * the incident count is pre-set in the DOM but the `hero--incident` class is
 * NOT added here — it is deferred to the heroMap `load` event so the CSS
 * transition (map fade-in + hgroup narrowing) only fires once the tiles are
 * actually rendered, producing a smooth crossfade over the background photo.
 *
 * @param {number} total - Total number of active incidents.
 * @param {mapboxgl.LngLatBounds} [bounds] - Bounds of active incidents (used to fit the hero map).
 * @param {Array} [markerData] - Marker data to render on the hero map.
 * @param {GeoJSON.FeatureCollection} [areaFeatureCollection] - Incident geometry for the hero map.
 */
function updateHeroState(total, bounds, markerData, areaFeatureCollection) {
  const hero = document.getElementById("heroSection");
  const heroIncidentPanel = document.getElementById("heroIncidentCountPanel");
  const heroIncidentCount = document.getElementById("heroIncidentCount");

  if (!hero) return;

  if (total > 0) {
    // Pre-populate the count text so it is ready when the transition fires
    if (heroIncidentCount) heroIncidentCount.textContent = total;

    // Initialise the hero map on first incident load.
    // The hero--incident class (and panel reveal) is deferred to the map load
    // event so the transition fires only once tiles are ready.
    if (!_heroMapInitialised && _heroMapToken) {
      _heroMapInitialised = true;
      initHeroMap(_heroMapToken, bounds, markerData || [], areaFeatureCollection, hero, heroIncidentPanel);
    } else if (_heroMapInitialised) {
      // Map already loaded — apply class immediately and fit to new bounds
      hero.classList.add("hero--incident");
      if (heroIncidentPanel) heroIncidentPanel.removeAttribute("hidden");
      const existingHeroMap = window._heroMapInstance;
      if (existingHeroMap && bounds && !bounds.isEmpty()) {
        existingHeroMap.fitBounds(bounds, { padding: heroMapFitPadding(), maxZoom: HERO_MAP_MAX_ZOOM });
      }
      if (existingHeroMap && areaFeatureCollection) {
        addHeroAreaLayers(existingHeroMap, areaFeatureCollection);
      }
    }
  } else {
    hero.classList.remove("hero--incident");
    if (heroIncidentPanel) heroIncidentPanel.setAttribute("hidden", "");
  }
}

/**
 * Create a lightweight Mapbox GL map in #heroMap that mirrors the incident view.
 * Once the map tiles are loaded and markers placed, `hero--incident` is added to
 * the hero element to trigger the CSS crossfade transition (map opacity 0→1 and
 * hgroup max-width narrowing) so the change is smooth rather than abrupt.
 *
 * @param {string} token - Mapbox access token.
 * @param {mapboxgl.LngLatBounds} [bounds] - Incident bounds to fit on load.
 * @param {Array} [markerData] - Marker data to render on the hero map.
 * @param {HTMLElement} [heroEl] - The hero section element.
 * @param {HTMLElement} [heroIncidentPanel] - The incident count panel element.
 */
function initHeroMap(token, bounds, markerData, areaFeatureCollection, heroEl, heroIncidentPanel) {
  const heroMapEl = document.getElementById("heroMap");
  if (!heroMapEl) return;

  mapboxgl.accessToken = token;

  const heroMap = new mapboxgl.Map({
    container: "heroMap",
    style: "mapbox://styles/mapbox/standard",
    center: DEFAULT_MAP_CENTER,
    zoom: 10,
    interactive: false, /* decorative surface; full interaction is in the Fire Info map */
    attributionControl: false,
  });

  window._heroMapInstance = heroMap;

  // Clicking anywhere on the hero map (marker or canvas) navigates to the
  // Fire Information tab so the user can see incident detail below the fold.
  // The container element always receives DOM click events even when the map
  // is initialised with interactive: false.
  heroMapEl.addEventListener("click", scrollToFireInfo);

  heroMap.on("load", function() {
    const preset = calculateLightPreset();
    if (typeof heroMap.setConfigProperty === "function") {
      heroMap.setConfigProperty("basemap", "lightPreset", preset);
      heroMap.setConfigProperty("basemap", "show3dObjects", false);
    }

    addMarkersToHeroMap(heroMap, markerData || []);

    // Render incident geometry (polygon fills/outlines, line strings) so the
    // hero map mirrors the extent overlays visible on the main Fire Info map.
    if (areaFeatureCollection) {
      addHeroAreaLayers(heroMap, areaFeatureCollection);
    }

    // Ensure the Mapbox canvas is sized to match the container.
    // This is necessary in case the canvas was created before the browser had
    // fully laid out the container (e.g. during a hidden/opacity-0 init).
    heroMap.resize();

    if (bounds && !bounds.isEmpty()) {
      heroMap.fitBounds(bounds, { padding: heroMapFitPadding(), maxZoom: HERO_MAP_MAX_ZOOM });
    }

    // Trigger the CSS transition now that tiles + markers are ready.
    // The map fades in over the background photo; the hgroup narrows smoothly.
    if (heroEl) heroEl.classList.add("hero--incident");
    if (heroIncidentPanel) heroIncidentPanel.removeAttribute("hidden");

    // After the opacity transition completes (0.9 s), resize again to correct
    // any pixel-density mismatch that occurred while the canvas was at opacity:0.
    // Also re-fit bounds so markers are correctly positioned in the final viewport.
    setTimeout(function() {
      heroMap.resize();
      if (bounds && !bounds.isEmpty()) {
        heroMap.fitBounds(bounds, { padding: heroMapFitPadding(), maxZoom: HERO_MAP_MAX_ZOOM, animate: false });
      }
    }, 1000);

    // ResizeObserver keeps the canvas correctly sized whenever the hero container
    // changes dimensions (e.g. window resize), matching the pattern used for the
    // main fire-info map.
    if (typeof ResizeObserver !== "undefined") {
      const heroRo = new ResizeObserver(function() {
        heroMap.resize();
      });
      heroRo.observe(heroMapEl);
    }
  });
}

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
      const markerDataList = [];

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

          // Collect data so the hero map can render the same markers
          markerDataList.push({ coordinates: coordinates, iconUrl: iconUrl, alertLevel: alertLevel, category: category });
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

      const total =
        categoryCounts["Emergency Warning"] +
        categoryCounts["Watch and Act"] +
        categoryCounts.Advice +
        categoryCounts.Other;
      const heroAreaCollection = areaFeatures.length > 0
        ? { type: "FeatureCollection", features: areaFeatures }
        : null;
      updateHeroState(total, bounds, markerDataList, heroAreaCollection);

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
  /* Store token so the hero map can be initialised once incidents are known */
  _heroMapToken = accessToken;

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/standard",
    center: DEFAULT_MAP_CENTER,
    zoom: 10,
    pitch: 55,
    bearing: -12,
    antialias: true,
    attributionControl: true,
  });

  map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  let currentLightPreset = "";

  const updateLightPreset = function() {
    const lightPreset = calculateLightPreset();
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

// ─── Dynamic Mapbox GL loader ─────────────────────────────────────────────────

/**
 * Dynamically load the Mapbox GL JS bundle and its companion CSS.
 * Resolves when the script is ready; rejects on network error.
 * Safe to call multiple times – subsequent calls resolve immediately.
 */
let _mapboxLoadPromise = null;

function loadMapbox() {
  if (_mapboxLoadPromise) return _mapboxLoadPromise;
  _mapboxLoadPromise = new Promise(function(resolve, reject) {
    const MAPBOX_VERSION = "v3.9.4";
    const MAPBOX_BASE    = "https://api.mapbox.com/mapbox-gl-js/" + MAPBOX_VERSION;

    // Inject CSS
    const link = document.createElement("link");
    link.rel  = "stylesheet";
    link.href = MAPBOX_BASE + "/mapbox-gl.css";
    document.head.appendChild(link);

    // Inject JS
    const script = document.createElement("script");
    script.src     = MAPBOX_BASE + "/mapbox-gl.js";
    script.onload  = resolve;
    script.onerror = function() {
      reject(new Error("Failed to load Mapbox GL JS"));
    };
    document.head.appendChild(script);
  });
  return _mapboxLoadPromise;
}

/**
 * Bootstrap: use IntersectionObserver to kick off the Mapbox load + map init
 * as soon as the map container (or the hero) enters the viewport.
 * Falls back to immediate load on browsers without IntersectionObserver.
 */
document.addEventListener("DOMContentLoaded", function() {
  const mapContainer  = document.getElementById("fireInfoMapContainer");
  const heroSection   = document.getElementById("heroSection");
  let initiated       = false;

  function start() {
    if (initiated) return;
    initiated = true;
    loadMapbox()
      .then(initMap)
      .catch(function(err) {
        console.error("Mapbox GL load failed:", err);
        showMapError(err);
      });
  }

  if (!("IntersectionObserver" in window)) {
    // Fallback for older browsers
    start();
    return;
  }

  // Use a generous root margin so the library starts loading before
  // the map section is fully scrolled into view.
  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        start();
        observer.disconnect();
      }
    });
  }, { rootMargin: "300px" });

  if (mapContainer) observer.observe(mapContainer);
  if (heroSection)  observer.observe(heroSection);

  // Safety: if neither element found, load immediately
  if (!mapContainer && !heroSection) start();
});
