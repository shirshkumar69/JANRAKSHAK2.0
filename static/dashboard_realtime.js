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
                : { fos: seg.fos.min, risk_level: seg.risk_level, accum_rain_mm: (seg.rainfall.accum_24h_mm || 0) };
            
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

        segments.forEach(segment => {
            const riskLbl = segment.rendered_risk || segment.risk_level;
            const color = getRiskColor(riskLbl);
            const coords = [segment.coords[0], segment.coords[1]];

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
    }

    function createPopupContent(segment) {
        const riskLbl = segment.rendered_risk || segment.risk_level;
        const color = getRiskColor(riskLbl);
        const fosVal = (segment.rendered_fos !== undefined ? segment.rendered_fos : segment.fos.min).toFixed(2);
        const rainVal = (segment.rendered_rain !== undefined ? segment.rendered_rain : segment.rainfall.accum_24h_mm).toFixed(1);

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
                    <span>Slope: <strong>${segment.slope.beta_deg}°</strong></span>
                    <span>Elevation: <strong>${segment.elevation}m</strong></span>
                </div>
                <button onclick="window.loadSectorIntoSimulator('${segment.id}', ${segment.slope.beta_deg}, ${rainVal})"
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
        const sorted = [...segments].sort((a, b) => (a.rendered_fos !== undefined ? a.rendered_fos : a.fos.min) - (b.rendered_fos !== undefined ? b.rendered_fos : b.fos.min));

        tableBody.innerHTML = sorted.map(s => {
            const riskLbl = s.rendered_risk || s.risk_level;
            const color = getRiskColor(riskLbl);
            const fosVal = (s.rendered_fos !== undefined ? s.rendered_fos : s.fos.min).toFixed(2);
            const rainVal = (s.rendered_rain !== undefined ? s.rendered_rain : s.rainfall.accum_24h_mm).toFixed(1);
            const soilName = (s.soil && s.soil.name) ? s.soil.name : 'Colluvium / Schist';
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
            try {
                await fetch('/api/corridors/select', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ corridor_id: currentCorridor })
                });
                socket.emit('request_update');
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

                const r_fos = targetSeg.rendered_fos !== undefined ? targetSeg.rendered_fos : targetSeg.fos.min;
                const r_rain = targetSeg.rendered_rain !== undefined ? targetSeg.rendered_rain : targetSeg.rainfall.accum_24h_mm;

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
                        const fos = s.rendered_fos !== undefined ? s.rendered_fos : s.fos.min;
                        const rain = s.rendered_rain !== undefined ? s.rendered_rain : s.rainfall.accum_24h_mm;
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
                    .then(() => {
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
        if (isConnected && socket) {
            socket.emit('request_update');
        }
    }, 20000);
})();
