// Initialize the Leaflet map
function initMap() {
    var map = L.map('map', {
        center: [-35.25870948687002, 149.4431761913284], // Centered on New South Wales, Australia
        zoom: 10,
        zoomControl: false // Disable the zoom control
    });

    // Fetch the Mapbox token from an external URL using a POST request
    fetch('https://prod-13.eastasia.logic.azure.com:443/workflows/a1e2c15b9b8c4bc09f218255271f73b4/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=59cN9YlOmJPsmVOoixCmKXD2ZDhmk4ZjGEE-IXL1hOQ', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ request: 'mapbox-token' })
    })
        .then(response => response.json())
        .then(data => {
            var accessToken = data.token;

            // Define navigation guidance light and dark mode tile layers using Mapbox
            var lightTileLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/navigation-guidance-day-v4/tiles/{z}/{x}/{y}?access_token=${accessToken}`, {
                attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> contributors'
            });

            var darkTileLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/navigation-guidance-night-v4/tiles/{z}/{x}/{y}?access_token=${accessToken}`, {
                attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> contributors'
            });

            // Function to set the appropriate tile layer based on the color scheme
            function setTileLayer() {
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    darkTileLayer.addTo(map);
                } else {
                    lightTileLayer.addTo(map);
                }
            }

            // Set the initial tile layer
            setTileLayer();

            // Listen for changes in the color scheme preference
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setTileLayer);

            // Define custom icons with error handling
            function createIcon(iconUrl) {
                try {
                    return L.icon({
                        iconUrl: iconUrl,
                        iconSize: [32, 32], // size of the icon
                        iconAnchor: [16, 32], // point of the icon which will correspond to marker's location
                        popupAnchor: [0, -32] // point from which the popup should open relative to the iconAnchor
                    });
                } catch (error) {
                    console.error('Error creating icon:', error);
                    // return L.divIcon({
                    //     html: '<i class="fa fa-fire" style="font-size: 32px; color: grey;"></i>',
                    //     iconSize: [32, 32],
                    //     className: 'custom-div-icon'
                    // });
                }
            }

            // Fallback icon in case custom icons fail
            var defaultIcon = L.divIcon({
                html: '<i class="fa fa-fire" style="font-size: 32px; color: grey;"></i>',
                iconSize: [32, 32],
                className: 'custom-div-icon'
            });

            var adviceIcon = createIcon('/Images/advice.png') || defaultIcon;
            var watchAndActIcon = createIcon('/Images/watch-and-act.png') || defaultIcon;
            var emergencyWarningIcon = createIcon('/Images/emergency-warning.png') || defaultIcon;
            var otherIcon = createIcon('/Images/other.png') || defaultIcon;


            // Create a feature group to hold the markers
            var markers = L.featureGroup();

            // Fetch GeoJSON data and add markers to the map
            const targetUrl = 'https://prod-16.australiaeast.logic.azure.com:443/workflows/0e1db2551604467787d10a1079e2ca00/triggers/When_a_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_a_HTTP_request_is_received%2Frun&sv=1.0&sig=PPxJa5-zzi3BE7-vp98G6nDRymYIoRgvKw4lZU44Cv4';

            fetch(targetUrl)
                .then(response => response.json())
                .then(data => {
                    L.geoJSON(data, {
                        filter: function (feature) {
                            // Filter features that contain "COUNCIL AREA: Queanbeyan-Palerang" in the description
                            return feature.properties && feature.properties.description && feature.properties.description.includes("COUNCIL AREA: Queanbeyan-Palerang");
                        },
                        pointToLayer: function (feature, latlng) {
                            // Determine the icon based on the warning type
                            var icon;
                            if (feature.properties.category.includes("Advice")) {
                                icon = adviceIcon;
                            } else if (feature.properties.category.includes("Watch and Act")) {
                                icon = watchAndActIcon;
                            } else if (feature.properties.category.includes("Emergency Warning")) {
                                icon = emergencyWarningIcon;
                            } else {
                                icon = otherIcon;
                            }
                            var marker = L.marker(latlng, { icon: icon });
                            markers.addLayer(marker); // Add marker to the feature group
                            return marker;
                        },
                        onEachFeature: function (feature, layer) {
                            if (feature.properties && feature.properties.title) {
                                layer.bindPopup('<h3>' + feature.properties.title + '</h3>' +
                                    '<p>' + feature.properties.description + '</p>');
                            }
                        }
                    }).addTo(map);

                    // Check if there are any markers before fitting bounds
                    if (markers.getLayers().length > 0) {
                        // Fit the map view to the bounds of the markers with 10% padding
                        map.fitBounds(markers.getBounds(), {
                            padding: [map.getSize().x * 0.1, map.getSize().y * 0.1] // 10% padding on each side
                        });
                    } else {
                        console.log("No markers to fit bounds to.");
                    }

                })
                .catch(error => console.error('Error fetching GeoJSON data:', error));

            // Add the feature group to the map
            markers.addTo(map);
        })
        .catch(error => console.error('Error fetching Mapbox token:', error));
}

// Ensure the map is initialized after the DOM content is loaded
document.addEventListener('DOMContentLoaded', function () {
    initMap();
});

document.addEventListener('DOMContentLoaded', function () {
    const heroLogo = document.querySelector('.hero .logo');
    const navLogo = document.querySelector('.nav-logo');

    function toggleNavLogo() {
        const heroLogoRect = heroLogo.getBoundingClientRect();
        if (heroLogoRect.bottom < 0) {
            navLogo.classList.add('visible');
        } else {
            navLogo.classList.remove('visible');
        }
    }

    window.addEventListener('scroll', toggleNavLogo);
    toggleNavLogo(); // Initial check
});

document.addEventListener('DOMContentLoaded', function () {
    const BFDPContent = document.getElementById('BFDPContent');

    function isBushfireDangerPeriod() {
        const now = new Date();
        const month = now.getMonth() + 1; // getMonth() is zero-based
        return month >= 10 || month <= 3;
    }

    const inDangerPeriod = isBushfireDangerPeriod();
    const statusText = inDangerPeriod ? "We are currently in the bushfire danger period. If you would like to light a fire any larger than a cooking fire you must;" : "We are not currently in the bushfire danger period. If you would like to light a fire any larger than a cooking fire you must;";

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
                <td><input type="checkbox" ${inDangerPeriod ? '' : 'checked'} disabled></td>
            </tr>
            <tr>
                <td>Have been issued a fire permit</td>
                <td><input type="checkbox" ${inDangerPeriod ? 'checked' : ''} disabled></td>
            </tr>
        </table>
    `;

    BFDPContent.innerHTML = tableHTML;
});