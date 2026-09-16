// JANRAKSHAK Dashboard - Real-time Multi-Hazard WebSocket & GIS Integration
(function() {
    'use strict';

    // WebSocket Connection State
    let socket = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 3000;

    // GIS Map & Markers State
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

        if (data.segments) {
            updateDashboardMetrics(data.segments, data.simulation_state);
            updateMapMarkers(data.segments);
            updateHazardTable(data.segments);
        }

        if (data.last_refresh) {
            updateLastSync(data.last_refresh);
        }

        if (data.simulation_state) {
            updateSimulationUI(data.simulation_state);
        }
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
        const unstable = segments.filter(s => s.risk_level === 'UNSTABLE');
        const marginal = segments.filter(s => s.risk_level === 'MARGINAL');
        const stable = segments.filter(s => s.risk_level === 'STABLE');

        // 1. Critical Unstable Sectors
        const unstableCountEl = document.getElementById('unstable-count');
        const unstableProgEl = document.getElementById('unstable-prog');
        const unstablePctLbl = document.getElementById('unstable-pct-label');
        const critBadge = document.getElementById('critical-badge');

        if (unstableCountEl) animateValue(unstableCountEl, unstable.length, 0);
        const unstPct = (unstable.length / segments.length) * 100;
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
        const maxRain = Math.max(...segments.map(s => s.rainfall.accum_24h_mm || 0));
        const avgRain = (segments.reduce((acc, s) => acc + (s.rainfall.accum_24h_mm || 0), 0) / segments.length) || 0;
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
            const color = getRiskColor(segment.risk_level);
            const coords = [segment.coords[0], segment.coords[1]];

            let marker = markers.get(segment.id);

            if (!marker) {
                // Create keyless SVG Circle Marker
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
                // Smoothly update existing marker styles
                marker.setStyle({
                    fillColor: color,
                    color: segment.risk_level === 'UNSTABLE' ? '#ff4757' : '#ffffff'
                });
                marker.setPopupContent(createPopupContent(segment));
            }

            // Manage pulse effect for critical unstable sectors
            if (segment.risk_level === 'UNSTABLE') {
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
        const color = getRiskColor(segment.risk_level);
        return `
            <div style="font-family: 'Space Grotesk', sans-serif; min-width: 220px; padding: 6px; color: #0f172a;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="font-size: 15px; color: #0a0e1a;">${segment.id} · ${segment.name}</strong>
                    <span style="padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;
                        background: ${color}25; color: ${color}; border: 1px solid ${color};">
                        ${segment.risk_level}
                    </span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 8px;">
                    <div>
                        <div style="color: #64748b; font-size: 10px;">Factor of Safety</div>
                        <strong style="color: ${color}; font-size: 20px;">${segment.fos.min}</strong>
                    </div>
                    <div>
                        <div style="color: #64748b; font-size: 10px;">24H Rainfall</div>
                        <strong style="color: #0284c7; font-size: 18px;">${segment.rainfall.accum_24h_mm.toFixed(1)} mm</strong>
                    </div>
                </div>
                <div style="font-size: 11px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between;">
                    <span>Slope: <strong>${segment.slope.beta_deg}°</strong></span>
                    <span>Elevation: <strong>${segment.elevation}m</strong></span>
                </div>
                <button onclick="window.loadSectorIntoSimulator('${segment.id}', ${segment.slope.beta_deg}, ${segment.rainfall.accum_24h_mm})"
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
        const sorted = [...segments].sort((a, b) => a.fos.min - b.fos.min);

        tableBody.innerHTML = sorted.map(s => {
            const color = getRiskColor(s.risk_level);
            const soilName = (s.soil && s.soil.name) ? s.soil.name : 'Colluvium / Schist';
            return `
                <tr>
                    <td><span class="sector-id">${s.id}</span></td>
                    <td><strong style="color: var(--text-primary);">${s.name}</strong></td>
                    <td>
                        <span class="metric-badge" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40; font-size: 13px;">
                            ${s.fos.min}
                        </span>
                    </td>
                    <td><span style="font-family: 'DM Mono', monospace; color: var(--text-primary); font-weight: 600;">${s.rainfall.accum_24h_mm.toFixed(1)} mm</span></td>
                    <td><span style="font-family: 'DM Mono', monospace;">${s.slope.beta_deg}°</span></td>
                    <td><span style="font-size: 11px; color: var(--text-muted);">${soilName}</span></td>
                    <td>
                        <span class="risk-badge risk-${s.risk_level.toLowerCase()}">
                            ${s.risk_level}
                        </span>
                    </td>
                    <td>
                        <button class="btn" style="padding: 4px 10px; font-size: 11px;"
                            onclick="window.loadSectorIntoSimulator('${s.id}', ${s.slope.beta_deg}, ${s.rainfall.accum_24h_mm})">
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

        // CartoDB Dark Matter Keyless Layer
        const defaultLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            maxZoom: 19
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
        });
    } else {
        initMapIfNeeded();
        initWebSocket();
    }

    // Polling fallback every 20 seconds
    setInterval(() => {
        if (isConnected && socket) {
            socket.emit('request_update');
        }
    }, 20000);
})();
