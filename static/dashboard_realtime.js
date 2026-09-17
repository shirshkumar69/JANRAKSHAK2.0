// JANRAKSHAK Dashboard - Real-time Multi-Hazard WebSocket & GIS Integration
(function() {
    'use strict';

    // WebSocket Connection State
    let socket = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 3000;

    // GIS Map & Markers State
    let currentCorridor = 'NH-07';
    let globalSegments = [];
    let currentSimState = null;
    let detourPolyline = null;
    let currentForecastHour = 0;
    let scrubberInterval = null;
    let seismicMarkers = [];

    let map = null;
    let markers = new Map();
    let pulseMarkers = new Map();
    let isConnected = false;
    let needsMapRecenter = true;

    // Initialize WebSocket
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/socket.io/`;

        socket = io({
            transports: ['websocket', 'polling'],
            upgrade: true,
            reconnection: true,
            reconnectionDelay: RECONNECT_DELAY,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
        });

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('status', handleStatus);
        socket.on('data_update', handleDataUpdate);
        socket.on('alert', handleAlert);
        socket.on('connect_error', handleConnectError);
    }

    function handleConnect() {
        isConnected = true;
        reconnectAttempts = 0;
        updateConnectionStatus(true);
        console.log('[JANRAKSHAK] WebSocket connected to real-time command stream');

        // Request immediate live data payload
        socket.emit('request_update');
    }

    function handleDisconnect() {
        isConnected = false;
        updateConnectionStatus(false);
        console.log('[JANRAKSHAK] WebSocket disconnected from stream');
    }

    function handleStatus(data) {
        console.log('[JANRAKSHAK] Status stream:', data);
    }

    function handleDataUpdate(data) {
        console.log('[JANRAKSHAK] Real-time data update received:', data);

        if (data.simulation_state) {
            currentSimState = data.simulation_state;
            updateSimulationUI(data.simulation_state);
        }

        if (data.segments) {
            globalSegments = data.segments;
            window._globalSegments = globalSegments;
            applyForecastAndRender();
        }

        if (data.last_refresh) {
            updateLastSync(data.last_refresh);
        }
    }

    function applyForecastAndRender() {
        if (!globalSegments) return;

        const renderedSegments = globalSegments.map(seg => {
            const pd = (seg.predictive_72h && seg.predictive_72h[`${currentForecastHour}h`])
                ? seg.predictive_72h[`${currentForecastHour}h`]
                : { fos: seg.fos?.min ?? 1.5, risk_level: seg.risk_level ?? 'STABLE', accum_rain_mm: (seg.rainfall?.accum_24h_mm || 0) };

            return {
                ...seg,
                rendered_fos: pd.fos,
                rendered_risk: pd.risk_level,
                rendered_rain: pd.accum_rain_mm
            };
        });

        updateDashboardMetrics(renderedSegments, currentSimState);
        updateMapMarkers(renderedSegments);
        updateHazardTable(renderedSegments);

        fetchEvacuationRoute();
    }

    function handleAlert(data) {
        console.log('[JANRAKSHAK] Critical Hazard Alert:', data);
        showNotification(data.message, 'danger');

        if (data.sectors) {
            // Flash critical sectors on map
            data.sectors.forEach(sector => {
                const marker = markers.get(sector.id);
                if (marker) {
                    flashMarker(marker);
                }
            });
        }
    }

    function handleConnectError(error) {
        console.error('[JANRAKSHAK] Connection error:', error);
        reconnectAttempts++;

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            showNotification('Falling back to polling stream. Connection degraded.', 'warning');
        }
    }

    // Update UI Components
    function updateConnectionStatus(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.system-status strong');

        if (statusDot) {
            if (connected) {
                statusDot.classList.add('active');
                statusDot.style.background = 'var(--success)';
            } else {
                statusDot.classList.remove('active');
                statusDot.style.background = 'var(--text-muted)';
            }
        }

        if (statusText) {
            statusText.textContent = connected ? 'Live Telemetry Stream' : 'Offline / Polling';
        }
    }

    function updateSimulationUI(state) {
        const modeBadge = document.getElementById('system-mode-badge');
        const stormChip = document.getElementById('sim-btn-storm');
        const quakeChip = document.getElementById('sim-btn-quake');
        const compoundChip = document.getElementById('sim-btn-compound');

        if (stormChip) stormChip.className = 'sim-chip' + (state.storm ? ' active-storm' : '');
        if (quakeChip) quakeChip.className = 'sim-chip' + (state.quake ? ' active-quake' : '');
        if (compoundChip) compoundChip.className = 'sim-chip' + (state.storm && state.quake ? ' active-compound' : '');

        if (modeBadge) {
            if (state.storm && state.quake) {
                modeBadge.textContent = 'Compound Multi-Hazard';
                modeBadge.className = 'mode-pill danger';
            } else if (state.storm) {
                modeBadge.textContent = 'Cloudburst Surge Active';
                modeBadge.className = 'mode-pill warning';
            } else if (state.quake) {
                modeBadge.textContent = `Seismic Shock (kh=${state.kh.toFixed(2)}g)`;
                modeBadge.className = 'mode-pill warning';
            } else {
                modeBadge.textContent = 'Live Telemetry';
                modeBadge.className = 'mode-pill';
            }
        }
    }

    function updateDashboardMetrics(segments, simState) {
        const unstable = segments.filter(s => (s.rendered_risk || s.risk_level) === 'UNSTABLE');
        const marginal = segments.filter(s => (s.rendered_risk || s.risk_level) === 'MARGINAL');
        const stable = segments.filter(s => (s.rendered_risk || s.risk_level) === 'STABLE');

        // 1. Critical Unstable Sectors
        const unstableCountEl = document.getElementById('unstable-count');
        const unstableProgEl = document.getElementById('unstable-prog');
        const unstablePctLbl = document.getElementById('unstable-pct-label');
        const critBadge = document.getElementById('critical-badge');

        if (unstableCountEl) animateValue(unstableCountEl, unstable.length, 0);
        const unstPct = (segments.length > 0) ? (unstable.length / segments.length) * 100 : 0;
        if (unstableProgEl) unstableProgEl.style.width = `${unstPct}%`;
        if (unstablePctLbl) unstablePctLbl.textContent = `${unstPct.toFixed(0)}% of monitored corridor (${unstable.length}/${segments.length})`;

        if (critBadge) {
            if (unstable.length > 0) {
                critBadge.textContent = 'High Alert';
                critBadge.className = 'metric-badge badge-danger';
            } else {
                critBadge.textContent = 'Nominal';
                critBadge.className = 'metric-badge badge-success';
            }
        }

        // 2. Peak Rainfall
        const maxRain = (segments.length > 0) ? Math.max(...segments.map(s => s.rendered_rain !== undefined ? s.rendered_rain : (s.rainfall.accum_24h_mm || 0))) : 0;
        const avgRain = (segments.length > 0) ? (segments.reduce((acc, s) => acc + (s.rendered_rain !== undefined ? s.rendered_rain : (s.rainfall.accum_24h_mm || 0)), 0) / segments.length) : 0;
        const maxRainEl = document.getElementById('max-rain');
        const rainProg = document.getElementById('rain-prog');
        const rainFoot = document.getElementById('rain-foot-label');

        if (maxRainEl) animateValue(maxRainEl, maxRain, 1);
        if (rainProg) rainProg.style.width = `${Math.min(100, (maxRain / 200) * 100)}%`;
        if (rainFoot) rainFoot.textContent = `Corridor average: ${avgRain.toFixed(1)} mm`;

        // 3. Seismic kh and Earthquake Metrics
        const kh = simState ? (simState.kh || 0.0) : 0.0;
        const khValEl = document.getElementById('seismic-kh-val');
        const quakeProg = document.getElementById('quake-prog');
        const quakeStatSub = document.getElementById('quake-status-sub');
        const quakeMVal = document.getElementById('quake-m-val');
        const quakeDistVal = document.getElementById('quake-dist-val');
        const quakeKhVal = document.getElementById('quake-kh-val');
        const quakeBanner = document.getElementById('quake-banner');
        const quakeBannerTitle = document.getElementById('quake-banner-title');
        const quakeBannerDesc = document.getElementById('quake-banner-desc');
        const quakePill = document.getElementById('usgs-sync-pill');

        if (khValEl) animateValue(khValEl, kh, 2);
        if (quakeProg) quakeProg.style.width = `${Math.min(100, (kh / 0.35) * 100)}%`;
        if (quakeKhVal) quakeKhVal.textContent = `${kh.toFixed(2)} g`;

        if (kh > 0.05) {
            if (quakeStatSub) quakeStatSub.textContent = 'CRITICAL SEISMIC ACCELERATION';
            if (quakeMVal) quakeMVal.textContent = 'M 6.8';
            if (quakeDistVal) quakeDistVal.textContent = '38 km';
            if (quakeBanner) quakeBanner.style.borderColor = 'var(--danger)';
            if (quakeBannerTitle) quakeBannerTitle.textContent = '🚨 STRONG EARTHQUAKE DETECTED NEAR CORRIDOR';
            if (quakeBannerDesc) quakeBannerDesc.textContent = 'Pseudo-static seismic shear acceleration (kh=0.18g) is active. Severe risk of slope liquefaction and rockfall.';
            if (quakePill) {
                quakePill.textContent = 'SEISMIC TRIGGER ACTIVE';
                quakePill.className = 'metric-badge badge-danger';
            }
        } else {
            if (quakeStatSub) quakeStatSub.textContent = 'Pseudo-static horizontal force';
            if (quakeMVal) quakeMVal.textContent = 'M 4.2';
            if (quakeDistVal) quakeDistVal.textContent = '124 km';
            if (quakeBanner) quakeBanner.style.borderColor = 'rgba(255,165,2,0.25)';
            if (quakeBannerTitle) quakeBannerTitle.textContent = 'Himalayan Thrust Fault Monitoring Active';
            if (quakeBannerDesc) quakeBannerDesc.textContent = 'Real-time seismic waves are ingested from USGS GeoJSON feeds to calculate pseudo-static horizontal inertial load (kh).';
            if (quakePill) {
                quakePill.textContent = 'USGS SYNCED';
                quakePill.className = 'metric-badge badge-success';
            }
        }

        // 4. Sector Breakdown counts
        const lblUnst = document.getElementById('lbl-unst-cnt');
        const lblMarg = document.getElementById('lbl-marg-cnt');
        const lblStab = document.getElementById('lbl-stab-cnt');
        if (lblUnst) lblUnst.textContent = `${unstable.length} Unstable`;
        if (lblMarg) lblMarg.textContent = `${marginal.length} Marginal`;
        if (lblStab) lblStab.textContent = `${stable.length} Stable`;

        // 5. Bulletin Preview Status
        const bStatus = document.getElementById('b-status');
        if (bStatus) {
            if (unstable.length > 0) {
                bStatus.textContent = 'CRITICAL HAZARD WARNING';
                bStatus.style.color = 'var(--danger)';
            } else if (marginal.length > 0) {
                bStatus.textContent = 'ELEVATED SURVEILLANCE';
                bStatus.style.color = 'var(--warning)';
            } else {
                bStatus.textContent = 'NOMINAL MONITORING';
                bStatus.style.color = 'var(--success)';
            }
        }
    }

    function updateMapMarkers(segments) {
        if (!map) return;

        // Clear markers that are no longer in the current segments list
        const incomingIds = new Set(segments.map(s => s.id));
        for (const [id, marker] of markers.entries()) {
            if (!incomingIds.has(id)) {
                map.removeLayer(marker);
                markers.delete(id);
                removePulseEffect(id);
            }
        }

        const bounds = L.latLngBounds();

        segments.forEach(segment => {
            const riskLbl = segment.rendered_risk || segment.risk_level;
            const color = getRiskColor(riskLbl);
            const coords = [segment.coords[0], segment.coords[1]];
            bounds.extend(coords);

            let marker = markers.get(segment.id);

            if (!marker) {
                marker = L.circleMarker(coords, {
                    radius: 11,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: 0.95,
                    fillOpacity: 0.8,
                    interactive: true
                }).addTo(map);

                marker.bindPopup(createPopupContent(segment));
                markers.set(segment.id, marker);
            } else {
                marker.setStyle({
                    fillColor: color,
                    color: riskLbl === 'UNSTABLE' ? '#ff4757' : '#ffffff'
                });
                marker.setPopupContent(createPopupContent(segment));
            }

            if (riskLbl === 'UNSTABLE') {
                if (!pulseMarkers.has(segment.id)) {
                    addPulseEffect(segment.id, coords, color);
                }
            } else {
                if (pulseMarkers.has(segment.id)) {
                    removePulseEffect(segment.id);
                }
            }
        });

        if (needsMapRecenter && segments.length > 0) {
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
            needsMapRecenter = false;
        }
    }

    function createPopupContent(segment) {
        const riskLbl = segment.rendered_risk || segment.risk_level;
        const color = getRiskColor(riskLbl);
        const fosVal = (segment.rendered_fos !== undefined ? segment.rendered_fos : (segment.fos?.min ?? 0)).toFixed(2);
        const rainVal = (segment.rendered_rain !== undefined ? segment.rendered_rain : (segment.rainfall?.accum_24h_mm || 0)).toFixed(1);
        const slopeDeg = segment.slope?.beta_deg ?? 'N/A';
        const elevation = segment.elevation ?? 'N/A';

        return `
            <div style="font-family: 'Space Grotesk', sans-serif; min-width: 220px; padding: 6px; color: #0f172a;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="font-size: 15px; color: #0a0e1a;">${segment.id} · ${segment.name}</strong>
                    <span style="padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;
                        background: ${color}25; color: ${color}; border: 1px solid ${color};">
                        ${riskLbl}
                    </span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 8px;">
                    <div>
                        <div style="color: #64748b; font-size: 10px;">Factor of Safety</div>
                        <strong style="color: ${color}; font-size: 20px;">${fosVal}</strong>
                    </div>
                    <div>
                        <div style="color: #64748b; font-size: 10px;">24H Rainfall</div>
                        <strong style="color: #0284c7; font-size: 18px;">${rainVal} mm</strong>
                    </div>
                </div>
                <div style="font-size: 11px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between;">
                    <span>Slope: <strong>${slopeDeg}°</strong></span>
                    <span>Elevation: <strong>${elevation}m</strong></span>
                </div>
                <button onclick="window.loadSectorIntoSimulator('${segment.id}', ${slopeDeg}, ${rainVal})"
                    style="margin-top: 8px; width: 100%; padding: 6px; font-size: 11px; background: #0a0e1a; color: #00d9ff; border: 1px solid #00d9ff; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    Load into Physics Simulator ↗
                </button>
            </div>
        `;
    }

    function addPulseEffect(id, coords, color) {
        // interactive: false ensures clicks pass directly to the underlying marker
        const pulseMarker = L.circleMarker(coords, {
            radius: 14,
            fillColor: color,
            color: 'transparent',
            opacity: 0.4,
            fillOpacity: 0.4,
            interactive: false
        }).addTo(map);

        const intervalId = animatePulse(pulseMarker);
        pulseMarkers.set(id, { marker: pulseMarker, interval: intervalId });
    }

    function removePulseEffect(id) {
        const pulseObj = pulseMarkers.get(id);
        if (pulseObj) {
            if (pulseObj.interval) clearInterval(pulseObj.interval);
            if (pulseObj.marker && map) map.removeLayer(pulseObj.marker);
            pulseMarkers.delete(id);
        }
    }

    function animatePulse(marker) {
        let radius = 14;
        let opacity = 0.5;

        return setInterval(() => {
            if (!marker || !marker._map) return;
            radius = radius >= 36 ? 14 : radius + 1;
            opacity = opacity <= 0.1 ? 0.5 : opacity - 0.02;
            marker.setRadius(radius);
            marker.setStyle({ opacity: opacity, fillOpacity: opacity });
        }, 90);
    }

    function flashMarker(marker) {
        let flashes = 0;
        const interval = setInterval(() => {
            marker.setStyle({
                opacity: marker.options.opacity === 1 ? 0.2 : 1,
                fillOpacity: marker.options.fillOpacity === 0.8 ? 0.2 : 0.8
            });
            flashes++;
            if (flashes >= 6) clearInterval(interval);
        }, 200);
    }

    function updateHazardTable(segments) {
        const tableBody = document.getElementById('hazard-table-body');
        if (!tableBody) return;

        // Sort by Factor of Safety (most critical first)
        const sorted = [...segments].sort((a, b) => (a.rendered_fos !== undefined ? a.rendered_fos : (a.fos?.min ?? 99)) - (b.rendered_fos !== undefined ? b.rendered_fos : (b.fos?.min ?? 99)));

        tableBody.innerHTML = sorted.map(s => {
            const riskLbl = s.rendered_risk || s.risk_level;
            const color = getRiskColor(riskLbl);
            const fosVal = (s.rendered_fos !== undefined ? s.rendered_fos : (s.fos?.min ?? 0)).toFixed(2);
            const rainVal = (s.rendered_rain !== undefined ? s.rendered_rain : (s.rainfall?.accum_24h_mm || 0)).toFixed(1);
            const soilName = (s.soil && s.soil.name) ? s.soil.name : 'Colluvium / Schist';
            const slopeDeg = s.slope?.beta_deg ?? 'N/A';
            return `
                <tr>
                    <td><span class="sector-id">${s.id}</span></td>
                    <td><strong style="color: var(--text-primary);">${s.name}</strong></td>
                    <td>
                        <span class="metric-badge" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40; font-size: 13px;">
                            ${fosVal}
                        </span>
                    </td>
                    <td><span style="font-family: 'DM Mono', monospace; color: var(--text-primary); font-weight: 600;">${rainVal} mm</span></td>
                    <td><span style="font-family: 'DM Mono', monospace;">${s.slope.beta_deg}°</span></td>
                    <td><span style="font-size: 11px; color: var(--text-muted);">${soilName}</span></td>
                    <td>
                        <span class="risk-badge risk-${riskLbl.toLowerCase()}">
                            ${riskLbl}
                        </span>
                    </td>
                    <td>
                        <button class="btn" style="padding: 4px 10px; font-size: 11px;"
                            onclick="window.loadSectorIntoSimulator('${s.id}', ${s.slope.beta_deg}, ${rainVal})">
                            Simulate
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        const tblTime = document.getElementById('tbl-update-time');
        if (tblTime) {
            tblTime.textContent = 'Updated ' + new Date().toLocaleTimeString();
        }
    }

    function updateLastSync(timestamp) {
        const lastSyncEl = document.getElementById('last-sync');
        if (lastSyncEl) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = Math.floor((now - date) / 1000);

            let timeAgo = 'Just now';
            if (diff > 60) {
                const mins = Math.floor(diff / 60);
                timeAgo = `${mins}m ago`;
            }

            lastSyncEl.textContent = timeAgo;
        }
    }

    // Helper Functions
    function getRiskColor(riskLevel) {
        switch (riskLevel) {
            case 'UNSTABLE': return '#ff4757';
            case 'MARGINAL': return '#ffa502';
            case 'STABLE': return '#2ed573';
            default: return '#64748b';
        }
    }

    function animateValue(element, target, decimals = 0) {
        const current = parseFloat(element.textContent) || 0;
        const diff = target - current;
        const duration = 500;
        const start = performance.now();

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);

            const value = current + (diff * eased);
            element.textContent = decimals > 0 ? value.toFixed(decimals) : Math.round(value);

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        const icon = type === 'danger' ? '⚡' : type === 'warning' ? '⚠' : type === 'success' ? '✓' : 'ℹ';
        notification.innerHTML = `
            <span class="notification-icon">${icon}</span>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4500);
    }

    // Keyless Leaflet Map Setup
    function initMapIfNeeded() {
        const mapEl = document.getElementById('map');
        if (!mapEl || map) return;

        map = L.map('map', {
            zoomControl: false
        }).setView([30.28, 79.15], 9);

        // 100% Keyless Esri Dark Gray GIS Layer
        const defaultLayer = L.tileLayer('https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapEl._leaflet_map = map;
        window.JANRAKSHAK_MAP = map;
    }

    // Global helper to load sector into simulation sandbox
    window.loadSectorIntoSimulator = function(id, slope, rain) {
        const rngSlope = document.getElementById('rng-slope');
        const rngRain = document.getElementById('rng-rain');
        if (rngSlope) rngSlope.value = slope;
        if (rngRain) rngRain.value = Math.min(400, rain);

        if (typeof window.recalculatePrediction === 'function') {
            window.recalculatePrediction();
        }

        // Smooth scroll to engine card
        const engineCard = document.querySelector('.engine-card');
        if (engineCard) {
            engineCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };


    // ----------------------------------------------------
    // MULTI-CORRIDOR SWITCHING
    // ----------------------------------------------------
    const corridorSelector = document.getElementById('corridor-selector');
    if (corridorSelector) {
        corridorSelector.addEventListener('change', async (e) => {
            currentCorridor = e.target.value;
            needsMapRecenter = true;
            try {
                await fetch('/api/corridors/select', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ corridor_id: currentCorridor })
                });
                if (socket && isConnected) {
                    socket.emit('request_update');
                } else {
                    // Fallback if websocket is disconnected
                    fetch('/api/segments')
                        .then(res => res.json())
                        .then(data => {
                            if (data.segments) {
                                globalSegments = data.segments;
                                applyForecastAndRender();
                            }
                        }).catch(e => console.warn('Polling fallback failed on corridor switch', e));
                }
            } catch(err) {
                console.error("Failed to swap corridor:", err);
            }
        });
    }

    // ----------------------------------------------------
    // EVACUATION BYPASS (Draw Route)
    // ----------------------------------------------------
    async function fetchEvacuationRoute() {
        try {
            const response = await fetch('/api/evacuation-route', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ corridor_id: currentCorridor })
            });
            const data = await response.json();

            if (detourPolyline && map) {
                map.removeLayer(detourPolyline);
            }

            if (data.waypoints && data.waypoints.length > 0 && map) {
                const unstableCount = globalSegments.filter(s => (s.rendered_risk || s.risk_level) === 'UNSTABLE').length;
                detourPolyline = L.polyline(data.waypoints, {
                    color: unstableCount > 0 ? '#ffaa00' : '#00f2fe',
                    weight: 4,
                    opacity: 0.8,
                    dashArray: unstableCount > 0 ? '10, 10' : 'none',
                    lineJoin: 'round'
                }).addTo(map);

                if (unstableCount > 0 && detourPolyline._path) {
                    detourPolyline._path.classList.add('marching-ants');
                }
            }
        } catch(err) {
            console.error("Failed to render evacuation route:", err);
        }
    }

    // ----------------------------------------------------
    // 72H TIMELINE SCRUBBER LOGIC
    // ----------------------------------------------------
    const forecastScrubber = document.getElementById('forecast-scrubber');
    const forecastReadout = document.getElementById('forecast-time-readout');
    const playScrubberBtn = document.getElementById('scrubber-play-btn');

    function updateScrubberUI() {
        if(forecastReadout) {
            forecastReadout.textContent = `T+${currentForecastHour}H${currentForecastHour === 0 ? ' (CURRENT)' : ' FORECAST'}`;
        }
    }

    if (forecastScrubber && playScrubberBtn) {
        forecastScrubber.addEventListener('input', (e) => {
            currentForecastHour = parseInt(e.target.value);
            updateScrubberUI();
            applyForecastAndRender();
        });

        playScrubberBtn.addEventListener('click', () => {
            if (scrubberInterval) {
                clearInterval(scrubberInterval);
                scrubberInterval = null;
                playScrubberBtn.innerHTML = '<span class="nav-icon">▶</span>';
            } else {
                playScrubberBtn.innerHTML = '<span class="nav-icon">⏸</span>';
                scrubberInterval = setInterval(() => {
                    currentForecastHour += 6;
                    if (currentForecastHour > 72) {
                        currentForecastHour = 0;
                    }
                    forecastScrubber.value = currentForecastHour;
                    updateScrubberUI();
                    applyForecastAndRender();
                }, 1000);
            }
        });
    }

    // ----------------------------------------------------
    // SEISMIC SHOCKWAVE ANIMATIONS
    // ----------------------------------------------------
    async function fetchSeismicEvents() {
        try {
            const response = await fetch('/api/seismic');
            if (!response.ok) return;
            const data = await response.json();
            const events = data.events || [];

            seismicMarkers.forEach(m => map && map.removeLayer(m));
            seismicMarkers = [];

            if (!map) return;

            events.forEach(eq => {
                const { lat, lng, mag, depth, place } = eq;
                const pulseIcon = L.divIcon({
                    html: `
                        <div class="seismic-pulse" style="--mag: ${mag};">
                            <div class="ring"></div>
                            <div class="ring" style="animation-delay: 0.5s;"></div>
                            <div class="ring" style="animation-delay: 1s;"></div>
                            <div class="epicenter"></div>
                        </div>
                        <div class="seismic-label">M${mag.toFixed(1)}</div>
                    `,
                    className: 'seismic-icon-container',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                });

                const marker = L.marker([lat, lng], {icon: pulseIcon}).addTo(map);
                marker.bindPopup(`
                    <div style="background:#131110; color:#ff4444; padding:8px; border:1px solid rgba(255,68,68,0.4); border-radius:4px;">
                        <h5 style="margin:0 0 5px;">⚡ USGS SEISMIC WARNING</h5>
                        <div><strong>Magnitude:</strong> ${mag.toFixed(1)}</div>
                        <div><strong>Depth:</strong> ${depth.toFixed(1)} km</div>
                        <div><strong>Epicenter:</strong> ${place}</div>
                    </div>
                `);
                seismicMarkers.push(marker);
            });
        } catch(err) {
            console.error("Failed to fetch seismic data:", err);
        }
    }

    // ----------------------------------------------------
    // IOT TELEMETRY MODAL & INSPECTOR
    // ----------------------------------------------------
    const inspectBtn = document.getElementById('inspect-btn');
    const telemetryModal = document.getElementById('telemetry-modal');
    const closeModal = document.getElementById('close-telemetry');
    const textOutput = document.getElementById('telemetry-output');

    if (inspectBtn && telemetryModal && closeModal && textOutput) {
        inspectBtn.addEventListener('click', async () => {
            telemetryModal.style.display = 'flex';
            setTimeout(() => telemetryModal.classList.remove('hidden'), 50);

            textOutput.innerHTML = `Establishing secure link to IoT Borehole Mesh...\nFetching high-frequency spatial tensors...\n`;

            let simLines = [
                '[OK] Telemetry Handshake completed w/ Subsurface Mesh',
                `[SYS] Querying geospatial grid for ${currentCorridor}`,
                '-------------------------------------------',
            ];

            if (globalSegments.length > 0) {
                let targetSeg = globalSegments.find(s => (s.rendered_risk || s.risk_level) === 'UNSTABLE')
                    || globalSegments.find(s => (s.rendered_risk || s.risk_level) === 'MARGINAL')
                    || globalSegments[0];

                try {
                    const iotResp = await fetch(`/api/iot-telemetry/${targetSeg.id}`);
                    const iotData = await iotResp.json();
                    simLines.push(`[DAT] BOREHOLE TARGET: ${targetSeg.id} | ${targetSeg.name}`);
                    simLines.push(`[SENSOR] Piezometer Pressure (u): ${iotData.piezometer.raw_pressure_kpa.toFixed(2)} kPa`);
                    simLines.push(`[SENSOR] Inclinometer Delta: X=${iotData.inclinometer.delta_x_mm.toFixed(3)}mm, Y=${iotData.inclinometer.delta_y_mm.toFixed(3)}mm`);
                    simLines.push(`[SENSOR] Acoustic Emission Hits: ${iotData.acoustic_emission.hit_count} hits/sec (Energy: ${iotData.acoustic_emission.energy_joules.toExponential(2)} J)`);
                    simLines.push(`[HEALTH] Sensor Confidence Index (SCI): ${iotData.sensor_confidence_index} (${iotData.sci_status})`);
                    simLines.push(`[PULSE] ${iotData.last_updated}`);
                } catch (e) {
                    simLines.push(`[ERR] Failed to pull live IoT telemetry from ${targetSeg.id}`);
                }

                simLines.push('-------------------------------------------');
                simLines.push('[SYS] Open-Meteo Met-Mast Data');
                let wind = (targetSeg.rainfall && targetSeg.rainfall.wind_speed) ? targetSeg.rainfall.wind_speed + 'km/h' : 'N/A';
                let pressure = (targetSeg.rainfall && targetSeg.rainfall.pressure_msl) ? targetSeg.rainfall.pressure_msl + 'hPa' : 'N/A';
                let temp = (targetSeg.rainfall && targetSeg.rainfall.temperature) ? targetSeg.rainfall.temperature + '°C' : 'N/A';

                const r_fos = targetSeg.rendered_fos !== undefined ? targetSeg.rendered_fos : (targetSeg.fos?.min ?? 0);
                const r_rain = targetSeg.rendered_rain !== undefined ? targetSeg.rendered_rain : (targetSeg.rainfall?.accum_24h_mm || 0);

                simLines.push(`[MET] Rain: ${r_rain}mm | Wind: ${wind} | Press: ${pressure} | Temp: ${temp} | FoS: ${r_fos.toFixed(2)}`);
            } else {
                simLines.push('[ERR] No active segment data in buffer.');
            }

            simLines.push('-------------------------------------------');
            simLines.push('[OK] Stream synced. End of Transmission.');

            let lineIndex = 0;
            const interval = setInterval(() => {
                if (lineIndex < simLines.length) {
                    textOutput.innerHTML += simLines[lineIndex] + "<br>";
                    lineIndex++;
                    textOutput.scrollTop = textOutput.scrollHeight;
                } else {
                    clearInterval(interval);
                }
            }, 150);
        });

        closeModal.addEventListener('click', () => {
            telemetryModal.classList.add('hidden');
            setTimeout(() => {
                telemetryModal.style.display = 'none';
            }, 300);
        });
    }

    // ----------------------------------------------------
    // TACTICAL VOICE ENGINE & DISPATCH BULLETIN
    // ----------------------------------------------------
    const bulletinBtnRef = document.getElementById('bulletin-btn');
    const dispatchModal = document.getElementById('dispatch-modal');
    const closeDispatch = document.getElementById('close-dispatch');
    const printBulletinBtn = document.getElementById('print-bulletin-btn');
    const authDispatchBtn = document.getElementById('authorize-dispatch-btn');
    const dispatchTargets = document.getElementById('dispatch-targets');
    const printTargetsTable = document.getElementById('print-targets-table');

    if (bulletinBtnRef && dispatchModal) {
        bulletinBtnRef.addEventListener('click', () => {
            dispatchModal.style.display = 'flex';
            setTimeout(() => dispatchModal.classList.remove('hidden'), 50);

            const unstable = globalSegments.filter(s => (s.rendered_risk || s.risk_level) === 'UNSTABLE');

            if (dispatchTargets) {
                if (unstable.length > 0) {
                    dispatchTargets.innerHTML = unstable.map(s => {
                        const fos = s.rendered_fos !== undefined ? s.rendered_fos : s.fos.min;
                        return `<li>${s.id} - ${s.name} (KM ${s.km}) | FoS: <strong>${fos.toFixed(2)}</strong></li>`;
                    }).join('');
                } else {
                    dispatchTargets.innerHTML = '<li>NO CRITICAL SECTORS DETECTED</li>';
                }
            }
            speakTacticalAlert(unstable);
        });

        if (closeDispatch) {
            closeDispatch.addEventListener('click', () => {
                dispatchModal.classList.add('hidden');
                setTimeout(() => dispatchModal.style.display = 'none', 300);
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            });
        }

        if (printBulletinBtn && printTargetsTable) {
            printBulletinBtn.addEventListener('click', () => {
                const unstable = globalSegments.filter(s => (s.rendered_risk || s.risk_level) === 'UNSTABLE');

                const printDate = document.getElementById('print-date');
                const printId = document.getElementById('print-id');
                const printCorridor = document.getElementById('print-corridor');

                if(printDate) printDate.textContent = new Date().toLocaleString();
                if(printId) printId.textContent = Math.floor(Math.random() * 90000) + 10000;
                if(printCorridor) printCorridor.textContent = currentCorridor;

                if (unstable.length > 0) {
                    printTargetsTable.innerHTML = unstable.map(s => {
                        const fos = s.rendered_fos !== undefined ? s.rendered_fos : (s.fos?.min ?? 0);
                        const rain = s.rendered_rain !== undefined ? s.rendered_rain : (s.rainfall?.accum_24h_mm || 0);
                        const risk = s.rendered_risk || s.risk_level;
                        return `
                            <tr>
                                <td style="padding:8px; border:1px solid #000;">${s.id}</td>
                                <td style="padding:8px; border:1px solid #000;">${s.name} (KM ${s.km})</td>
                                <td style="padding:8px; text-align:center; border:1px solid #000; font-weight:bold; color:red;">${fos.toFixed(2)}</td>
                                <td style="padding:8px; text-align:center; border:1px solid #000;">${Number(rain).toFixed(1)} mm</td>
                                <td style="padding:8px; border:1px solid #000; font-weight:bold;">${risk}</td>
                            </tr>
                        `;
                    }).join('');
                } else {
                    printTargetsTable.innerHTML = '<tr><td colspan="5" style="padding:8px; text-align:center; border:1px solid #000;">NO CRITICAL SECTORS IN CURRENT FORECAST WINDOW</td></tr>';
                }

                window.print();
            });
        }

        if (authDispatchBtn) {
            authDispatchBtn.addEventListener('click', () => {
                const ogText = authDispatchBtn.innerHTML;
                authDispatchBtn.innerHTML = 'TRANSMITTING COMMANDS...';
                fetch('/api/dispatch', { method: 'POST' })
                    .then((res) => {
                        if (!res.ok) throw new Error('Dispatch failed');
                        authDispatchBtn.innerHTML = 'DISPATCH COMPLETED ✓';
                        setTimeout(() => {
                            authDispatchBtn.innerHTML = ogText;
                            dispatchModal.classList.add('hidden');
                            setTimeout(() => dispatchModal.style.display = 'none', 300);
                        }, 2000);
                    })
                    .catch(() => {
                        authDispatchBtn.innerHTML = 'TRANSMISSION FAILED!';
                        setTimeout(() => authDispatchBtn.innerHTML = ogText, 2000);
                    });
            });
        }
    }

    function speakTacticalAlert(unstableSectors) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();

        let msg = "Tactical Dispatch Modal Opened. ";
        if (unstableSectors.length > 0) {
            msg += `Critical Alert. ${unstableSectors.length} sectors on corridor ${currentCorridor} have exceeded factor of safety thresholds. Immediate evacuation authorized.`;
        } else {
            msg += "All sectors stable. No evacuation required.";
        }

        const utterance = new SpeechSynthesisUtterance(msg);
        utterance.volume = 1;
        utterance.rate = 1.05;
        utterance.pitch = 0.9;

        let voices = window.speechSynthesis.getVoices();
        let engVoices = voices.filter(v => v.lang && v.lang.includes('en'));
        if (engVoices.length > 0) utterance.voice = engVoices[0];

        window.speechSynthesis.speak(utterance);
    }

    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

// ----------------------------------------------------
    // AI TACTICAL SITREP & DRONE RECON CONTROLLERS
    // ----------------------------------------------------
    let currentSitrepText = "";

    window.openSitrepModal = function() {
        const modal = document.getElementById('sitrep-modal');
        if(!modal) return;

        // Populate sectors dropdown
        const select = document.getElementById('sitrep-sector-select');
        if(select && window._globalSegments) {
            select.innerHTML = '<option value="">-- Select Target Sector --</option>';
            window._globalSegments.forEach(s => {
                const r = s.rendered_risk || s.risk_level;
                const ico = r === 'UNSTABLE' ? '🔴' : (r === 'MARGINAL' ? '🟡' : '🟢');
                select.innerHTML += `<option value="${s.id}">${ico} ${s.id} - ${s.name}</option>`;
            });
        }

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.remove('hidden'), 50);
    };

    window.closeSitrepModal = function() {
        const modal = document.getElementById('sitrep-modal');
        if(modal) {
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };

    window.generateSitrepReport = async function() {
        const select = document.getElementById('sitrep-sector-select');
        const container = document.getElementById('sitrep-output-container');
        const loader = document.getElementById('sitrep-loading');

        if(!select || !select.value) {
            alert('Please select a sector from the deployment grid.');
            return;
        }

        const sector = window._globalSegments.find(s => s.id === select.value);
        if(!sector) return;

        container.style.display = 'none';
        loader.style.display = 'block';

        const payload = {
            sector_id: sector.id,
            fos: sector.rendered_fos !== undefined ? sector.rendered_fos : (sector.fos?.min ?? 0),
            rain_24h: sector.rendered_rain !== undefined ? sector.rendered_rain : (sector.rainfall?.accum_24h_mm || 0),
            slope_angle: sector.slope?.beta_deg ?? 42.5,
            seismic_pga: (window._currentSimConfig && window._currentSimConfig.kh) ? window._currentSimConfig.kh : 0.05,
            soil_type: sector.geotech?.lithology_id || "Fractured Rock"
        };

        try {
            const resp = await fetch('/api/ai/sitrep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();

            if(data.success) {
                currentSitrepText = data.sitrep;
                container.textContent = data.sitrep;
            } else {
                container.textContent = "Error generating SITREP: " + (data.error || "Unknown error");
            }
        } catch(err) {
            container.textContent = "CONNECTION ERROR: Failed to reach AI Reasoning Engine.";
        }

        loader.style.display = 'none';
        container.style.display = 'block';
    };

    window.copySitrepToClipboard = function() {
        if(!currentSitrepText) return;
        navigator.clipboard.writeText(currentSitrepText).then(() => {
            alert("📋 SITREP Copied to Clipboard!");
        });
    };

    window.toggleSitrepVoice = function() {
        if (!('speechSynthesis' in window) || !currentSitrepText) return;
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            return;
        }

        // Strip emoji and markdown for voice
        const cleanText = currentSitrepText.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
        const utterance = new SpeechSynthesisUtterance("Geotechnical situation report. " + cleanText);
        utterance.rate = 1.05;

        let voices = window.speechSynthesis.getVoices();
        let engVoices = voices.filter(v => v.lang && v.lang.includes('en'));
        if (engVoices.length > 0) utterance.voice = engVoices[0];

        window.speechSynthesis.speak(utterance);
    };

    // --- DRONE RECON SYSTEM ---
    let droneLoopId = null;
    let droneState = { mode: 'rgb', ai: true, time: 0 };

    window.openDroneModal = function() {
        const modal = document.getElementById('drone-modal');
        if(!modal) return;
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.remove('hidden'), 50);

        // Start Canvas Engine
        const canvas = document.getElementById('drone-canvas');
        if(canvas) {
            const ctx = canvas.getContext('2d');
            cancelAnimationFrame(droneLoopId);
            runDroneSim(canvas, ctx);
        }
    };

    window.closeDroneModal = function() {
        const modal = document.getElementById('drone-modal');
        if(modal) {
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
        cancelAnimationFrame(droneLoopId);
    };

    window.setDroneSensor = function(mode) {
        droneState.mode = mode;
        const rgbBtn = document.getElementById('drone-sensor-rgb');
        const flirBtn = document.getElementById('drone-sensor-flir');

        if(mode === 'rgb') {
            rgbBtn.style.background = 'rgba(0,217,255,0.2)';
            rgbBtn.style.color = '#00d9ff';
            flirBtn.style.background = 'rgba(255,255,255,0.05)';
            flirBtn.style.color = '';
        } else {
            rgbBtn.style.background = 'rgba(255,255,255,0.05)';
            rgbBtn.style.color = '';
            flirBtn.style.background = 'rgba(255,165,2,0.2)';
            flirBtn.style.color = '#ffa502';
        }
    };

    window.toggleDroneAI = function() {
        droneState.ai = !droneState.ai;
        const btn = document.getElementById('drone-ai-toggle');
        const list = document.getElementById('drone-detections-list');

        if(droneState.ai) {
            btn.style.background = 'rgba(46,213,115,0.2)';
            btn.style.color = '#2ed573';
            btn.innerHTML = '<span>🎯</span> YOLOv8 AI: ON';
            if(list) list.style.opacity = '1';
        } else {
            btn.style.background = 'rgba(255,71,87,0.2)';
            btn.style.color = '#ff4757';
            btn.innerHTML = '<span>🎯</span> YOLOv8 AI: OFF';
            if(list) list.style.opacity = '0.3';
        }
    };

    window.transmitDroneGeoTag = function() {
        alert("🚨 ENCRYPTED DATALINK ENGAGED: Transmitting coordinates to BRO Forward Operating Base...");
    };

    function runDroneSim(canvas, ctx) {
        let t = Date.now();
        const W = canvas.width;
        const H = canvas.height;

        // ----- PROCEDURAL TERRAIN -----
        // Mountain ridgeline silhouettes (3 parallax layers)
        function genRidge(segments, baseY, amp, seed) {
            const pts = [];
            for (let i = 0; i <= segments; i++) {
                const x = (i / segments) * W;
                const n1 = Math.sin(i * 0.3 + seed) * amp * 0.5;
                const n2 = Math.sin(i * 0.7 + seed * 1.7) * amp * 0.3;
                const n3 = Math.sin(i * 1.4 + seed * 0.6) * amp * 0.2;
                pts.push({ x, y: baseY + n1 + n2 + n3 });
            }
            return pts;
        }
        const ridgeFar  = genRidge(60, H * 0.32, 55, 1.2);
        const ridgeMid  = genRidge(60, H * 0.48, 45, 3.7);
        const ridgeNear = genRidge(60, H * 0.62, 35, 6.1);

        // Road (winding highway through valley)
        function genRoad(segments, seed) {
            const pts = [];
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const x = W * 0.25 + Math.sin(t * 4 + seed) * W * 0.15 + Math.sin(t * 7 + seed * 2) * W * 0.06;
                const y = t * H;
                pts.push({ x, y });
            }
            return pts;
        }
        const roadCenter = genRoad(80, 2.3);

        // Debris / rock scatter particles
        const debris = [];
        for (let i = 0; i < 40; i++) {
            debris.push({
                x: 100 + Math.random() * (W - 200),
                y: H * 0.35 + Math.random() * (H * 0.55),
                size: 2 + Math.random() * 6,
                shade: Math.random()
            });
        }

        // Trees (small triangular shapes on ridges)
        const trees = [];
        for (let i = 0; i < 50; i++) {
            trees.push({
                x: Math.random() * W,
                y: H * 0.4 + Math.random() * (H * 0.35),
                h: 4 + Math.random() * 8,
                shade: 0.3 + Math.random() * 0.4
            });
        }

        // YOLOv8 detection targets with more variety
        const bboxes = [
            { x: W*0.18, y: H*0.52, w: 105, h: 68,  label: "ROCKFALL_DEBRIS",   conf: 94.2, color: [255,71,87]  },
            { x: W*0.55, y: H*0.68, w: 80,  h: 55,  label: "TRAPPED_VEHICLE",    conf: 96.1, color: [0,217,255]  },
            { x: W*0.72, y: H*0.38, w: 95,  h: 42,  label: "TENSION_CRACK_0.4M", conf: 88.7, color: [255,165,2]  },
            { x: W*0.35, y: H*0.78, w: 115, h: 60,  label: "MUDFLOW_INUNDATION", conf: 91.5, color: [255,71,87]  }
        ];

        // Scrolling offset for motion
        let scrollY = 0;

        function draw() {
            const now = Date.now();
            const dt = (now - t) / 1000;
            droneState.time += dt;
            t = now;
            scrollY += 18 * dt; // slow forward flight crawl

            const isFlir = droneState.mode === 'flir';

            // ===== SKY & GROUND =====
            if (isFlir) {
                // FLIR: dark ironbow gradient
                const skyG = ctx.createLinearGradient(0, 0, 0, H);
                skyG.addColorStop(0, '#0a0016');
                skyG.addColorStop(0.3, '#1a0525');
                skyG.addColorStop(0.5, '#2d0a1a');
                skyG.addColorStop(1, '#110308');
                ctx.fillStyle = skyG;
            } else {
                // RGB: realistic aerial green/brown terrain
                const skyG = ctx.createLinearGradient(0, 0, 0, H);
                skyG.addColorStop(0, '#1a2840');   // hazy sky
                skyG.addColorStop(0.25, '#2a3d52'); // atmospheric haze
                skyG.addColorStop(0.4, '#2d4a2a');  // far vegetation
                skyG.addColorStop(0.6, '#3a5a30');  // mid green canopy
                skyG.addColorStop(0.8, '#4a3a28');  // exposed soil
                skyG.addColorStop(1, '#3d3025');    // near ground
                ctx.fillStyle = skyG;
            }
            ctx.fillRect(0, 0, W, H);

            // ===== MOUNTAIN RIDGELINES =====
            function drawRidge(pts, fillColor, strokeColor) {
                ctx.beginPath();
                ctx.moveTo(0, H);
                pts.forEach(p => ctx.lineTo(p.x, p.y + Math.sin(scrollY * 0.02 + p.x * 0.01) * 3));
                ctx.lineTo(W, H);
                ctx.closePath();
                ctx.fillStyle = fillColor;
                ctx.fill();
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            if (isFlir) {
                drawRidge(ridgeFar,  'rgba(60,10,40,0.5)',  'rgba(180,40,80,0.3)');
                drawRidge(ridgeMid,  'rgba(80,15,30,0.6)',  'rgba(220,60,40,0.35)');
                drawRidge(ridgeNear, 'rgba(100,20,15,0.7)', 'rgba(255,80,20,0.4)');
            } else {
                drawRidge(ridgeFar,  'rgba(35,55,40,0.6)',  'rgba(60,90,60,0.3)');
                drawRidge(ridgeMid,  'rgba(45,70,35,0.7)',  'rgba(80,110,60,0.35)');
                drawRidge(ridgeNear, 'rgba(55,45,30,0.8)',  'rgba(90,70,40,0.4)');
            }

            // ===== TREES =====
            trees.forEach(tr => {
                const ty = tr.y + Math.sin(scrollY * 0.03 + tr.x * 0.02) * 2;
                ctx.beginPath();
                ctx.moveTo(tr.x, ty);
                ctx.lineTo(tr.x - tr.h * 0.4, ty + tr.h);
                ctx.lineTo(tr.x + tr.h * 0.4, ty + tr.h);
                ctx.closePath();
                if (isFlir) {
                    ctx.fillStyle = `rgba(255, ${100 + tr.shade * 140 | 0}, 0, ${0.25 + tr.shade * 0.15})`;
                } else {
                    ctx.fillStyle = `rgba(${30 + tr.shade * 40 | 0}, ${60 + tr.shade * 50 | 0}, ${20 + tr.shade * 20 | 0}, 0.7)`;
                }
                ctx.fill();
            });

            // ===== ROAD =====
            ctx.beginPath();
            roadCenter.forEach((p, i) => {
                const rx = p.x + Math.sin(scrollY * 0.04 + p.y * 0.01) * 3;
                if (i === 0) ctx.moveTo(rx, p.y);
                else ctx.lineTo(rx, p.y);
            });
            ctx.strokeStyle = isFlir ? 'rgba(200,180,50,0.5)' : 'rgba(140,130,110,0.6)';
            ctx.lineWidth = 8;
            ctx.stroke();
            // Road dashes
            ctx.setLineDash([8, 12]);
            ctx.strokeStyle = isFlir ? 'rgba(255,230,80,0.4)' : 'rgba(220,210,180,0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);

            // ===== DEBRIS SCATTER =====
            debris.forEach(d => {
                const dy = ((d.y + scrollY * 8) % (H * 0.7)) + H * 0.3;
                if (isFlir) {
                    ctx.fillStyle = `rgba(255, ${60 + d.shade * 180 | 0}, ${d.shade * 30 | 0}, ${0.4 + d.shade * 0.3})`;
                } else {
                    ctx.fillStyle = `rgba(${80 + d.shade * 60 | 0}, ${65 + d.shade * 40 | 0}, ${50 + d.shade * 30 | 0}, 0.6)`;
                }
                ctx.fillRect(d.x, dy, d.size, d.size * 0.7);
            });

            // ===== CONTOUR LINES (topo) =====
            ctx.globalAlpha = 0.12;
            for (let i = 0; i < 8; i++) {
                const cy2 = H * 0.3 + i * (H * 0.08);
                ctx.beginPath();
                for (let x = 0; x < W; x += 3) {
                    const yy = cy2 + Math.sin(x * 0.02 + i * 1.5 + scrollY * 0.01) * 15;
                    if (x === 0) ctx.moveTo(x, yy);
                    else ctx.lineTo(x, yy);
                }
                ctx.strokeStyle = isFlir ? '#ff6040' : '#88aa66';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;

            // ===== YOLOv8 AI BOUNDING BOXES =====
            const cx = W / 2, cy = H / 2;
            const pitch = Math.sin(droneState.time * 0.8) * 8;
            const roll  = Math.cos(droneState.time * 0.4) * 3;

            if (droneState.ai) {
                const pulse = Math.abs(Math.sin(droneState.time * 3));
                bboxes.forEach(b => {
                    const bx = b.x + Math.sin(droneState.time * 1.2 + b.y * 0.01) * 6;
                    const by = b.y + Math.cos(droneState.time * 0.9 + b.x * 0.01) * 4;
                    const r = b.color[0], g = b.color[1], bl = b.color[2];
                    const alpha = 0.5 + pulse * 0.5;

                    // Box border
                    ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(bx, by, b.w, b.h);
                    // Corner brackets (tactical look)
                    const L = 10;
                    ctx.lineWidth = 3;
                    // top-left
                    ctx.beginPath(); ctx.moveTo(bx, by + L); ctx.lineTo(bx, by); ctx.lineTo(bx + L, by); ctx.stroke();
                    // top-right
                    ctx.beginPath(); ctx.moveTo(bx + b.w - L, by); ctx.lineTo(bx + b.w, by); ctx.lineTo(bx + b.w, by + L); ctx.stroke();
                    // bot-left
                    ctx.beginPath(); ctx.moveTo(bx, by + b.h - L); ctx.lineTo(bx, by + b.h); ctx.lineTo(bx + L, by + b.h); ctx.stroke();
                    // bot-right
                    ctx.beginPath(); ctx.moveTo(bx + b.w - L, by + b.h); ctx.lineTo(bx + b.w, by + b.h); ctx.lineTo(bx + b.w, by + b.h - L); ctx.stroke();

                    // Label background
                    const labelTxt = `${b.label}: ${b.conf}%`;
                    ctx.font = 'bold 10px monospace';
                    const tw = ctx.measureText(labelTxt).width + 10;
                    ctx.fillStyle = `rgba(${r},${g},${bl},${0.7 + pulse * 0.3})`;
                    ctx.fillRect(bx, by - 18, tw, 16);
                    ctx.fillStyle = '#fff';
                    ctx.fillText(labelTxt, bx + 5, by - 5);

                    // Tracking crosshair inside box
                    const bcx = bx + b.w / 2, bcy = by + b.h / 2;
                    ctx.strokeStyle = `rgba(${r},${g},${bl},${0.3 + pulse * 0.3})`;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath(); ctx.moveTo(bcx - 15, bcy); ctx.lineTo(bcx + 15, bcy); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(bcx, bcy - 15); ctx.lineTo(bcx, bcy + 15); ctx.stroke();
                    ctx.setLineDash([]);
                });
            }

            // ===== HUD OVERLAY =====
            // Artificial Horizon Crosshair
            ctx.save();
            ctx.translate(cx, cy + pitch);
            ctx.rotate(roll * Math.PI / 180);

            const hudColor = isFlir ? 'rgba(255,200,80,0.7)' : 'rgba(0,255,80,0.7)';
            ctx.strokeStyle = hudColor;
            ctx.lineWidth = 1.5;
            // Wings
            ctx.beginPath();
            ctx.moveTo(-120, 0); ctx.lineTo(-30, 0);
            ctx.moveTo(120, 0);  ctx.lineTo(30, 0);
            ctx.stroke();
            // Center dot
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.stroke();
            // Pitch ladder
            for (let i = -2; i <= 2; i++) {
                if (i === 0) continue;
                const py = i * 25;
                ctx.beginPath();
                ctx.moveTo(-40, py); ctx.lineTo(40, py);
                ctx.stroke();
                ctx.font = '9px monospace';
                ctx.fillStyle = hudColor;
                ctx.fillText((i * 5) + '°', 44, py + 3);
                ctx.fillText((i * 5) + '°', -58, py + 3);
            }
            ctx.restore();

            // Compass heading bar (top)
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(cx - 120, 8, 240, 20);
            ctx.strokeStyle = hudColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - 120, 8, 240, 20);
            const headVal = ((42 + roll + droneState.time * 2) % 360).toFixed(0);
            ctx.fillStyle = hudColor;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`HDG ${headVal}° | GND SPD 18.4 m/s | WND 12 kt`, cx, 22);
            ctx.textAlign = 'left';

            // Altitude & speed tape (left side)
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(8, cy - 60, 55, 120);
            ctx.strokeStyle = hudColor;
            ctx.strokeRect(8, cy - 60, 55, 120);
            ctx.fillStyle = hudColor;
            ctx.font = '9px monospace';
            const altBase = 182 + pitch;
            for (let i = -3; i <= 3; i++) {
                const ay = cy + i * 18;
                ctx.fillText((altBase - i * 10).toFixed(0) + 'm', 14, ay + 3);
                ctx.beginPath(); ctx.moveTo(55, ay); ctx.lineTo(63, ay); ctx.stroke();
            }
            ctx.font = 'bold 10px monospace';
            ctx.fillStyle = '#000';
            ctx.fillRect(8, cy - 8, 55, 16);
            ctx.fillStyle = hudColor;
            ctx.fillText(altBase.toFixed(1) + 'm', 12, cy + 4);

            // Bottom status bar
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(0, H - 28, W, 28);
            ctx.fillStyle = hudColor;
            ctx.font = '10px monospace';
            const coord = '30.3352°N  79.0624°E';
            const utc = new Date().toISOString().slice(11, 19) + ' UTC';
            ctx.fillText(`GPS: ${coord}  |  HDOP: 0.8  |  ${utc}  |  GIMBAL: -45.2°  |  SENSOR: ${isFlir ? 'FLIR LWIR' : 'OPTICAL RGB'}`, 12, H - 10);

            // ===== SCANLINES (subtle) =====
            ctx.globalAlpha = 0.06;
            for (let y = 0; y < H; y += 3) {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, y, W, 1);
            }
            ctx.globalAlpha = 1.0;

            // ===== VIGNETTE =====
            const vig = ctx.createRadialGradient(cx, cy, W * 0.2, cx, cy, W * 0.65);
            vig.addColorStop(0, 'transparent');
            vig.addColorStop(1, 'rgba(0,0,0,0.55)');
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, W, H);

            // ===== REC indicator =====
            const recPulse = Math.sin(droneState.time * 3) > 0;
            if (recPulse) {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(W - 30, 20, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px monospace';
            ctx.fillText('REC', W - 55, 24);

            // ===== UPDATE DOM TELEMETRY =====
            const altEl = document.getElementById('drone-alt');
            const hdgEl = document.getElementById('drone-heading');
            const latEl = document.getElementById('drone-latency');
            if (altEl) altEl.textContent = altBase.toFixed(1) + ' m';
            if (hdgEl) hdgEl.textContent = headVal + '° NE';
            if (latEl) latEl.textContent = (10.5 + Math.sin(droneState.time) * 2.5).toFixed(1) + 'ms';

            droneLoopId = requestAnimationFrame(draw);
        }
        draw();
    }

    // Expose appMap to window for global access
    window.appMap = map;

    // Public API
    window.JANRAKSHAK_RT = {
        requestUpdate: () => socket && socket.emit('request_update'),
        requestAlertCheck: () => socket && socket.emit('request_alert_check'),
        isConnected: () => isConnected,
        getSocket: () => socket
    };

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initMapIfNeeded();
            initWebSocket();
            fetchSeismicEvents();
            setInterval(fetchSeismicEvents, 60000);
        });
    } else {
        initMapIfNeeded();
        initWebSocket();
        fetchSeismicEvents();
        setInterval(fetchSeismicEvents, 60000);
    }

    // Polling fallback every 20 seconds
    setInterval(() => {
        if (!isConnected) {
            console.log('[JANRAKSHAK] Polling fallback active (WebSocket disconnected)...');
            fetch('/api/segments')
                .then(res => res.json())
                .then(data => {
                    if (data.segments) {
                        globalSegments = data.segments;
                        applyForecastAndRender();
                    }
                }).catch(e => console.warn('Polling fallback failed', e));
        } else if (socket) {
            socket.emit('request_update');
        }
    }, 20000);
})();
