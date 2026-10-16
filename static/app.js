const coordinates = window.appCoordinates;

const modeIcons = {
    "START": { class: "fa-solid fa-location-crosshairs", emoji: "📍" },
    "Walk": { class: "fa-solid fa-person-walking", emoji: "🚶" },
    "Bus": { class: "fa-solid fa-bus-simple", emoji: "🚌" },
    "Metro": { class: "fa-solid fa-train-subway", emoji: "🚇" },
    "Cab": { class: "fa-solid fa-taxi", emoji: "🚕" },
    "Auto": { class: "fa-solid fa-truck-pickup", emoji: "🛺" },
    "Train": { class: "fa-solid fa-train", emoji: "🚂" }
};

const map = L.map('map').setView([18.5204, 73.8567], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

let currentRouteLayer = null;
let currentMarkers = [];
let clickState = 0; 

const corridor1 = ["PCMC", "Sant Tukaram Nagar", "Nashik Phata", "Kasarwadi", "Phugewadi", "Dapodi", "Bopodi", "Khadki", "Range Hill", "Shivaji Nagar", "District Court", "Kasba Peth", "Mahatma Phule Mandai", "Swargate"];
const corridor2 = ["Vanaz", "Anand Nagar", "Paud Phata", "S.N.D.T College", "Garware College", "Deccan Gymkhana", "Chhatrapati Sambhaji Udyan", "PMC", "R.T.O Pune", "Pune Railway Station", "Ruby Hall Clinic", "Bund Garden", "Yerawada", "Kalyani Nagar", "Ramwadi"];

// --- SPATIAL GEOMETRY & INTERPOLATION HELPERS (DSA) ---
function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function computeBearing(p1, p2) {
    const lat1 = p1[0] * Math.PI / 180;
    const lat2 = p2[0] * Math.PI / 180;
    const dLon = (p2[1] - p1[1]) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

function interpolateDenseSegment(p1, p2, maxStepMeters = 25) {
    const dist = haversineMeters(p1[0], p1[1], p2[0], p2[1]);
    const steps = Math.max(1, Math.ceil(dist / maxStepMeters));
    const brng = computeBearing(p1, p2);
    const subPoints = [];
    for (let s = 0; s < steps; s++) {
        const t = s / steps;
        subPoints.push({
            coords: [
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ],
            heading: brng
        });
    }
    return subPoints;
}

// Point to Segment Shortest Distance (Computational Geometry - Off Route Detector)
function getDistToSegmentMeters(p, v, w) {
    const l2 = Math.pow(v[0] - w[0], 2) + Math.pow(v[1] - w[1], 2);
    if (l2 === 0) return haversineMeters(p[0], p[1], v[0], v[1]);
    let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])];
    return haversineMeters(p[0], p[1], proj[0], proj[1]);
}


// --- FIRST-MILE DOOR-TO-DOOR CONNECTOR (DSA: Spatial Lookup & Feeder Optimization) ---
window.customStartPoint = null;
let doorstepPreviewLayer = null;
let doorstepMarker = null;

function computeFirstMileDetails(userLat, userLon, stationName) {
    const stationCoords = coordinates[stationName];
    if (!stationCoords) return null;
    const distMeters = haversineMeters(userLat, userLon, stationCoords[0], stationCoords[1]);
    const isWalk = distMeters <= 800; // Under 800m -> Walk, else -> Feeder Auto
    const mode = isWalk ? 'Walk' : 'Auto';
    
    let timeMins = 0;
    let cost = 0;
    let carbon = 0;
    if (isWalk) {
        timeMins = Math.max(1, Math.round(distMeters / 75)); // ~4.5 km/h
        cost = 0;
        carbon = 0;
    } else {
        const distKm = distMeters / 1000;
        timeMins = Math.max(2, Math.round((distKm / 20) * 60) + 2); // 20 km/h feeder + 2 min wait
        cost = Math.round(25 + Math.max(0, distKm - 1.5) * 17); // Pune meter: ₹25 for first 1.5km, ₹17/km after
        carbon = Math.round(distKm * 12);
    }
    return {
        userCoords: [userLat, userLon],
        stationName: stationName,
        stationCoords: stationCoords,
        distMeters: distMeters,
        mode: mode,
        timeMins: timeMins,
        cost: cost,
        carbon: carbon
    };
}

function createCustomIcon(mode, isStart, isEnd, locationName) {
    let extraClass = '';
    let emoji = '';
    
    if (isStart) {
        if (locationName && (locationName.includes("Doorstep") || locationName.includes("Physical Origin"))) {
            extraClass = 'marker-doorstep doorstep-pulse';
            emoji = '<i class="fa-solid fa-house" style="color:#10b981; font-size: 11px;"></i>';
        } else {
            extraClass = 'marker-start';
            emoji = '📍';
        }
    }
    else if (isEnd) extraClass = 'marker-end';
    else if (mode === 'Walk') {
        extraClass = 'marker-doorstep';
        emoji = '<i class="fa-solid fa-person-walking" style="color:#10b981; font-size: 11px;"></i>';
    }
    else if (mode === 'Metro') {
        extraClass = 'marker-metro-logo';
        emoji = '<i class="fa-solid fa-train-subway" style="color:#9b59b6; font-size: 11px;"></i>';
    } else {
        emoji = modeIcons[mode] ? modeIcons[mode].emoji : "";
    }
    
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="custom-marker ${extraClass}"><span class="custom-marker-icon">${emoji}</span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
}

map.on('click', async (e) => {
    try {
        const response = await fetch('/api/nearest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: e.latlng.lat, lon: e.latlng.lng })
        });
        const data = await response.json();
        const nearestStation = data.nearest || data.nearest_node;
        
        if (nearestStation && nearestStation !== "Unknown" && coordinates[nearestStation]) {
            if (clickState === 0) {
                const distToStation = haversineMeters(e.latlng.lat, e.latlng.lng, coordinates[nearestStation][0], coordinates[nearestStation][1]);
                
                if (distToStation > 100) {
                    // Clicked away from station -> Set Doorstep Origin with First-Mile Connector
                    const details = computeFirstMileDetails(e.latlng.lat, e.latlng.lng, nearestStation);
                    window.customStartPoint = details;
                    
                    const distLabel = details.distMeters < 1000 ? `${Math.round(details.distMeters)}m` : `${(details.distMeters/1000).toFixed(1)}km`;
                    const liveOption = document.getElementById('live-loc-option');
                    liveOption.textContent = `📍 Doorstep Origin (${distLabel} ${details.mode} to ${nearestStation})`;
                    liveOption.classList.remove('hidden');
                    document.getElementById('source').value = '__LIVE_GPS__';
                    clickState = 1;
                    
                    if (doorstepPreviewLayer) map.removeLayer(doorstepPreviewLayer);
                    doorstepPreviewLayer = L.polyline([[e.latlng.lat, e.latlng.lng], details.stationCoords], {
                        color: details.mode === 'Walk' ? '#10b981' : '#f59e0b',
                        dashArray: '5, 8',
                        weight: 3
                    }).addTo(map);

                    const modeEmoji = details.mode === 'Walk' ? '🚶 Walk' : '🛺 Feeder Auto';
                    L.popup().setLatLng(e.latlng).setContent(
                        `<b>📍 Doorstep Origin Set!</b><br>` +
                        `${modeEmoji} <b>${distLabel}</b> to <b>${nearestStation}</b><br>` +
                        `<small style="color:#059669;">First-Mile Feeder connected automatically.</small><br>` +
                        `<i>(Click map again for Destination)</i>`
                    ).openOn(map);
                } else {
                    // Clicked directly on station
                    window.customStartPoint = null;
                    if (doorstepPreviewLayer) {
                        map.removeLayer(doorstepPreviewLayer);
                        doorstepPreviewLayer = null;
                    }
                    document.getElementById('source').value = nearestStation;
                    clickState = 1;
                    L.popup().setLatLng(e.latlng).setContent(`Set Source: <b>${nearestStation}</b><br><i>(Click again for Destination)</i>`).openOn(map);
                }
            } else {
                document.getElementById('destination').value = nearestStation;
                clickState = 0;
                L.popup().setLatLng(e.latlng).setContent(`Set Destination: <b>${nearestStation}</b>`).openOn(map);
            }
        }
    } catch(err) {
        console.error("KD-Tree Lookup Failed", err);
    }
});

// Clear doorstep first-mile if user manually changes source to a station
document.getElementById('source').addEventListener('change', (e) => {
    if (e.target.value !== '__LIVE_GPS__') {
        window.customStartPoint = null;
        if (doorstepPreviewLayer) {
            map.removeLayer(doorstepPreviewLayer);
            doorstepPreviewLayer = null;
        }
    }
});

document.getElementById('route-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const source = document.getElementById('source').value;
    const dest = document.getElementById('destination').value;
    const pref = document.getElementById('preference').value;
    const traffic = document.getElementById('traffic-toggle').checked;
    
    // First-Mile Door-to-Door Detection
    const isFirstMile = (source === '__LIVE_GPS__' && window.customStartPoint);
    const actualQuerySource = isFirstMile ? window.customStartPoint.stationName : source;

    // Collect intermediate waypoints
    const waypointSelects = document.querySelectorAll('.waypoint-select');
    const waypoints = [];
    waypointSelects.forEach(sel => {
        if (sel.value && sel.value !== actualQuerySource && sel.value !== dest && !waypoints.includes(sel.value)) {
            waypoints.push(sel.value);
        }
    });
    const optimizeTSP = document.getElementById('tsp-toggle') ? document.getElementById('tsp-toggle').checked : true;
    
    const resultsDiv = document.getElementById('results');
    const errorDiv = document.getElementById('error-msg');
    const loaderDiv = document.getElementById('loader');
    const submitBtn = document.getElementById('submit-btn');
    const trafficAlert = document.getElementById('traffic-alert');
    const tspBanner = document.getElementById('tsp-reorder-banner');
    const tspText = document.getElementById('tsp-reorder-text');
    const fmBanner = document.getElementById('first-mile-banner');
    const fmText = document.getElementById('first-mile-text');
    
    resultsDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    trafficAlert.classList.add('hidden');
    if (tspBanner) tspBanner.classList.add('hidden');
    if (fmBanner) fmBanner.classList.add('hidden');
    loaderDiv.classList.remove('hidden');
    submitBtn.disabled = true;
    
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    currentMarkers.forEach(m => map.removeLayer(m));
    currentMarkers = [];
    if (doorstepPreviewLayer) {
        map.removeLayer(doorstepPreviewLayer);
        doorstepPreviewLayer = null;
    }
    document.getElementById('path-list').innerHTML = '';

    if (actualQuerySource === dest) {
        showError("Source and Destination cannot be the same station.");
        return;
    }

    try {
        const response = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source: actualQuerySource,
                destination: dest,
                preference: pref,
                traffic,
                waypoints,
                optimizeTSP
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            showError(data.error);
            return;
        }

        loaderDiv.classList.add('hidden');
        submitBtn.disabled = false;

        // Prepend First-Mile Doorstep Leg & Metrics if active
        if (isFirstMile) {
            const fm = window.customStartPoint;
            data.totalCost += fm.cost;
            data.totalTime += fm.timeMins;
            data.totalCarbon += fm.carbon;

            const doorstepLocName = "Your Doorstep (Physical Origin)";
            coordinates[doorstepLocName] = fm.userCoords;

            const firstMileLegs = [
                { location: doorstepLocName, mode: "START" },
                { location: fm.stationName, mode: fm.mode }
            ];

            if (data.path && data.path.length > 0 && data.path[0].location === fm.stationName) {
                data.path = [...firstMileLegs, ...data.path.slice(1)];
            } else {
                data.path = [...firstMileLegs, ...(data.path || [])];
            }

            if (fmBanner && fmText) {
                fmBanner.classList.remove('hidden');
                const distFormatted = fm.distMeters < 1000 ? `${Math.round(fm.distMeters)}m` : `${(fm.distMeters / 1000).toFixed(1)}km`;
                const modeName = fm.mode === 'Walk' ? 'Walking 🚶' : 'Feeder Auto 🛺';
                fmText.innerHTML = `Physical origin is <strong>${distFormatted}</strong> from <strong>${fm.stationName}</strong>. First-mile covered via <strong>${modeName}</strong> (+${fm.timeMins} mins, ₹${fm.cost}, ${fm.carbon} carbon units). Network route begins at <strong>${fm.stationName}</strong>.`;
            }
        }

        const formattedCost = (typeof data.totalCost === 'number') ? Number(data.totalCost.toFixed(1)) : data.totalCost;
        const formattedTime = (typeof data.totalTime === 'number') ? Math.round(data.totalTime) : data.totalTime;
        const formattedCarbon = (typeof data.totalCarbon === 'number') ? Number(data.totalCarbon.toFixed(1)) : data.totalCarbon;

        document.getElementById('total-cost').innerHTML = `<i class="fa-solid fa-indian-rupee-sign"></i> ${formattedCost}`;
        document.getElementById('total-time').innerHTML = `<i class="fa-regular fa-clock"></i> ${formattedTime} mins`;
        document.getElementById('total-carbon').innerHTML = `<i class="fa-solid fa-leaf"></i> ${formattedCarbon} units`;
        
        if (data.trafficAlert) {
            trafficAlert.classList.remove('hidden');
        }

        // Display TSP Itinerary Optimization banner if waypoints were used
        if (data.orderedStops && data.orderedStops.length > 2 && tspBanner && tspText) {
            tspBanner.classList.remove('hidden');
            const stopsFormatted = data.orderedStops.map((stop, sIdx) => {
                if (sIdx === 0) return `<span style="color:#2563eb; font-weight:bold;">[Start: ${stop}]</span>`;
                if (sIdx === data.orderedStops.length - 1) return `<span style="color:#dc2626; font-weight:bold;">[End: ${stop}]</span>`;
                return `<span style="background:#dbeafe; color:#1e40af; padding:2px 6px; border-radius:4px; font-weight:bold;">Stop ${sIdx}: ${stop}</span>`;
            }).join(' ➔ ');
            tspText.innerHTML = `${stopsFormatted}<br><small style="color:#059669;">Order resolved using C++ Held-Karp Bitmask DP for optimal efficiency.</small>`;
        }
        
        const latlngs = [];
        const pathList = document.getElementById('path-list');
        const intermediateStops = data.orderedStops ? data.orderedStops.slice(1, -1) : [];

        data.path.forEach((step, index) => {
            const isStart = index === 0;
            const isEnd = index === data.path.length - 1;
            const viaStopIndex = intermediateStops.indexOf(step.location);
            const isViaStop = viaStopIndex !== -1;
            const isDoorstep = isStart && (step.location.includes("Doorstep") || step.location.includes("Physical Origin"));
            const isFirstMileConnector = (isFirstMile && index === 1);
            
            const li = document.createElement('li');
            li.className = `mode-${step.mode}`;
            
            const iconData = modeIcons[step.mode] || { class: "fa-solid fa-arrow-right" };
            
            if (isDoorstep) {
                li.style.borderLeftColor = '#10b981';
                li.innerHTML = `<i class="transport-icon fa-solid fa-house" style="color: #10b981;"></i> 
                                <div><strong>Start at Your Doorstep:</strong> <br> <span style="font-size: 13px; color: #475569;">Physical GPS / Map Origin</span></div>`;
            } else if (isFirstMileConnector) {
                li.style.borderLeftColor = (step.mode === 'Walk' ? '#10b981' : '#f59e0b');
                const distFormatted = window.customStartPoint.distMeters < 1000 ? `${Math.round(window.customStartPoint.distMeters)}m` : `${(window.customStartPoint.distMeters / 1000).toFixed(1)}km`;
                const feeText = window.customStartPoint.cost === 0 ? '₹0 (Free)' : `₹${window.customStartPoint.cost}`;
                li.innerHTML = `<i class="transport-icon ${iconData.class}" style="color: ${step.mode === 'Walk' ? '#10b981' : '#f59e0b'};"></i> 
                                <div><strong>${step.mode === 'Walk' ? 'Walk' : 'Take Feeder Auto'} ${distFormatted}</strong> to <br> <strong>${step.location}</strong> <span style="font-size: 11px; background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 4px;">First-Mile Feeder (${feeText})</span></div>`;
            } else if (isStart) {
                li.innerHTML = `<i class="transport-icon ${modeIcons['START'].class}"></i> 
                                <div><strong>Start your journey at:</strong> <br> ${step.location}</div>`;
            } else if (isViaStop) {
                li.style.borderLeftColor = '#8b5cf6';
                li.innerHTML = `<span style="background:#8b5cf6; color:white; border-radius:50%; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; margin-right:8px;">${viaStopIndex + 1}</span> 
                                <div><strong style="color:#7c3aed;">Via Stop #${viaStopIndex + 1}:</strong> <br> <strong>${step.location}</strong> (Arrive via ${step.mode})</div>`;
            } else {
                li.innerHTML = `<i class="transport-icon ${iconData.class}"></i> 
                                <div>Take <strong>${step.mode}</strong> to <br> <strong>${step.location}</strong></div>`;
            }
            pathList.appendChild(li);

            const coords = coordinates[step.location];
            if (coords) {
                latlngs.push(coords);
                const icon = createCustomIcon(step.mode, isStart, isEnd, step.location);
                let popupHtml = `<b>${step.location}</b><br>${isStart ? 'Start Point' : `Arrive via ${step.mode}`}`;
                if (isDoorstep) {
                    popupHtml = `<b>📍 Your Doorstep</b><br><span style="color:#10b981; font-weight:bold;">Physical Starting Point</span>`;
                } else if (isViaStop) {
                    popupHtml = `<b>${step.location}</b><br><span style="color:#7c3aed; font-weight:bold;">📍 Intermediate Stop #${viaStopIndex + 1} (TSP Resolved)</span>`;
                }
                const marker = L.marker(coords, { icon: icon })
                    .bindPopup(popupHtml)
                    .addTo(map);
                
                li.addEventListener('mouseenter', () => {
                    marker.openPopup();
                    map.setView(coords, 14, { animate: true });
                });
                li.addEventListener('mouseleave', () => {
                    marker.closePopup();
                });
                currentMarkers.push(marker);
            }
        });

        if (latlngs.length > 0) {
            let pathColor = '#3498db'; 
            if (pref === 'cost') pathColor = '#2ecc71';
            if (pref === 'time') pathColor = '#e74c3c';
            if (pref === 'eco') pathColor = '#27ae60';
            
            // Reset and capture route coordinates for Live Navigation & Journey Tracking
            window.activeJourneyPath = [];
            window.activeJourneyMilestones = [];
            if (window.stopActiveNavigation) window.stopActiveNavigation();
            
            // Draw segment by segment
            for (let i = 0; i < data.path.length - 1; i++) {
                const startNode = data.path[i];
                const endNode = data.path[i+1];
                
                const startCoord = coordinates[startNode.location];
                const endCoord = coordinates[endNode.location];
                const mode = endNode.mode;
                
                if (!startCoord || !endCoord) continue;
                
                let segmentLatLngs = [startCoord, endCoord];
                let isWalk = (mode === 'Walk');
                let isRoadVehicle = (mode === 'Bus' || mode === 'Cab' || mode === 'Auto');
                let isMetro = (mode === 'Metro');
                
                // Record milestone
                window.activeJourneyMilestones.push({
                    name: endNode.location,
                    mode: mode,
                    coords: endCoord,
                    index: i + 1
                });

                // OSRM ROAD SNAPPING LOGIC (Strictly for Road Vehicles, excluding Walk)
                if (isRoadVehicle && !isWalk) {
                    try {
                        const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${startCoord[1]},${startCoord[0]};${endCoord[1]},${endCoord[0]}?overview=full&geometries=geojson`);
                        const osrmData = await osrmRes.json();
                        
                        if (osrmData.code === 'Ok' && osrmData.routes.length > 0) {
                            segmentLatLngs = osrmData.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
                        }
                    } catch(e) {
                        console.log("OSRM failed for segment, falling back to direct line.");
                    }
                }
                
                // Dense Geodesic Interpolation for smooth, human-visible travel (DSA: Subdivision)
                for (let j = 0; j < segmentLatLngs.length - 1; j++) {
                    const pA = segmentLatLngs[j];
                    const pB = segmentLatLngs[j + 1];
                    const subPoints = interpolateDenseSegment(pA, pB, 25);
                    subPoints.forEach(sp => {
                        window.activeJourneyPath.push({
                            coords: sp.coords,
                            mode: mode,
                            nextStop: endNode.location,
                            heading: sp.heading
                        });
                    });
                }
                if (i === data.path.length - 2 && segmentLatLngs.length > 0) {
                    window.activeJourneyPath.push({
                        coords: segmentLatLngs[segmentLatLngs.length - 1],
                        mode: mode,
                        nextStop: endNode.location,
                        heading: 0
                    });
                }

                if (isWalk) {
                    // Style Walking First-Mile segment as emerald green dotted line
                    const walkTrack = L.polyline(segmentLatLngs, {
                        color: '#10b981',
                        weight: 5,
                        dashArray: '5, 8',
                        opacity: 0.95
                    }).addTo(map);
                    currentMarkers.push(walkTrack);
                } else if (isMetro) {
                    // Draw actual railway track style (Solid background, dashed white foreground)
                    let segmentColor = pathColor;
                    if (corridor1.includes(startNode.location) && corridor1.includes(endNode.location)) segmentColor = '#8e44ad';
                    else if (corridor2.includes(startNode.location) && corridor2.includes(endNode.location)) segmentColor = '#00bcd4';
                    else segmentColor = '#8e44ad';
                    
                    const bgTrack = L.polyline(segmentLatLngs, {
                        color: segmentColor,
                        weight: 8,
                        opacity: 1
                    }).addTo(map);
                    
                    const fgTrack = L.polyline(segmentLatLngs, {
                        color: '#ffffff',
                        weight: 4,
                        dashArray: '10, 15',
                        opacity: 1
                    }).addTo(map);
                    
                    currentMarkers.push(bgTrack);
                    currentMarkers.push(fgTrack);
                } else {
                    // Draw the segment as animated road path
                    const segmentLayer = L.polyline.antPath(segmentLatLngs, {
                        delay: 400,
                        dashArray: [10, 20],
                        weight: 5, 
                        color: pathColor,
                        pulseColor: '#ffffff',
                        paused: false, 
                        reverse: false, 
                        hardwareAccelerated: true
                    }).addTo(map);
                    currentMarkers.push(segmentLayer);
                }
            }
            
            map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [50, 50] });
            
            // Enable Live Navigation Ready state
            const navLiveBadge = document.getElementById('nav-live-badge');
            if (navLiveBadge) {
                navLiveBadge.textContent = `${window.activeJourneyPath.length} Waypoints Ready`;
                navLiveBadge.style.background = '#dcfce7';
                navLiveBadge.style.color = '#15803d';
            }
        }
        resultsDiv.classList.remove('hidden');

    } catch (err) {
        showError("Failed to connect to Python backend.");
    }
});

function showError(msg) {
    const errorDiv = document.getElementById('error-msg');
    const loaderDiv = document.getElementById('loader');
    const submitBtn = document.getElementById('submit-btn');
    
    loaderDiv.classList.add('hidden');
    submitBtn.disabled = false;
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
}

// --- LIVE LOCATION FEATURE (First-Mile Door-to-Door Integration) ---
document.getElementById('live-loc-btn').addEventListener('click', () => {
    const btn = document.getElementById('live-loc-btn');
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }
    
    // Change icon to loading spinner
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        // Use C++ KD-Tree to find the nearest station
        try {
            const res = await fetch('/api/nearest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: lat, lon: lon })
            });
            const data = await res.json();
            const nearestStation = data.nearest || data.nearest_node;
            
            if (nearestStation && nearestStation !== "Unknown" && coordinates[nearestStation]) {
                const details = computeFirstMileDetails(lat, lon, nearestStation);
                window.customStartPoint = details;
                
                const distLabel = details.distMeters < 1000 ? `${Math.round(details.distMeters)}m` : `${(details.distMeters / 1000).toFixed(1)}km`;
                const liveOption = document.getElementById('live-loc-option');
                liveOption.textContent = `📍 Live GPS (${distLabel} ${details.mode} to ${nearestStation})`;
                liveOption.classList.remove('hidden');
                document.getElementById('source').value = '__LIVE_GPS__';

                if (doorstepPreviewLayer) map.removeLayer(doorstepPreviewLayer);
                if (doorstepMarker) map.removeLayer(doorstepMarker);

                const doorstepIcon = createCustomIcon('Walk', true, false, 'Your Doorstep');
                doorstepMarker = L.marker([lat, lon], { icon: doorstepIcon })
                    .addTo(map)
                    .bindPopup(`<b>📍 You Are Here!</b><br>${details.mode === 'Walk' ? '🚶 Walk' : '🛺 Feeder Auto'} <b>${distLabel}</b> to <b>${nearestStation}</b><br><small style="color:#059669;">First-mile feeder automatically connected.</small>`)
                    .openPopup();

                doorstepPreviewLayer = L.polyline([[lat, lon], details.stationCoords], {
                    color: details.mode === 'Walk' ? '#10b981' : '#f59e0b',
                    dashArray: '5, 8',
                    weight: 3
                }).addTo(map);

                map.setView([lat, lon], 14, { animate: true });
            } else {
                alert("Could not find a nearby station in Pune network.");
            }
        } catch (err) {
            console.error("KD-Tree Error:", err);
            alert("Failed to connect to backend for nearest station lookup.");
        }
        
        // Restore button icon
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
    }, (error) => {
        console.error("Location error:", error);
        alert("Location access denied or unavailable.");
        btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i>';
    }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
});


// ==========================================
// --- ADVANCED LIVE JOURNEY TRACKING & NAVIGATION ENGINE ---
// Built using Data Structures:
// 1. FIFO Milestone Queue (Sequential transit station arrivals)
// 2. Computational Geometry: Point-to-Polyline Minimum Distance
// 3. Dynamic Rerouting via KD-Tree & A* Heuristic
// ==========================================

let navState = {
    active: false,
    paused: false,
    mode: 'sim', // 'sim' or 'gps'
    speedMultiplier: 1,
    currentStepIndex: 0,
    timerId: null,
    watchId: null,
    vehicleMarker: null,
    trailLayer: null,
    milestoneQueue: [],
    totalPoints: 0
};

// Global hook to cleanly terminate navigation
window.stopActiveNavigation = function() {
    navState.active = false;
    navState.paused = false;
    if (navState.timerId) clearInterval(navState.timerId);
    if (navState.watchId && navigator.geolocation) navigator.geolocation.clearWatch(navState.watchId);
    if (navState.vehicleMarker) {
        map.removeLayer(navState.vehicleMarker);
        navState.vehicleMarker = null;
    }
    if (navState.trailLayer) {
        map.removeLayer(navState.trailLayer);
        navState.trailLayer = null;
    }
    
    const activeHud = document.getElementById('nav-active-hud');
    const setupControls = document.getElementById('nav-setup-controls');
    const badge = document.getElementById('nav-live-badge');
    const arrivalBanner = document.getElementById('nav-arrival-banner');
    const nextStopCard = document.getElementById('nav-next-station-card');
    
    if (arrivalBanner) arrivalBanner.classList.add('hidden');
    if (nextStopCard) nextStopCard.style.borderLeftColor = '#4361ee';
    if (activeHud) activeHud.classList.add('hidden');
    if (setupControls) setupControls.classList.remove('hidden');
    if (badge) {
        badge.textContent = 'Ready';
        badge.style.background = '#e0e7ff';
        badge.style.color = '#4338ca';
    }
    const rerouteAlert = document.getElementById('nav-reroute-alert');
    if (rerouteAlert) rerouteAlert.classList.add('hidden');
};

// Destination Arrival Signal Trigger (Dashboard In-Place Signal, No Blocking Alert Popup)
function triggerDestinationArrival() {
    navState.active = false;
    navState.paused = false;
    if (navState.timerId) clearInterval(navState.timerId);
    if (navState.watchId && navigator.geolocation) navigator.geolocation.clearWatch(navState.watchId);
    
    const destName = document.getElementById('destination').value || 'Destination';

    // 1. Update Live Navigation Badge
    const badge = document.getElementById('nav-live-badge');
    if (badge) {
        badge.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> ARRIVED';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
    }

    // 2. Set Progress Bar to 100% Complete
    const progressBar = document.getElementById('nav-progress-bar');
    const progressText = document.getElementById('nav-progress-percent');
    if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.style.background = '#22c55e';
    }
    if (progressText) {
        progressText.textContent = '100% (Completed)';
    }

    // 3. Update HUD Current Mode Header
    const modeText = document.getElementById('nav-current-mode');
    if (modeText) {
        modeText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> <strong>Arrived at ${destName}!</strong>`;
    }

    // 4. Update Milestone Card
    const nextStopCard = document.getElementById('nav-next-station-card');
    const nextStopName = document.getElementById('nav-next-stop-name');
    const nextStopDist = document.getElementById('nav-next-stop-dist');
    if (nextStopCard) {
        nextStopCard.style.borderLeftColor = '#10b981';
    }
    if (nextStopName) {
        nextStopName.innerHTML = `<span style="color: #065f46;">🎉 Welcome to ${destName}</span>`;
    }
    if (nextStopDist) {
        nextStopDist.innerHTML = `<span style="color: #15803d; font-weight: 600;">You have reached your final destination.</span>`;
    }

    // 5. Reveal Dashboard Arrival Notification Signal Card (No disruptive alert() popup!)
    const arrivalBanner = document.getElementById('nav-arrival-banner');
    const arrivalDestText = document.getElementById('nav-arrival-dest-text');
    if (arrivalBanner) {
        if (arrivalDestText) {
            arrivalDestText.innerHTML = `You have successfully arrived at <strong>${destName}</strong>.`;
        }
        arrivalBanner.classList.remove('hidden');
    }

    // 6. Open gentle non-blocking Leaflet map popup on vehicle marker
    if (navState.vehicleMarker) {
        navState.vehicleMarker.bindPopup(`<b>🎉 You Have Arrived!</b><br>Welcome to <b>${destName}</b>`).openPopup();
    }
}

// Update HUD Display Elements
function updateNavigationHUD(currentPoint, progressRatio) {
    const percent = Math.min(100, Math.round(progressRatio * 100));
    const progressBar = document.getElementById('nav-progress-bar');
    const progressText = document.getElementById('nav-progress-percent');
    const modeText = document.getElementById('nav-current-mode');
    const nextStopName = document.getElementById('nav-next-stop-name');
    const nextStopDist = document.getElementById('nav-next-stop-dist');
    
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
    
    const modeIconClass = (modeIcons[currentPoint.mode] || {}).class || 'fa-solid fa-location-arrow';
    if (modeText) {
        modeText.innerHTML = `<i class="${modeIconClass}"></i> Onboard ${currentPoint.mode || 'Transit'}`;
    }
    
    // Check FIFO Milestone Queue
    if (navState.milestoneQueue.length > 0) {
        const nextMilestone = navState.milestoneQueue[0];
        const distToNext = haversineMeters(
            currentPoint.coords[0], currentPoint.coords[1],
            nextMilestone.coords[0], nextMilestone.coords[1]
        );
        
        if (nextStopName) nextStopName.textContent = nextMilestone.name;
        if (nextStopDist) {
            if (distToNext < 1000) {
                nextStopDist.textContent = `Approaching in ${Math.round(distToNext)} meters`;
            } else {
                nextStopDist.textContent = `Distance: ${(distToNext / 1000).toFixed(1)} km`;
            }
        }
        
        // Milestone Reached Trigger (Within 80 meters)
        if (distToNext < 80) {
            nextStopDist.innerHTML = `<span style="color:#16a34a; font-weight:bold;">✨ Arrived at ${nextMilestone.name}!</span>`;
            navState.milestoneQueue.shift(); // Dequeue reached milestone
        }
    } else {
        if (nextStopName) nextStopName.textContent = "Final Destination Reached!";
        if (nextStopDist) nextStopDist.textContent = "Journey successfully completed.";
    }
}

// Start Navigation Flow
function initNavigation() {
    if (!window.activeJourneyPath || window.activeJourneyPath.length < 2) {
        alert("Please calculate a route first before starting live navigation!");
        return;
    }
    
    window.stopActiveNavigation();
    navState.active = true;
    navState.paused = false;
    navState.currentStepIndex = 0;
    navState.mode = document.getElementById('nav-mode-select').value;
    navState.totalPoints = window.activeJourneyPath.length;
    // Clone milestones into FIFO queue
    navState.milestoneQueue = JSON.parse(JSON.stringify(window.activeJourneyMilestones || []));
    
    document.getElementById('nav-setup-controls').classList.add('hidden');
    document.getElementById('nav-active-hud').classList.remove('hidden');
    
    const badge = document.getElementById('nav-live-badge');
    badge.textContent = navState.mode === 'sim' ? 'SIMULATING' : 'LIVE GPS';
    badge.style.background = '#fef08a';
    badge.style.color = '#854d0e';
    
    const startCoord = window.activeJourneyPath[0].coords;
    
    // Create vehicle icon marker with dynamic directional arrow
    const vehicleIcon = L.divIcon({
        className: 'nav-vehicle-div-icon',
        html: `<div id="nav-user-vehicle-pin" class="nav-user-vehicle"><i id="nav-arrow-icon" class="fa-solid fa-location-arrow"></i></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });
    
    navState.vehicleMarker = L.marker(startCoord, { icon: vehicleIcon, zIndexOffset: 2000 }).addTo(map);
    
    // Add glowing traveled trail layer
    navState.trailLayer = L.polyline([startCoord], {
        color: '#f59e0b',
        weight: 5,
        opacity: 0.9,
        dashArray: '6, 8'
    }).addTo(map);

    // Zoom to comfortable street/corridor level
    map.setView(startCoord, 15, { animate: true });
    
    if (navState.mode === 'sim') {
        runSimulationLoop();
    } else {
        runRealGPSLoop();
    }
}

// Simulation Mode (Stepping through dense sub-points with smooth, human-visible pace)
function runSimulationLoop() {
    if (navState.timerId) clearInterval(navState.timerId);
    
    // Pacing: 90ms per 25-meter sub-step (~1 km per 3.6s)
    // 0.5x -> 180ms (Very relaxed & clear)
    // 1.0x -> 90ms (Smooth and observable)
    // 2.0x -> 45ms (Brisk)
    // 4.0x -> 22ms (Fast forward)
    const baseInterval = 90;
    const interval = Math.max(16, Math.round(baseInterval / (navState.speedMultiplier || 1)));
    
    navState.timerId = setInterval(() => {
        if (navState.paused || !navState.active) return;
        
        if (navState.currentStepIndex >= navState.totalPoints) {
            triggerDestinationArrival();
            return;
        }
        
        const pt = window.activeJourneyPath[navState.currentStepIndex];
        navState.vehicleMarker.setLatLng(pt.coords);
        
        // Rotate directional arrow smoothly
        const arrow = document.getElementById('nav-arrow-icon');
        if (arrow && pt.heading !== undefined) {
            arrow.style.display = 'inline-block';
            arrow.style.transform = `rotate(${pt.heading - 45}deg)`;
        }
        
        // Add traveled point to trail
        if (navState.trailLayer) {
            navState.trailLayer.addLatLng(pt.coords);
        }
        
        // Pan map smoothly every 6 sub-steps (~150m) to keep vehicle centered without jarring jumps
        if (navState.currentStepIndex % 6 === 0) {
            map.panTo(pt.coords, { animate: true, duration: 0.35, noMoveStart: true });
        }
        
        const progress = navState.currentStepIndex / Math.max(1, navState.totalPoints - 1);
        updateNavigationHUD(pt, progress);
        navState.currentStepIndex++;
    }, interval);
}

// Real GPS Live Navigation Mode
function runRealGPSLoop() {
    if (!navigator.geolocation) {
        alert("Geolocation not supported by your device!");
        window.stopActiveNavigation();
        return;
    }
    
    navState.watchId = navigator.geolocation.watchPosition((pos) => {
        if (!navState.active) return;
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const currentCoord = [lat, lon];
        
        navState.vehicleMarker.setLatLng(currentCoord);
        map.setView(currentCoord, 16, { animate: true });
        
        // Off-Route Detection (DSA: Computational Geometry)
        // Find minimum distance from user GPS to any segment of planned route
        let minDevMeters = Infinity;
        for (let i = 0; i < window.activeJourneyPath.length - 1; i++) {
            const segDist = getDistToSegmentMeters(
                currentCoord,
                window.activeJourneyPath[i].coords,
                window.activeJourneyPath[i+1].coords
            );
            if (segDist < minDevMeters) minDevMeters = segDist;
        }
        
        const rerouteAlert = document.getElementById('nav-reroute-alert');
        if (minDevMeters > 150) { // Off route by more than 150m!
            if (rerouteAlert) rerouteAlert.classList.remove('hidden');
            
            // Dynamic Rerouting via KD-Tree
            fetch('/api/nearest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: lat, lon: lon })
            }).then(r => r.json()).then(nearestData => {
                if (nearestData.nearest_node) {
                    const dest = document.getElementById('destination').value;
                    const pref = document.getElementById('preference').value;
                    console.log(`Auto-Rerouting from nearest station: ${nearestData.nearest_node}`);
                    // Trigger dynamic A* route search from new position
                    document.getElementById('source').value = nearestData.nearest_node;
                    document.getElementById('submit-btn').click();
                }
            }).catch(e => console.error("Reroute failure:", e));
        } else {
            if (rerouteAlert) rerouteAlert.classList.add('hidden');
        }
        
        // Check if arrived at final destination (within 60m of destination coordinate)
        if (window.activeJourneyPath && window.activeJourneyPath.length > 0) {
            const lastPt = window.activeJourneyPath[window.activeJourneyPath.length - 1];
            if (lastPt) {
                const distToEnd = haversineMeters(lat, lon, lastPt.coords[0], lastPt.coords[1]);
                if (distToEnd < 60) {
                    triggerDestinationArrival();
                    return;
                }
            }
        }
        
        // Approximate progress along journey
        const progress = Math.min(1, navState.currentStepIndex / Math.max(1, navState.totalPoints));
        updateNavigationHUD({ coords: currentCoord, mode: 'Live Tracking' }, progress);
    }, (err) => {
        console.error("GPS Watch Error:", err);
        alert("Could not retrieve real GPS coordinates.");
    }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
    });
}

// Bind UI Buttons
document.getElementById('start-nav-btn').addEventListener('click', initNavigation);

document.getElementById('pause-nav-btn').addEventListener('click', () => {
    navState.paused = !navState.paused;
    const pauseBtn = document.getElementById('pause-nav-btn');
    if (navState.paused) {
        pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        pauseBtn.style.background = '#22c55e';
    } else {
        pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        pauseBtn.style.background = '#f59e0b';
    }
});

document.getElementById('stop-nav-btn').addEventListener('click', () => {
    window.stopActiveNavigation();
});

const arrivalDoneBtn = document.getElementById('nav-arrival-done-btn');
if (arrivalDoneBtn) {
    arrivalDoneBtn.addEventListener('click', () => {
        window.stopActiveNavigation();
    });
}

// Speed selectors for simulation
document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        navState.speedMultiplier = parseFloat(e.target.dataset.speed || 1);
        if (navState.active && navState.mode === 'sim') {
            runSimulationLoop(); // Restart loop with new speed multiplier
        }
    });
});

// ==========================================
// --- MULTI-STOP (VIA STOPS) DYNAMIC UI ---
// ==========================================
const addStopBtn = document.getElementById('add-stop-btn');
const waypointsContainer = document.getElementById('waypoints-container');

if (addStopBtn && waypointsContainer) {
    addStopBtn.addEventListener('click', () => {
        const currentCount = waypointsContainer.children.length;
        if (currentCount >= 4) {
            alert("Maximum 4 intermediate stops allowed.");
            return;
        }

        const row = document.createElement('div');
        row.className = 'waypoint-row';
        row.style = 'display: flex; gap: 8px; align-items: center; background: #eef2ff; padding: 6px 10px; border-radius: 6px; border: 1px solid #c7d2fe; animation: fadeIn 0.3s ease;';

        let optionsHtml = '';
        const allLocs = Object.keys(coordinates).sort();
        allLocs.forEach(loc => {
            optionsHtml += `<option value="${loc}">${loc}</option>`;
        });

        row.innerHTML = `
            <span class="waypoint-label" style="font-size: 12px; color: #4338ca; font-weight: bold; width: 45px;">Via ${currentCount + 1}:</span>
            <select class="waypoint-select" style="flex: 1; padding: 6px; font-size: 13px; border-radius: 4px; border: 1px solid #cbd5e1; background: white; cursor: pointer;">
                ${optionsHtml}
            </select>
            <button type="button" class="remove-waypoint-btn" title="Remove stop" style="width: auto; margin: 0; padding: 6px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; box-shadow: none;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        row.querySelector('.remove-waypoint-btn').addEventListener('click', () => {
            row.remove();
            // Re-index remaining labels
            const rows = waypointsContainer.querySelectorAll('.waypoint-row');
            rows.forEach((r, idx) => {
                const label = r.querySelector('.waypoint-label');
                if (label) label.textContent = `Via ${idx + 1}:`;
            });
        });

        waypointsContainer.appendChild(row);
    });
}


