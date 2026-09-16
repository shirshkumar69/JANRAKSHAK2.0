let allSegments = [];
const rows = document.querySelector('#rows');
const u = document.querySelector('#unstable');
const m = document.querySelector('#marginal');
const uOut = document.querySelector('#unstableOut');
const mOut = document.querySelector('#marginalOut');

// NH-07 Coordinates roughly mapping for S1 to S12 (Rishikesh to Badrinath tracking)
const segmentCoords = {
    'NH07-S01': [30.0869, 78.2676], // Near Rishikesh
    'NH07-S02': [30.1150, 78.4200],
    'NH07-S03': [30.1459, 78.5996], // Devprayag
    'NH07-S04': [30.1800, 78.6900],
    'NH07-S05': [30.2223, 78.7849], // Srinagar
    'NH07-S06': [30.2500, 78.8800],
    'NH07-S07': [30.2844, 78.9811], // Rudraprayag
    'NH07-S08': [30.2700, 79.1000],
    'NH07-S09': [30.2583, 79.2215], // Karnaprayag
    'NH07-S10': [30.4010, 79.3500],
    'NH07-S11': [30.5506, 79.5660], // Joshimath
    'NH07-S12': [30.7433, 79.4938]  // Badrinath
};

// ----------------------------------------------------
// MAP INITIALIZATION (Leaflet + Esri Satellite)
// ----------------------------------------------------
let map = null;
let satelliteLayer = null;
let topoLayer = null;
let standardOSMLayer = null;
let movableMarker = null;

if (typeof L !== 'undefined' && document.getElementById('real-map')) {
    map = L.map('real-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([30.35, 78.9], 9);

    // Add custom zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Define Base Layers
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 17
    });

    topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17
    });

    // We will use OpenStreetMap tiles inverted via CSS for the dark layer to avoid any API key issues
    standardOSMLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17
    });

    // Set default layer
    satelliteLayer.addTo(map);

    // Create custom green dot icon (larger hit area for draggability)
    const greenDotIcon = L.divIcon({
        className: 'custom-drag-icon',
        html: '<div class="pulse-probe"></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    // Place it on the map and make it draggable
    movableMarker = L.marker([30.35, 78.9], {
        icon: greenDotIcon,
        draggable: true,
        autoPan: true
    }).addTo(map);

    movableMarker.on('dragend', async function(event) {
        const coords = movableMarker.getLatLng();
        const lat = coords.lat.toFixed(4);
        const lng = coords.lng.toFixed(4);

        // Show a loading state in the popup
        const popupStyle = `background:#0a0e1c; color:#f0f4f8; padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); width: 180px;`;

        movableMarker.bindPopup(`
            <div style="${popupStyle}">
                <i>Extracting telemetry for <b>${lat}, ${lng}</b>...</i>
            </div>
        `, { className: 'dark-popup' }).openPopup();

        try {
            // Fetch new weather data directly (using open-meteo)
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,temperature_2m,wind_speed_10m&timezone=auto`;

            const response = await fetch(url);
            const data = await response.json();

            const rain = Number(data.current.precipitation || 0).toFixed(1);
            const temp = Number(data.current.temperature_2m || 0).toFixed(1);

            // Update popup with live intelligence
            movableMarker.getPopup().setContent(`
                <div style="${popupStyle}">
                    <h4 style="margin:0 0 5px; color:#00f2fe">GEOSPATIAL PROBE</h4>
                    <div style="font-size:11px; margin-bottom:5px;">LAT: ${lat} | LON: ${lng}</div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span style="color:#8899ac">Rainfall:</span>
                        <strong>${rain} mm</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span style="color:#8899ac">Temp:</span>
                        <strong>${temp} °C</strong>
                    </div>
                    <div style="font-size:9px; color:#536275; margin-top:8px;">*Requires backend sync for FoS</div>
                </div>
            `);
        } catch (err) {
            movableMarker.getPopup().setContent(`
                <div style="${popupStyle}">
                    <span style='color:#ff4757;'>Telemetry link failed.</span>
                </div>
            `);
        }
    });
}

// Map Controls Logic
const btnSat = document.getElementById('btn-sat');
if (btnSat) btnSat.onclick = (e) => setMapLayer(e, satelliteLayer, false);
const btnTopo = document.getElementById('btn-topo');
if (btnTopo) btnTopo.onclick = (e) => setMapLayer(e, topoLayer, false);
const btnDark = document.getElementById('btn-dark');
if (btnDark) btnDark.onclick = (e) => setMapLayer(e, standardOSMLayer, true);

function setMapLayer(btnEvent, layer, isDark) {
    if (!map || !layer) return;
    document.querySelectorAll('.map-btn').forEach(b => b.classList.remove('selected'));
    if (btnEvent && btnEvent.target) {
        btnEvent.target.classList.add('selected');
    }

    const realMapEl = document.getElementById('real-map');
    if (realMapEl) {
        if (isDark) {
            realMapEl.classList.add('tactical-dark');
        } else {
            realMapEl.classList.remove('tactical-dark');
        }
    }

    map.eachLayer((l) => map.removeLayer(l));
    layer.addTo(map);

    // Re-add markers
    renderMarkers();
    if (movableMarker) movableMarker.addTo(map);
}

let mapMarkers = [];

// Fetch live data from backend
async function fetchSegments() {
    try {
        const response = await fetch('/api/segments');
        if (response.ok) {
            const data = await response.json();
            allSegments = data.segments;

            // Sync thresholds from initial load
            if (data.thresholds) {
                if (u) u.value = data.thresholds.unstable;
                if (m) m.value = data.thresholds.marginal;
                sync();
            }

            render();
            renderMarkers(); // Update Map 3D Markers
            updateStats();
            updateTicker(); // Live ticker update
        }
    } catch (e) {
        console.error("Failed to load segments:", e);
        if (rows) {
            rows.innerHTML = '<div style="padding:20px;color:#ff4757">Failed to connect to telemetry datalink. Retrying...</div>';
        }
    }
}

// Render Map Markers dynamically based on risk level
function renderMarkers() {
    if (!map || typeof L === 'undefined') return;

    // Clear old markers
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    allSegments.forEach(seg => {
        const coords = segmentCoords[seg.id] || [30.1, 78.5]; // Fallback
        let riskClass = seg.risk_level.toLowerCase(); // 'unstable', 'marginal', 'stable'

        // Highlight S07 (Devprayag) & S11 (Agastyamuni) in Purple
        const isPurple = (seg.id === 'NH07-S07' || seg.id === 'NH07-S11' || seg.id === 'S7' || seg.id === 'S11');
        if (isPurple) {
            riskClass = 'purple endangered';
        }

        // Create 3D HTML marker
        const iconHtml = `<div class="custom-map-marker ${riskClass}">${seg.id.replace('S', '')}</div>`;
        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'dummy-leaflet-class', // Leaflet needs a class, but we style the inner div
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker(coords, { icon: customIcon }).addTo(map);

        const fosColor = isPurple ? '#a855f7' : (riskClass === 'unstable' ? '#990011' : (riskClass === 'marginal' ? '#ff9900' : '#2ed573'));
        const rainFormatted = Number(seg.rainfall.accum_24h_mm || 0).toFixed(1);

        const noteHTML = isPurple ? `<div style="font-size:9px; color:#a55eea; margin-top:6px; font-weight:bold;">★ Danger predicted by historical data</div>` : `<div style="font-size:9px; color:#536275; margin-top:8px;">CONFIDENCE: ${seg.confidence}</div>`;

        // Popup with rich data
        const popupContent = `
            <div style="background:#0a0e1c; color:#f0f4f8; padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); width: 190px; cursor:pointer;" onclick="playUIBeep('click'); showSegmentProfile('${seg.id}')">
                <h4 style="margin:0 0 5px; color:#00f2fe">${seg.name}</h4>
                <div style="font-size:11px; margin-bottom:5px;">Chainage: KM ${seg.km}</div>
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="color:#8899ac">FoS:</span>
                    <strong style="color:${fosColor}">${seg.fos.min.toFixed(2)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="color:#8899ac">24H Rain:</span>
                    <strong>${rainFormatted} mm</strong>
                </div>
                ${noteHTML}
            </div>
        `;

        marker.bindPopup(popupContent, {
            className: 'dark-popup'
        });

        mapMarkers.push(marker);
    });

    if (window.update3DCheckpoints) {
        window.update3DCheckpoints();
    }
}

// Map popup specific styles override
const style = document.createElement('style');
style.innerHTML = `
    .leaflet-popup-content-wrapper { background: transparent; box-shadow: none; padding: 0; }
    .leaflet-popup-tip-container { display: none; }
    .leaflet-popup-content { margin: 0; }
`;
document.head.appendChild(style);

// Render rows exactly matching 3d aesthetics
function render() {
    if (!rows || !allSegments.length) return;

    rows.innerHTML = allSegments.map((seg, idx) => {
        let cls = seg.risk_level.toLowerCase();
        if (seg.id === 'NH07-S07' || seg.id === 'NH07-S11') {
            cls = 'purple';
        }
        const displayRisk = cls === 'purple' ? 'Hist Danger' : (cls.charAt(0).toUpperCase() + cls.slice(1));
        const rainFormatted = Number(seg.rainfall.accum_24h_mm || 0).toFixed(1);

        let confMarker = '●';
        if (seg.confidence === 'MEDIUM') confMarker = '◐';
        if (seg.confidence === 'LOW') confMarker = '○';

        return `<div class="row" style="--i: ${idx}; cursor:pointer;" onclick="playUIBeep('click'); showSegmentProfile('${seg.id}')" title="Click to view Sector Cross-Section Profile & 24H Forecast">
            <div class="segment">
                <b>${seg.id}</b>
                <small>${seg.name} (KM ${seg.km})</small>
            </div>
            <strong class="fos ${cls}">${seg.fos.min.toFixed(2)}</strong>
            <span class="rain">${rainFormatted} mm</span>
            <span class="confidence-text">${seg.confidence} · ${confMarker}</span>
            <span class="status ${cls}">${displayRisk}</span>
        </div>`;
    }).join('');
}

// Update top statistics panel based on data
function updateStats() {
    const unstableCount = allSegments.filter(s => s.risk_level === 'UNSTABLE').length;

    // --- EMERGENCY NOTIFICATION LOGIC ---
    const banner = document.getElementById('emergency-banner');
    if (banner) {
        if (unstableCount > 0 && !window.emergencyMuted) {
            banner.classList.add('show');
            const details = document.getElementById('emergency-details');
            if(details) details.textContent = `${unstableCount} Sectors Reporting UNSTABLE. Evacuation Protocols Recommended.`;

            // Play Alarm Custom Synthesis
            if (!window.alarmInterval) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    try {
                        const audioCtx = new AudioContextClass();

                        window.alarmInterval = setInterval(() => {
                            if (audioCtx.state === 'suspended') audioCtx.resume();
                            const osc = audioCtx.createOscillator();
                            const gain = audioCtx.createGain();
                            osc.type = 'square';
                            osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                            osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.3);

                            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
                            gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

                            osc.connect(gain);
                            gain.connect(audioCtx.destination);
                            osc.start();
                            osc.stop(audioCtx.currentTime + 0.5);
                        }, 1000);
                    } catch (err) {
                        console.warn('Alarm AudioContext failed:', err);
                    }
                }
            }
        } else if (unstableCount === 0) {
            banner.classList.remove('show');
            if (window.alarmInterval) {
                clearInterval(window.alarmInterval);
                window.alarmInterval = null;
            }
        }
    }

    // Update the critical segments counter
    const alertCard = document.querySelector('#unstableCount');
    if (alertCard) {
        alertCard.textContent = unstableCount.toString().padStart(2, '0');
    }

    // Total 24h rainfall over all segments
    const maxRainfall = allSegments.length ? Math.max(...allSegments.map(s => s.rainfall.accum_24h_mm || 0)) : 0;
    const rainCard = document.querySelector('#maxRain');
    if (rainCard) {
        rainCard.innerHTML = `${maxRainfall.toFixed(1)} <small>mm</small>`;
    }

    // Time
    const timeElem = document.querySelector('#time');
    if (timeElem) {
        const now = new Date();
        timeElem.textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'});
    }
}

// Sync slider visually
function sync() {
    if (uOut && u) uOut.value = (+u.value).toFixed(2);
    if (mOut && m) mOut.value = (+m.value).toFixed(2);
}

// Event Listeners for sliders
[u, m].filter(Boolean).forEach(slider => {
    slider.addEventListener('input', (e) => {
        sync();
        // Optimistic UI update (client side logic matching threshold temporarily)
        allSegments.forEach(s => {
            if (s.fos.min < +u.value) s.risk_level = 'UNSTABLE';
            else if (s.fos.min < +m.value) s.risk_level = 'MARGINAL';
            else s.risk_level = 'STABLE';
        });
        render();
        renderMarkers();
        updateStats();
        updateTicker();

        // 3D Visual Feedback: Spawn dust particles around the slider thumb when dragging
        const rect = slider.getBoundingClientRect();
        const percent = (slider.value - slider.min) / (slider.max - slider.min);
        const thumbX = rect.left + (percent * rect.width);
        const thumbY = rect.top + (rect.height / 2);

        // Only spawn 1-2 dust particles per move to avoid lagging
        for(let i=0; i < 2; i++) {
            // Spawn specific type based on which slider it is
            spawnRockParticle(thumbX, thumbY, slider === u ? 'glowing' : 'dust');
        }
    });
});

// Update thresholds on backend
const applyBtn = document.querySelector('#apply');
if (applyBtn) {
    applyBtn.onclick = async () => {
        const ogText = applyBtn.innerHTML;
        applyBtn.innerHTML = '<span>Calibrating...</span>';

        try {
            await fetch('/api/thresholds', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    unstable: parseFloat(u.value),
                    marginal: parseFloat(m.value)
                })
            });
            await fetchSegments();
            applyBtn.innerHTML = '<span>Calibrated ✓</span>';
            setTimeout(() => applyBtn.innerHTML = ogText, 2000);
        } catch (e) {
            console.error("Failed to update thresholds", e);
            applyBtn.innerHTML = '<span>Link Error!</span>';
            setTimeout(() => applyBtn.innerHTML = ogText, 2000);
        }
    };
}

// Force Refresh Data
const refreshBtn = document.querySelector('#refresh');
if (refreshBtn) {
    refreshBtn.onclick = async () => {
        const ogText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<span class="refresh-icon">...</span><span>Fetching...</span>';

        try {
            await fetch('/api/refresh', { method: 'POST' });
            await fetchSegments();
        } finally {
            setTimeout(() => { refreshBtn.innerHTML = ogText; }, 1000);
        }
    };
}

// Start
sync();
fetchSegments();

// Auto refresh every 5 min
setInterval(fetchSegments, 300000);

// ----------------------------------------------------
// Tactical UI Audio Feedback (Procedural Web Audio API)
// ----------------------------------------------------
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const uiAudioCtx = AudioContextClass ? new AudioContextClass() : null;

function playUIBeep(type = 'click') {
    if (!uiAudioCtx) return;
    if (uiAudioCtx.state === 'suspended') {
        uiAudioCtx.resume().catch(() => {});
    }

    try {
        const osc = uiAudioCtx.createOscillator();
        const gain = uiAudioCtx.createGain();

        osc.connect(gain);
        gain.connect(uiAudioCtx.destination);

        const now = uiAudioCtx.currentTime;

        if (type === 'click') {
            // High pitched short tech ping
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.06);
        } else if (type === 'hover') {
            // Very subtle soft click
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.01);
            gain.gain.linearRampToValueAtTime(0.03, now + 0.03);
            osc.start(now);
            osc.stop(now + 0.04);
        } else if (type === 'confirm') {
            // Double ping (e.g. calibration)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.setValueAtTime(1400, now + 0.1);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.08);

            gain.gain.setValueAtTime(0, now + 0.1);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.12);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.3);

            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.2);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    } catch (e) {
        console.warn('playUIBeep failed:', e);
    }
}

// ----------------------------------------------------
// RAIN PARTICLES & AUDIO SYNTHESIS ENGINE
// ----------------------------------------------------
let ambientRainFrame = null;
let splashRainFrame = null;
let rainAudioNode = null;
let rainGainNode = null;

function createRainAnimation(canvasId, dropCount, color, setFrameCallback) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const drops = [];
    for (let i = 0; i < dropCount; i++) {
        drops.push({
            x: Math.random() * 2500,
            y: Math.random() * 1500,
            len: Math.random() * 24 + 14,
            speed: Math.random() * 18 + 14,
            opacity: Math.random() * 0.5 + 0.5
        });
    }

    function renderRain() {
        const cw = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
        const ch = canvas.parentElement ? canvas.parentElement.clientHeight : window.innerHeight;

        if (canvas.width !== cw) canvas.width = cw;
        if (canvas.height !== ch) canvas.height = ch;

        ctx.clearRect(0, 0, cw, ch);
        ctx.strokeStyle = color;
        ctx.lineWidth = canvasId === 'splash-rain-canvas' ? 1.8 : 1.0;
        ctx.lineCap = 'round';
        ctx.beginPath();

        for (let i = 0; i < drops.length; i++) {
            const d = drops[i];
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - d.len / 3, d.y + d.len);
            d.y += d.speed;
            d.x -= d.speed / 3;

            if (d.y > ch || d.x < -50) {
                d.y = -30;
                d.x = Math.random() * (cw + 200);
            }
        }
        ctx.stroke();

        const frame = requestAnimationFrame(renderRain);
        if (setFrameCallback) setFrameCallback(frame);
    }
    renderRain();
}

function startRainSound() {
    if (!uiAudioCtx) return;
    if (uiAudioCtx.state === 'suspended') {
        uiAudioCtx.resume().catch(() => {});
    }
    if (rainAudioNode) return;

    try {
        const bufferSize = uiAudioCtx.sampleRate * 2;
        const buffer = uiAudioCtx.createBuffer(1, bufferSize, uiAudioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut * 0.94) + (white * 0.06);
            data[i] = lastOut * 3.5;
        }

        rainAudioNode = uiAudioCtx.createBufferSource();
        rainAudioNode.buffer = buffer;
        rainAudioNode.loop = true;

        const filter = uiAudioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, uiAudioCtx.currentTime);

        rainGainNode = uiAudioCtx.createGain();
        rainGainNode.gain.setValueAtTime(0.001, uiAudioCtx.currentTime);
        rainGainNode.gain.linearRampToValueAtTime(0.25, uiAudioCtx.currentTime + 1.2);

        rainAudioNode.connect(filter);
        filter.connect(rainGainNode);
        rainGainNode.connect(uiAudioCtx.destination);

        rainAudioNode.start();
    } catch (err) {
        console.warn('Rain audio error:', err);
    }
}

function stopRainSound() {
    if (rainGainNode && rainAudioNode && uiAudioCtx) {
        try {
            rainGainNode.gain.linearRampToValueAtTime(0.001, uiAudioCtx.currentTime + 0.8);
            setTimeout(() => {
                if (rainAudioNode) {
                    try {
                        rainAudioNode.stop();
                        rainAudioNode.disconnect();
                    } catch (e) {}
                    rainAudioNode = null;
                }
            }, 850);
        } catch (e) {
            if (rainAudioNode) {
                try {
                    rainAudioNode.disconnect();
                } catch (err) {}
                rainAudioNode = null;
            }
        }
    }
}

function dismissRainLanding() {
    const landing = document.getElementById('rainfall-landing');
    if (!landing) return;
    landing.style.opacity = '0';
    landing.style.pointerEvents = 'none';
    setTimeout(() => {
        landing.style.visibility = 'hidden';
        landing.style.display = 'none';
    }, 600);
    startRainSound();
    playUIBeep('confirm');
}

const activateBtn = document.getElementById('activate-telemetry-btn');
if (activateBtn) {
    activateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissRainLanding();
    });
}

const rainLandingOverlay = document.getElementById('rainfall-landing');
if (rainLandingOverlay) {
    rainLandingOverlay.addEventListener('click', () => {
        dismissRainLanding();
    });
}

// ----------------------------------------------------
// UI INTERACTION & ANIMATIONS (Sidebar tabs & Modals)
// ----------------------------------------------------

// 1. Sidebar Navigation Switcher
const navLinks = document.querySelectorAll('.nav-link');
const viewSections = document.querySelectorAll('.view-section');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        // Remove active class from all links
        navLinks.forEach(l => l.classList.remove('active'));
        // Add active to clicked log
        link.classList.add('active');

        const targetId = link.getAttribute('data-view');
        const targetView = document.getElementById(targetId);

        // Manage rainfall landing and sound lifecycle
        if (targetId === 'view-rainfall') {
            const landing = document.getElementById('rainfall-landing');
            if (landing) {
                landing.style.display = 'flex';
                setTimeout(() => {
                    landing.style.opacity = '1';
                    landing.style.visibility = 'visible';
                    landing.style.pointerEvents = 'auto';
                }, 20);
            }
            if (ambientRainFrame) cancelAnimationFrame(ambientRainFrame);
            if (splashRainFrame) cancelAnimationFrame(splashRainFrame);
            createRainAnimation('splash-rain-canvas', 650, 'rgba(0, 242, 254, 0.7)', (f) => splashRainFrame = f);
            createRainAnimation('ambient-rain-canvas', 180, 'rgba(0, 242, 254, 0.25)', (f) => ambientRainFrame = f);
        } else {
            stopRainSound();
            if (ambientRainFrame) cancelAnimationFrame(ambientRainFrame);
            if (splashRainFrame) cancelAnimationFrame(splashRainFrame);
            const landing = document.getElementById('rainfall-landing');
            if (landing) {
                landing.style.opacity = '0';
                landing.style.visibility = 'hidden';
                landing.style.display = 'none';
                landing.style.pointerEvents = 'none';
            }
        }

        // Hide all views except target
        viewSections.forEach(view => {
            if (view !== targetView) {
                view.classList.add('hidden');
                setTimeout(() => {
                    if (view.classList.contains('hidden')) {
                        view.style.display = 'none';
                    }
                }, 300); // Wait for transition
            }
        });

        if (targetView) {
            // Show target view immediately
            targetView.style.display = 'block';

            // Small delay to allow display:block to apply before removing hidden to trigger opacity transition
            setTimeout(() => {
                targetView.classList.remove('hidden');

                // If returning to command view, ensure map fixes its size (Leaflet bug workaround when hidden)
                if (targetId === 'view-command' && map) {
                    map.invalidateSize();
                }
                if (targetId === 'view-terrain') {
                    initTerrain();
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                }
                if (targetId === 'view-rainfall' || targetId === 'view-validation') {
                    initCharts();
                    if (targetId === 'view-validation') loadIncidents();
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
                }
            }, 50);
        }
    });
});

// 2. Telemetry Inspector Modal
const inspectBtn = document.getElementById('inspect-btn');
const telemetryModal = document.getElementById('telemetry-modal');
const closeModal = document.getElementById('close-telemetry');
const textOutput = document.getElementById('telemetry-output');

if (inspectBtn && telemetryModal && textOutput) {
    inspectBtn.addEventListener('click', () => {
        telemetryModal.style.display = 'flex';
        setTimeout(() => telemetryModal.classList.remove('hidden'), 50);

        // Simulate animated terminal extraction of telemetry
        textOutput.innerHTML = 'Establishing secure link to Open-Meteo...\nFetching spatial tensors...\n';

        let simLines = [
            '[OK] Handshake completed w/ api.open-meteo.com',
            '[SYS] Querying geospatial polygon for NH-07 / 30.1N 78.5E',
            '-------------------------------------------',
        ];

        if (allSegments.length > 0) {
            allSegments.forEach(s => {
                let wind = s.rainfall.wind_speed ? s.rainfall.wind_speed + 'km/h' : 'N/A';
                let pressure = s.rainfall.pressure_msl ? s.rainfall.pressure_msl + 'hPa' : 'N/A';
                let temp = s.rainfall.temperature ? s.rainfall.temperature + '°C' : 'N/A';
                simLines.push(`[DAT] ${s.id} | Rain: ${s.rainfall.accum_24h_mm}mm | Wind: ${wind} | Press: ${pressure} | Temp: ${temp} | FoS: ${s.fos.min.toFixed(2)}`);
            });

            const testSeg = allSegments[0];
            if (testSeg && testSeg.rainfall.sunrise) {
                simLines.push(`[ASTRO] Sunrise: ${testSeg.rainfall.sunrise.split('T')[1] || 'N/A'} | Sunset: ${testSeg.rainfall.sunset.split('T')[1] || 'N/A'}`);
            }
        } else {
            simLines.push('[ERR] No active segment data in buffer.');
        }

        simLines.push('-------------------------------------------');
        simLines.push('[OK] Stream synced. Real-time updates active.');

        let lineIndex = 0;
        const interval = setInterval(() => {
            if (lineIndex < simLines.length) {
                textOutput.innerHTML += simLines[lineIndex] + '\n';
                lineIndex++;
            } else {
                clearInterval(interval);
            }
        }, 150);
    });
}

if (closeModal && telemetryModal) {
    closeModal.addEventListener('click', () => {
        telemetryModal.classList.add('hidden');
        setTimeout(() => {
            telemetryModal.style.display = 'none';
        }, 300);
    });
}

// ----------------------------------------------------
// Ticker Interface Logic
// ----------------------------------------------------
function updateTicker() {
    const tickerContainer = document.getElementById('ticker-text');
    if (!tickerContainer || !allSegments.length) return;

    let tickerHTML = '';
    const sep = '<span class="ticker-sep">///</span>';

    // Base system status
    tickerHTML += `<span>[SYS] SENSOR MESH ONLINE · ${new Date().toLocaleTimeString()}</span> ${sep} `;

    // Alerts
    const unstable = allSegments.filter(s => s.risk_level === 'UNSTABLE');
    const marginal = allSegments.filter(s => s.risk_level === 'MARGINAL');

    if (unstable.length > 0) {
        tickerHTML += `<span class="ticker-alert">[CRITICAL] ${unstable.length} SECTORS EXCEED THRESHOLD</span> ${sep} `;
        unstable.forEach(s => {
            tickerHTML += `<span class="ticker-alert">EVAC ALERT: ${s.name} (KM ${s.km}) - FoS: ${s.fos.min.toFixed(2)} | RAIN: ${s.rainfall.accum_24h_mm}mm</span> ${sep} `;
        });
    }

    if (marginal.length > 0) {
        tickerHTML += `<span class="ticker-caution">[WARNING] ${marginal.length} SECTORS SHOWING ATYPICAL PORE PRESSURE</span> ${sep} `;
    }

    // Standard telemetry
    const maxRainfall = Math.max(...allSegments.map(s => s.rainfall.accum_24h_mm || 0));
    tickerHTML += `<span>PEAK 24H RAINFALL DETECTED: ${maxRainfall.toFixed(1)}mm</span> ${sep} `;
    tickerHTML += `<span>MONITORING CORRIDOR NH-07 UTTARAKHAND (RISHIKESH ⇄ BADRINATH)</span> ${sep} `;
    tickerHTML += `<span>INFINITE-SLOPE ACTIVE CALIBRATION ENABLED</span>`;

    // Duplicate content twice to ensure seamless marquee looping
    tickerContainer.innerHTML = tickerHTML + ` ${sep} ` + tickerHTML + ` ${sep} ` + tickerHTML;
}

// ----------------------------------------------------
// Interactive Rock Physics (Click Effect)
// ----------------------------------------------------
document.addEventListener('click', (e) => {
    // Avoid spawning debris when clicking buttons, inputs, links, map, or modals to not block UI interactions too aggressively
    const targetTags = ['BUTTON', 'A', 'INPUT', 'SELECT'];
    if (targetTags.includes(e.target.tagName)) return;
    if (e.target.closest('.map-viewport') || e.target.closest('.modal-overlay')) return;

    // Spawn 5-8 particles at click location
    const numParticles = Math.floor(Math.random() * 4) + 5;

    for (let i = 0; i < numParticles; i++) {
        spawnRockParticle(e.clientX, e.clientY);
    }
});

function spawnRockParticle(x, y, forceType = null) {
    const rock = document.createElement('div');
    rock.className = 'debris-rock';

    // 15% chance to be glowing hot debris, 30% chance to be dust, 55% normal rock
    // Or force type if passed
    if (forceType === 'glowing' || (!forceType && Math.random() < 0.15)) {
        rock.classList.add('glowing');
    } else if (forceType === 'dust' || (!forceType && Math.random() < 0.45)) {
        rock.classList.add('dust');
    }

    // Randomize shape (angular clip paths for rocks)
    if (!rock.classList.contains('dust')) {
        const p1 = Math.floor(Math.random()*20);
        const p2 = 80 + Math.floor(Math.random()*20);
        const p3 = 80 + Math.floor(Math.random()*20);
        const p4 = Math.floor(Math.random()*20);
        rock.style.clipPath = `polygon(${p1}% 0%, ${p2}% ${p4}%, 100% ${p3}%, ${p4}% 100%, 0% ${p2}%)`;
    }

    // Size
    const size = rock.classList.contains('dust') ?
        Math.random() * 30 + 10 :
        Math.random() * 12 + 4;

    rock.style.width = size + 'px';
    rock.style.height = size + 'px';
    rock.style.left = (x - size/2) + 'px';
    rock.style.top = (y - size/2) + 'px';

    document.body.appendChild(rock);

    // Physics variables
    let posX = x - size/2;
    let posY = y - size/2;
    // Explode outward (burst)
    let velX = (Math.random() - 0.5) * 12;
    let velY = forceType ? (Math.random() - 0.5) * 6 : (Math.random() - 1) * 10 - 2; // Less upward jump if from slider
    let gravity = forceType ? 0.2 : 0.5; // Lighter gravity for slider sparks
    let rotation = Math.random() * 360;
    const rotSpeed = (Math.random() - 0.5) * 20;
    let opacity = rock.classList.contains('dust') ? 0.6 : 1;
    let bounceCount = 0;

    let frameId;
    function updatePhysics() {
        velY += gravity;
        posX += velX;
        posY += velY;
        rotation += rotSpeed;

        if (rock.classList.contains('dust')) {
            opacity -= 0.02; // Dust fades faster
            // Dust floats a bit more, higher drag
            velX *= 0.9;
            velY -= gravity * 0.8;
        } else {
            // Normal fade
            opacity -= 0.015;

            // Add a simple bounce effect off the bottom of the window
            if (posY + size > window.innerHeight && bounceCount < 2) {
                posY = window.innerHeight - size;
                velY = -velY * 0.5; // lose half energy
                velX = velX * 0.7; // friction
                bounceCount++;
            }
        }

        rock.style.transform = `translate(${posX - x + size/2}px, ${posY - y + size/2}px) rotate(${rotation}deg)`;
        rock.style.opacity = opacity;

        if (opacity > 0 && posY < window.innerHeight + 50) {
            frameId = requestAnimationFrame(updatePhysics);
        } else {
            rock.remove();
        }
    }

    frameId = requestAnimationFrame(updatePhysics);
}

// ----------------------------------------------------
// 3D Terrain Analysis (Three.js) & Charting
// ----------------------------------------------------
let terrainScene, terrainCamera, terrainRenderer, terrainControls;
let terrainAnimationId = null;

function initTerrain() {
    if (typeof THREE === 'undefined') {
        console.warn('Three.js library is not loaded');
        return;
    }

    const container = document.getElementById('terrain-canvas');
    if (!container) {
        console.warn('terrain-canvas container not found');
        return;
    }

    let initW = container.clientWidth;
    let initH = container.clientHeight;

    // If container has no size, retry after a delay
    if (initW < 50 || initH < 50) {
        console.warn('Container too small:', initW, 'x', initH, '- retrying...');
        setTimeout(initTerrain, 300);
        return;
    }

    // If already initialized, just ensure sizing is correct
    if (terrainRenderer) {
        terrainRenderer.setSize(initW, initH);
        if (terrainCamera) {
            terrainCamera.aspect = initW / initH;
            terrainCamera.updateProjectionMatrix();
        }
        return;
    }

    console.log('Initializing 3D Terrain with size:', initW, 'x', initH);

    terrainScene = new THREE.Scene();
    terrainScene.background = new THREE.Color(0x02050e);
    terrainScene.fog = new THREE.FogExp2(0x02050e, 0.015);

    terrainCamera = new THREE.PerspectiveCamera(45, initW / initH, 0.1, 1000);
    terrainCamera.position.set(0, 40, 60);
    terrainCamera.lookAt(0, 0, 0);

    terrainRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    terrainRenderer.setSize(initW, initH);
    terrainRenderer.setPixelRatio(window.devicePixelRatio);
    terrainRenderer.setClearColor(0x02050e, 1);

    // Clear container first
    container.innerHTML = '';
    container.appendChild(terrainRenderer.domElement);

    // Check if OrbitControls is available safely without returning early
    const OrbitControlsClass = (typeof THREE !== 'undefined' && THREE.OrbitControls) || window.OrbitControls;
    if (OrbitControlsClass) {
        try {
            terrainControls = new OrbitControlsClass(terrainCamera, terrainRenderer.domElement);
            terrainControls.enableDamping = true;
            terrainControls.dampingFactor = 0.05;
            terrainControls.autoRotate = true;
            terrainControls.autoRotateSpeed = 1.5;

            // Enable ALL MOTION: Rotation, Pan (shift), Zoom, Pitch, Yaw in EVERY direction
            terrainControls.enableRotate = true;
            terrainControls.enablePan = true;
            terrainControls.screenSpacePanning = true; // Enables 2D screen-space panning up, down, left, right
            terrainControls.enableZoom = true;

            // Unrestrict angles so user can look from all angles (top-down, side, underneath, etc.)
            terrainControls.minPolarAngle = 0;
            terrainControls.maxPolarAngle = Math.PI - 0.01;
            terrainControls.minAzimuthAngle = -Infinity;
            terrainControls.maxAzimuthAngle = Infinity;

            terrainControls.minDistance = 5;
            terrainControls.maxDistance = 300;

            // Mouse button assignments:
            // Left Drag = Rotate/Orbit
            // Right Drag / Shift+Drag = Pan/Move surface in any direction
            // Scroll Wheel = Zoom
            terrainControls.mouseButtons = {
                LEFT: THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN
            };

            terrainControls.touches = {
                ONE: THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN
            };

            // Pause auto-rotation when user starts manually moving
            terrainControls.addEventListener('start', () => {
                terrainControls.autoRotate = false;
                const btnRotate = document.getElementById('btn-3d-rotate');
                if (btnRotate) btnRotate.classList.remove('selected');
            });
        } catch (e) {
            console.warn('OrbitControls instantiation failed:', e);
            terrainControls = null;
        }
    } else {
        console.warn('OrbitControls not loaded - using automated camera orbit fallback');
    }

    // High-Contrast Cyber Lights
    const ambient = new THREE.AmbientLight(0x0a192f, 2.0);
    terrainScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0x00f2fe, 2.2);
    dirLight.position.set(100, 100, 50);
    terrainScene.add(dirLight);
    const redLight = new THREE.DirectionalLight(0xff2a55, 1.4);
    redLight.position.set(-100, 50, -50);
    terrainScene.add(redLight);

    // Generate procedural mountain terrain
    const geometry = new THREE.PlaneGeometry(160, 160, 64, 64);
    geometry.rotateX(-Math.PI / 2);

    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        let y = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 15;
        y += Math.sin(x * 0.3) * Math.cos(z * 0.2) * 5;
        y -= Math.abs(x) * 0.4;
        y += (Math.random() - 0.5) * 1.5;
        vertices[i + 1] = y;
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        color: 0x00f2fe,
        emissive: 0x003d52,
        wireframe: true,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.95
    });

    const terrain = new THREE.Mesh(geometry, material);
    terrainScene.add(terrain);

    // Map Lat/Lng coordinates to 3D Terrain Plane (X, Y, Z)
    const segmentKeys = ['NH07-S01', 'NH07-S02', 'NH07-S03', 'NH07-S04', 'NH07-S05', 'NH07-S06', 'NH07-S07', 'NH07-S08', 'NH07-S09', 'NH07-S10', 'NH07-S11', 'NH07-S12'];

    function getSegment3DPos(lat, lng) {
        const normX = (lng - 78.20) / (79.60 - 78.20);
        const x = (normX - 0.5) * 130;

        const normZ = (lat - 30.05) / (30.78 - 30.05);
        const z = (0.5 - normZ) * 130;

        let y = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 15;
        y += Math.sin(x * 0.3) * Math.cos(z * 0.2) * 5;
        y -= Math.abs(x) * 0.4;

        return new THREE.Vector3(x, y + 1.5, z);
    }

    // Collect all 12 checkpoint positions along the highway corridor
    const checkpointPositions = segmentKeys.map(key => {
        const coords = segmentCoords[key] || [30.1, 78.5];
        return getSegment3DPos(coords[0], coords[1]);
    });

    // 1. Curved 3D Highway Line connecting all 12 checkpoints sequentially
    const highwayCurve = new THREE.CatmullRomCurve3(checkpointPositions);
    const curvePoints = highwayCurve.getPoints(200);

    const hwGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const hwMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, linewidth: 3 });
    const highway = new THREE.Line(hwGeo, hwMat);
    terrainScene.add(highway);

    // Translucent glowing wireframe 3D tube along the highway path
    const tubeGeo = new THREE.TubeGeometry(highwayCurve, 120, 0.4, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x00f2fe,
        wireframe: true,
        transparent: true,
        opacity: 0.35
    });
    const highwayTube = new THREE.Mesh(tubeGeo, tubeMat);
    terrainScene.add(highwayTube);

    // 2. 3D Checkpoint Markers Group (12 Sector Checkpoints matching Command Center map)
    const checkpoint3DGroup = new THREE.Group();
    terrainScene.add(checkpoint3DGroup);

    window.update3DCheckpoints = function() {
        checkpoint3DGroup.clear();

        segmentKeys.forEach((key) => {
            const coords = segmentCoords[key] || [30.1, 78.5];
            const pos = getSegment3DPos(coords[0], coords[1]);

            // Determine risk status color (matching Command Center map pins)
            const seg = allSegments.find(s => s.id === key);
            let colorHex = 0x2ed573; // Green (stable) default
            if (key === 'NH07-S07' || key === 'NH07-S11') {
                colorHex = 0xa55eea; // Vibrant Purple for S07 & S11
            } else if (seg) {
                const riskClass = seg.risk_level.toLowerCase();
                if (riskClass === 'unstable') colorHex = 0xff4757; // Red
                else if (riskClass === 'marginal') colorHex = 0xffa502; // Orange
            }

            // A) Checkpoint Sphere
            const sphereGeo = new THREE.SphereGeometry(1.2, 16, 16);
            const sphereMat = new THREE.MeshStandardMaterial({
                color: colorHex,
                emissive: colorHex,
                emissiveIntensity: 0.8,
                roughness: 0.3
            });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            sphere.position.copy(pos);
            sphere.userData = { segId: key };
            checkpoint3DGroup.add(sphere);

            // B) Vertical Pin Beacon Line
            const pinGeo = new THREE.BufferGeometry().setFromPoints([
                pos,
                new THREE.Vector3(pos.x, pos.y + 6, pos.z)
            ]);
            const pinMat = new THREE.LineBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.85
            });
            const pinLine = new THREE.Line(pinGeo, pinMat);
            checkpoint3DGroup.add(pinLine);

            // C) Top Pulsing Ring
            const ringGeo = new THREE.RingGeometry(0.8, 1.4, 16);
            ringGeo.rotateX(-Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({
                color: colorHex,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.9
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(pos.x, pos.y + 6, pos.z);
            checkpoint3DGroup.add(ring);

            // D) Sprite Label Canvas (S01, S02, ... S12)
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0a0e1c';
            ctx.fillRect(0, 0, 128, 64);
            ctx.strokeStyle = colorHex === 0xa55eea ? '#a55eea' : (colorHex === 0xff4757 ? '#ff4757' : (colorHex === 0xffa502 ? '#ffa502' : '#2ed573'));
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 124, 60);

            ctx.font = 'bold 28px "DM Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(key.replace('NH07-', ''), 64, 32);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.95 });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.set(pos.x, pos.y + 9.5, pos.z);
            sprite.scale.set(7, 3.5, 1);
            sprite.userData = { segId: key };
            checkpoint3DGroup.add(sprite);
        });
    };

    window.update3DCheckpoints();

    // 3. Flowing Telemetry Particles along the highway curve
    const particleCount = 80;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleProgress = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
        particleProgress[i] = Math.random();
        const pt = highwayCurve.getPoint(particleProgress[i]);
        particlePositions[i * 3] = pt.x;
        particlePositions[i * 3 + 1] = pt.y + 0.4;
        particlePositions[i * 3 + 2] = pt.z;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
        color: 0x00f2fe,
        size: 1.1,
        transparent: true,
        blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    terrainScene.add(particles);

    // 4. Raycaster Click Interaction on 3D Checkpoints
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    container.addEventListener('click', (event) => {
        const rect = container.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, terrainCamera);
        const intersects = raycaster.intersectObjects(checkpoint3DGroup.children);

        if (intersects.length > 0) {
            for (let hit of intersects) {
                if (hit.object.userData && hit.object.userData.segId) {
                    playUIBeep('click');
                    showSegmentProfile(hit.object.userData.segId);
                    break;
                }
            }
        }
    });

    // 5. Interactive Mouse & Touch Dragging Handlers for 3D Surface Movement
    let isMouseDown = false;
    let startMousePos = { x: 0, y: 0 };

    container.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        startMousePos = { x: e.clientX, y: e.clientY };
    });

    container.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;

        const deltaX = e.clientX - startMousePos.x;
        const deltaY = e.clientY - startMousePos.y;

        // If OrbitControls is not loaded or for direct fallback panning/rotation
        if (!terrainControls) {
            if (e.buttons === 2 || e.shiftKey) {
                // Right click or Shift + Drag -> Pan/Shift 3D surface
                terrainCamera.position.x -= deltaX * 0.15;
                terrainCamera.position.y += deltaY * 0.15;
            } else {
                // Left click -> Rotate 3D camera
                terrainCamera.position.x -= deltaX * 0.2;
                terrainCamera.position.y += deltaY * 0.2;
                terrainCamera.lookAt(0, 0, 0);
            }
        }

        startMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isMouseDown = false; });

    // Touch Movement Support for Touchscreens
    let startTouchPos = { x: 0, y: 0 };
    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            startTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && !terrainControls) {
            const deltaX = e.touches[0].clientX - startTouchPos.x;
            const deltaY = e.touches[0].clientY - startTouchPos.y;

            terrainCamera.position.x -= deltaX * 0.25;
            terrainCamera.position.y += deltaY * 0.25;
            terrainCamera.lookAt(0, 0, 0);

            startTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }, { passive: true });

    // 6. UI Navigation Control Buttons (Rotate, Top View, Zoom, Reset)
    const btnRotate = document.getElementById('btn-3d-rotate');
    if (btnRotate) {
        btnRotate.onclick = () => {
            if (terrainControls) {
                terrainControls.autoRotate = !terrainControls.autoRotate;
                if (terrainControls.autoRotate) {
                    btnRotate.classList.add('selected');
                } else {
                    btnRotate.classList.remove('selected');
                }
            }
        };
    }

    const btnTopView = document.getElementById('btn-3d-top');
    if (btnTopView) {
        btnTopView.onclick = () => {
            if (terrainCamera) {
                terrainCamera.position.set(0, 110, 0.1);
                terrainCamera.lookAt(0, 0, 0);
                if (terrainControls) {
                    terrainControls.target.set(0, 0, 0);
                    terrainControls.autoRotate = false;
                    terrainControls.update();
                }
                if (btnRotate) btnRotate.classList.remove('selected');
            }
        };
    }

    const btnZoomIn = document.getElementById('btn-3d-zoom-in');
    if (btnZoomIn) {
        btnZoomIn.onclick = () => {
            if (terrainCamera) {
                terrainCamera.position.multiplyScalar(0.82);
                if (terrainControls) terrainControls.update();
            }
        };
    }

    const btnZoomOut = document.getElementById('btn-3d-zoom-out');
    if (btnZoomOut) {
        btnZoomOut.onclick = () => {
            if (terrainCamera) {
                terrainCamera.position.multiplyScalar(1.22);
                if (terrainControls) terrainControls.update();
            }
        };
    }

    const btnReset = document.getElementById('btn-3d-reset');
    if (btnReset) {
        btnReset.onclick = () => {
            if (terrainCamera) {
                terrainCamera.position.set(0, 40, 60);
                terrainCamera.lookAt(0, 0, 0);
                if (terrainControls) {
                    terrainControls.target.set(0, 0, 0);
                    terrainControls.autoRotate = true;
                    terrainControls.update();
                }
                if (btnRotate) btnRotate.classList.add('selected');
            }
        };
    }

    // Keyboard WASD & Arrow Keys movement for shifting/moving the 3D surface
    window.addEventListener('keydown', (e) => {
        const viewTerrain = document.getElementById('view-terrain');
        if (!viewTerrain || viewTerrain.classList.contains('hidden')) return;

        const panSpeed = 3.5;
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
            terrainCamera.position.z -= panSpeed;
            if (terrainControls) terrainControls.target.z -= panSpeed;
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
            terrainCamera.position.z += panSpeed;
            if (terrainControls) terrainControls.target.z += panSpeed;
        } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
            terrainCamera.position.x -= panSpeed;
            if (terrainControls) terrainControls.target.x -= panSpeed;
        } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
            terrainCamera.position.x += panSpeed;
            if (terrainControls) terrainControls.target.x += panSpeed;
        } else if (e.key === 'q' || e.key === 'Q') {
            terrainCamera.position.y += panSpeed;
            if (terrainControls) terrainControls.target.y += panSpeed;
        } else if (e.key === 'e' || e.key === 'E') {
            terrainCamera.position.y -= panSpeed;
            if (terrainControls) terrainControls.target.y -= panSpeed;
        }

        if (terrainControls) terrainControls.update();
    });

    let orbitAngle = 0;
    function animateTerrain() {
        terrainAnimationId = requestAnimationFrame(animateTerrain);

        if (terrainControls) {
            terrainControls.update();
        } else {
            orbitAngle += 0.005;
            terrainCamera.position.x = Math.sin(orbitAngle) * 70;
            terrainCamera.position.z = Math.cos(orbitAngle) * 70;
            terrainCamera.lookAt(0, -10, 0);
        }

        // Animate particles flowing along the curved highway line
        const positions = particles.geometry.attributes.position.array;
        for (let i = 0; i < particleCount; i++) {
            particleProgress[i] += 0.0025;
            if (particleProgress[i] > 1.0) particleProgress[i] = 0.0;
            const pt = highwayCurve.getPoint(particleProgress[i]);
            positions[i * 3] = pt.x;
            positions[i * 3 + 1] = pt.y + 0.4;
            positions[i * 3 + 2] = pt.z;
        }
        particles.geometry.attributes.position.needsUpdate = true;

        terrainRenderer.render(terrainScene, terrainCamera);
    }

    animateTerrain();
    console.log('✓ 3D Terrain initialized and rendering at', initW, 'x', initH);

    // Populate terrain HUD with real backend data
    fetch('/api/terrain/stats')
        .then(r => r.json())
        .then(data => {
            const hudTitle = document.getElementById('terrain-hud-title');
            if (hudTitle) hudTitle.textContent = 'SRTM DEM SLOPE VECTORS';
            const statsEl = document.getElementById('terrain-hud-stats');
            if (statsEl && data.slope_deg) {
                const avgSlope = data.slope_deg.mean ? data.slope_deg.mean.toFixed(1) : '-';
                const maxSlope = data.slope_deg.max ? data.slope_deg.max.toFixed(1) : '-';
                const meanElev = data.elevation && data.elevation.mean ? data.elevation.mean.toFixed(0) : '-';
                const cellInfo = data.cell_size_m ? data.cell_size_m.toFixed(0) : '30';
                // Update the stats
                statsEl.innerHTML = `
                    <h3 style="margin:0 0 10px; color:#00f2fe; font-size:14px; font-family:'DM Mono', monospace;">SRTM DEM SLOPE VECTORS</h3>
                    <div style="display:flex; justify-content:space-between; width:200px; margin-bottom:5px;"><span style="color:#8899ac; font-size:12px;">Avg Gradient (β):</span> <strong style="font-size:12px;">${avgSlope}°</strong></div>
                    <div style="display:flex; justify-content:space-between; width:200px; margin-bottom:5px;"><span style="color:#8899ac; font-size:12px;">Max Slope:</span> <strong style="font-size:12px;">${maxSlope}°</strong></div>
                    <div style="display:flex; justify-content:space-between; width:200px; margin-bottom:5px;"><span style="color:#8899ac; font-size:12px;">Mean Elevation:</span> <strong style="font-size:12px;">${meanElev} m</strong></div>
                    <div style="display:flex; justify-content:space-between; width:200px;"><span style="color:#8899ac; font-size:12px;">DEM Resolution:</span> <strong style="font-size:12px;">${cellInfo} m</strong></div>
                `;
            }
        })
        .catch(err => console.warn('Terrain stats fetch failed:', err));

    // Handle window resize
    const handleResize = () => {
        if (!container.offsetParent) return; // Hidden
        let w = container.clientWidth || 800;
        let h = container.clientHeight || 500;
        if (w < 50 || h < 50) return;

        terrainCamera.aspect = w / h;
        terrainCamera.updateProjectionMatrix();
        terrainRenderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
}

// ----------------------------------------------------
// Data Visualizations (Chart.js)
// ----------------------------------------------------

let chartsInitialized = false;
function initCharts() {
    if (chartsInitialized) return;
    chartsInitialized = true;

    if (typeof Chart === 'undefined') return;

    Chart.defaults.color = '#8899ac';
    Chart.defaults.font.family = "'DM Mono', monospace";
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';

    const ctxRain = document.getElementById('rainChart');
    if (ctxRain) {
        window.rainChartInstance = new Chart(ctxRain, {
            type: 'line',
            data: {
                labels: ['-72h', '-60h', '-48h', '-36h', '-24h', '-12h', 'NOW'],
                datasets: [
                    {
                        label: 'Precipitation (mm)',
                        data: [12, 18, 45, 80, 140, 110, 85],
                        borderColor: '#4facfe',
                        backgroundColor: 'rgba(79, 172, 254, 0.2)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Pore Pressure (u)',
                        data: [10, 15, 30, 60, 110, 95, 75],
                        borderColor: '#ffa502',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top', align: 'end' } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    const ctxRadar = document.getElementById('radarChart');
    if (ctxRadar) {
        window.radarChartInstance = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: ['Cohesion', 'Friction (φ)', 'Rainfall (m)', 'Slope (β)', 'Soil Depth'],
                datasets: [{
                    label: 'Sector S7 Risk Vector',
                    data: [40, 60, 90, 85, 70],
                    backgroundColor: 'rgba(255, 71, 87, 0.2)',
                    borderColor: '#ff4757',
                    pointBackgroundColor: '#ff4757',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        pointLabels: { color: '#00f2fe', font: { size: 10 } },
                        ticks: { display: false, max: 100 }
                    }
                }
            }
        });
    }

    const ctxConf = document.getElementById('confusionChart');
    if (ctxConf) {
        window.confChartInstance = new Chart(ctxConf, {
            type: 'bar',
            data: {
                labels: ['True Pos', 'True Neg', 'False Pos', 'False Neg'],
                datasets: [{
                    label: 'Events',
                    data: [142, 856, 12, 4],
                    backgroundColor: [
                        'rgba(46, 213, 115, 0.6)',
                        'rgba(46, 213, 115, 0.4)',
                        'rgba(255, 165, 2, 0.6)',
                        'rgba(255, 71, 87, 0.8)'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, type: 'logarithmic' },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

// ----------------------------------------------------
// ADVANCED UPGRADE FEATURES (Profile, Cloudburst & Bulletin)
// ----------------------------------------------------

window.rainChartInstance = null;
window.radarChartInstance = null;
window.confChartInstance = null;
let profileChartInstance = null;

function updateChartData(seg) {
    if (!seg) return;

    if (window.rainChartInstance) {
        // Build mock time sequence based on current accum and rate for aesthetic UI
        const basePlot = seg.rainfall.accum_24h_mm || 0;
        const rate = (seg.rainfall.rain_rate_mm_h || basePlot / 24) * 5;

        const r1 = Math.max(0, basePlot - rate * 6);
        const r2 = Math.max(0, basePlot - rate * 5);
        const r3 = Math.max(0, basePlot - rate * 4);
        const r4 = Math.max(0, basePlot - rate * 3);
        const r5 = Math.max(0, basePlot - rate * 2);
        const r6 = Math.max(0, basePlot - rate * 1);
        const r7 = basePlot;

        window.rainChartInstance.data.datasets[0].data = [r1, r2, r3, r4, r5, r6, r7];

        // Pore pressure roughly correlates visually
        const p1 = r1 * 0.8;
        const p2 = r2 * 0.85;
        const p3 = r3 * 0.9;
        const p4 = r4 * 0.88;
        const p5 = r5 * 0.92;
        const p6 = r6 * 0.85;
        const p7 = r7 * 0.95;
        window.rainChartInstance.data.datasets[1].data = [p1, p2, p3, p4, p5, p6, p7];

        window.rainChartInstance.update();
    }

    if (window.radarChartInstance) {
        window.radarChartInstance.data.datasets[0].label = `Sector ${seg.id} Risk Vector`;
        // Normalize values to 0-100 for the radar chart
        const cohesionNorm = Math.min(100, (seg.soil.cohesion_kpa / 20) * 100);
        const frictionNorm = Math.min(100, (seg.soil.phi_deg / 45) * 100);
        const rainNorm = Math.min(100, ((seg.rainfall.accum_24h_mm || 0) / 150) * 100);
        const slopeNorm = Math.min(100, (seg.slope.beta_deg / 60) * 100);
        const depthNorm = Math.min(100, (seg.soil.depth_m / 10) * 100);

        window.radarChartInstance.data.datasets[0].data = [cohesionNorm, frictionNorm, rainNorm, slopeNorm, depthNorm];

        // Dynamically change radar color based on risk
        const riskClass = seg.risk_level.toLowerCase();
        let color = '#2ed573'; // Stable
        if (riskClass === 'marginal') color = '#ffa502';
        if (riskClass === 'unstable') color = '#ff4757';

        window.radarChartInstance.data.datasets[0].borderColor = color;
        window.radarChartInstance.data.datasets[0].backgroundColor = color.replace(')', ', 0.2)').replace('rgb', 'rgba');
        if (window.radarChartInstance.data.datasets[0].backgroundColor.indexOf('#') === 0) {
            window.radarChartInstance.data.datasets[0].backgroundColor = color + '33'; // hex alpha
        }
        window.radarChartInstance.data.datasets[0].pointBackgroundColor = color;

        window.radarChartInstance.update();
    }

    // Call updateTerrainData too if WebGL implies looking at this segment
    updateTerrainData(seg);
}

function updateTerrainData(seg) {
    if (!seg) return;
    // 3D HUD Elements update
    const uiTitle = document.getElementById('terrain-hud-title');
    const uiStats = document.getElementById('terrain-hud-stats');

    if (uiTitle && uiStats) {
        uiTitle.innerHTML = `<span style="color:#00f2fe; text-shadow: 0 0 10px #00f2fe;">${seg.id} : ${seg.name}</span> | <span style="font-size:12px; color:#a0a0a0">3D TOPOLOGY SCAN</span>`;
        uiStats.innerHTML = `
            <div style="margin-top:10px; font-size:12px; line-height:1.6;">
                <div style="display:flex; justify-content:space-between"><span>BASE ANGLE:</span><span style="color:#ffcc00">${seg.slope.beta_deg}°</span></div>
                <div style="display:flex; justify-content:space-between"><span>SOIL Φ:</span><span style="color:#ffcc00">${seg.soil.phi_deg}°</span></div>
                <div style="display:flex; justify-content:space-between"><span>COHESION:</span><span style="color:#ffcc00">${seg.soil.cohesion_kpa} kPa</span></div>
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1)">
                    <div style="display:flex; justify-content:space-between"><span>CUR. FOs:</span><span style="color:${seg.fos.min < 1.0 ? '#ff4757' : (seg.fos.min < 1.35 ? '#ffa502' : '#2ed573')}">${seg.fos.min.toFixed(2)}</span></div>
                    <div style="display:flex; justify-content:space-between"><span>STATUS:</span><span style="color:${seg.fos.min < 1.0 ? '#ff4757' : (seg.fos.min < 1.35 ? '#ffa502' : '#2ed573')}">${seg.risk_level}</span></div>
                </div>
            </div>
        `;
    }
}

function showSegmentProfile(segId) {
    const seg = allSegments.find(s => s.id === segId);
    if (!seg) return;

    updateChartData(seg);

    const modal = document.getElementById('profile-modal');
    if (!modal) return;

    const titleEl = document.getElementById('profile-title');
    if (titleEl) titleEl.textContent = `${seg.id}: ${seg.name} (KM ${seg.km})`;

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.remove('hidden'), 50);

    const forecastBoxes = document.getElementById('profile-forecast-boxes');
    const f = seg.fos_forecast || { "6h": seg.fos.min, "12h": seg.fos.min, "24h": seg.fos.min };

    if (forecastBoxes) {
        forecastBoxes.innerHTML = `
            <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid var(--card-border); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 10px; color: var(--text-muted); font-family: 'DM Mono', monospace;">+6H PROJECTED FoS</div>
                <div style="font-size: 20px; font-weight: bold; color: ${f['6h'] < 1.0 ? '#ff4757' : (f['6h'] < 1.35 ? '#ffa502' : '#2ed573')}; font-family: 'DM Mono';">${f['6h'].toFixed(2)}</div>
            </div>
            <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid var(--card-border); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 10px; color: var(--text-muted); font-family: 'DM Mono', monospace;">+12H PROJECTED FoS</div>
                <div style="font-size: 20px; font-weight: bold; color: ${f['12h'] < 1.0 ? '#ff4757' : (f['12h'] < 1.35 ? '#ffa502' : '#2ed573')}; font-family: 'DM Mono';">${f['12h'].toFixed(2)}</div>
            </div>
            <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid var(--card-border); padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 10px; color: var(--text-muted); font-family: 'DM Mono', monospace;">+24H PROJECTED FoS</div>
                <div style="font-size: 20px; font-weight: bold; color: ${f['24h'] < 1.0 ? '#ff4757' : (f['24h'] < 1.35 ? '#ffa502' : '#2ed573')}; font-family: 'DM Mono';">${f['24h'].toFixed(2)}</div>
            </div>
        `;
    }

    const profileChartEl = document.getElementById('profileChart');
    if (!profileChartEl || typeof Chart === 'undefined') return;
    const ctx = profileChartEl.getContext('2d');
    if (profileChartInstance) profileChartInstance.destroy();

    const elevProfile = (seg.terrain && seg.terrain.profile) || [300, 320, 350, 410, 480, 520, 490, 420, 380, 350];
    const slopeProfile = (seg.terrain && seg.terrain.slope_profile) || [12, 18, 28, 38, 45, 42, 36, 25, 18, 14];

    profileChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: elevProfile.map((_, i) => `Point ${i + 1}`),
            datasets: [
                {
                    label: 'Elevation (m)',
                    data: elevProfile,
                    borderColor: '#00f2fe',
                    backgroundColor: 'rgba(0, 242, 254, 0.1)',
                    fill: true,
                    yAxisID: 'yElev',
                    tension: 0.3
                },
                {
                    label: 'Slope Angle (°)',
                    data: slopeProfile,
                    borderColor: '#ff4757',
                    backgroundColor: 'transparent',
                    borderDash: [4, 4],
                    yAxisID: 'ySlope',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', align: 'end' } },
            scales: {
                yElev: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Elevation (m)', color: '#00f2fe' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                ySlope: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Slope (°)', color: '#ff4757' },
                    grid: { display: false }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

// Cloudburst Simulation Toggle
let isSimulating = false;
const simBtn = document.getElementById('simulate-btn');
if (simBtn) {
    simBtn.onclick = async () => {
        const simBtnText = document.getElementById('sim-btn-text');

        if (!isSimulating) {
            if (simBtnText) simBtnText.textContent = 'Demo Started...';
            isSimulating = true;
            if (simBtnText) simBtnText.textContent = '↻ Stop Alert Demo';
            simBtn.style.background = 'linear-gradient(135deg, rgba(46, 213, 115, 0.2), rgba(0, 242, 254, 0.2))';
            simBtn.style.borderColor = 'rgba(46, 213, 115, 0.4)';
            simBtn.style.color = '#2ed573';
            toggleStormEffect(true);

            try {
                await fetch('/api/simulate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preset: 'cloudburst' })
                });
                await fetchSegments();
            } catch (e) {
                console.error('Simulation error:', e);
                if (simBtnText) simBtnText.textContent = 'Simulate Error';
            }
        } else {
            if (simBtnText) simBtnText.textContent = 'Alert Demo';
            isSimulating = false;
            simBtn.style.background = 'linear-gradient(135deg, rgba(255, 71, 87, 0.2), rgba(255, 165, 2, 0.2))';
            simBtn.style.borderColor = 'rgba(255, 71, 87, 0.4)';
            simBtn.style.color = '#ff4757';
            toggleStormEffect(false);

            try {
                await fetch('/api/simulate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preset: 'reset' })
                });
                await fetchSegments();
            } catch (e) {
                console.error('Reset error:', e);
                if (simBtnText) simBtnText.textContent = 'Reset Error';
            }
        }
    };
}

// Export USDMA Advisory Bulletin
const bulletinBtn = document.getElementById('bulletin-btn');
if (bulletinBtn) {
    bulletinBtn.onclick = async () => {
        const modal = document.getElementById('bulletin-modal');
        const body = document.getElementById('bulletin-body');

        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.remove('hidden'), 50);
        }

        if (body) {
            body.innerHTML = '<i>Fetching USDMA Disaster Advisory Stream...</i>';
        }

        try {
            const resp = await fetch('/api/bulletin');
            const data = await resp.json();

            let critHTML = '';
            if (data.critical_sectors && data.critical_sectors.length > 0) {
                critHTML = data.critical_sectors.map(c => `
                    <div style="background: rgba(255, 71, 87, 0.15); border: 1px solid rgba(255, 71, 87, 0.4); padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                        <div style="color: #ff4757; font-weight: bold;">🚨 CRITICAL SECTOR: ${c.id} — ${c.name} (KM ${c.km})</div>
                        <div style="margin-top: 4px; color: #f0f4f8;">• Current FoS: <strong>${c.fos_min.toFixed(2)}</strong> | Saturation Ratio: <strong>${c.saturation_ratio}</strong> | 24h Rain: <strong>${c.rain_24h_mm}mm</strong></div>
                        <div style="margin-top: 4px; color: #ff6b81; font-weight: bold;">➔ ACTION: ${c.recommended_action}</div>
                    </div>
                `).join('');
            } else {
                critHTML = '<div style="color: #2ed573; background: rgba(46, 213, 115, 0.1); border: 1px solid rgba(46, 213, 115, 0.3); padding: 12px; border-radius: 6px;">🟢 NOMINAL STATUS: No sectors currently breach critical stability threshold. Continuous monitoring active.</div>';
            }

            if (body) {
                body.innerHTML = `
                    <div style="border-bottom: 1px solid var(--card-border); padding-bottom: 12px; margin-bottom: 16px;">
                        <div style="color: var(--accent-cyan); font-weight: bold; font-size: 14px;">${data.title}</div>
                        <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">AUTHORITY: ${data.issuing_authority} | TIMESTAMP: ${data.timestamp}</div>
                        <div style="color: var(--text-muted); font-size: 11px;">MODE: ${data.mode} | CORRIDOR: ${data.corridor}</div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <div style="font-weight: bold; margin-bottom: 8px; color: #fff;">SECTOR STATUS SUMMARY (${data.total_monitored_sectors} Monitored Sectors):</div>
                        <div style="display: flex; gap: 16px;">
                            <span>🔴 Unstable: <strong style="color: #ff4757">${data.unstable_count}</strong></span>
                            <span>🟠 Marginal: <strong style="color: #ffa502">${data.marginal_count}</strong></span>
                            <span>Overall Level: <strong style="color: ${data.unstable_count > 0 ? '#ff4757' : '#2ed573'}">${data.overall_status}</strong></span>
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <div style="font-weight: bold; margin-bottom: 8px; color: #fff;">RECOMMENDED EMERGENCY ADVISORIES:</div>
                        ${critHTML}
                    </div>

                    <div style="font-size: 10px; color: var(--text-muted); font-style: italic;">
                        ${data.disclaimer}
                    </div>
                `;
            }
        } catch (e) {
            if (body) {
                body.innerHTML = '<span style="color: #ff4757;">Failed to generate bulletin stream.</span>';
            }
        }
    };
}

// Copy Advisory
const copyBtn = document.getElementById('copy-bulletin-btn');
if (copyBtn) {
    copyBtn.onclick = () => {
        const bodyEl = document.getElementById('bulletin-body');
        if (!bodyEl) return;
        const text = bodyEl.innerText;
        navigator.clipboard.writeText(text);
        const og = copyBtn.textContent;
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => copyBtn.textContent = og, 2000);
    };
}

// Close Modals
const closeBul = document.getElementById('close-bulletin');
if (closeBul) {
    closeBul.onclick = () => {
        const modal = document.getElementById('bulletin-modal');
        if (modal) {
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };
}

const closeProf = document.getElementById('close-profile');
if (closeProf) {
    closeProf.onclick = () => {
        const modal = document.getElementById('profile-modal');
        if (modal) {
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };
}

// ----------------------------------------------------
// Ground-Truth Incident Feedback Loop (Requirement 10)
// ----------------------------------------------------
async function loadIncidents() {
    try {
        const response = await fetch('/api/incidents');
        if (response.ok) {
            const incidents = await response.json();
            renderIncidents(incidents);
            const countBadge = document.getElementById('incident-count');
            if (countBadge) countBadge.textContent = incidents.length + ' LOGGED';
        }
    } catch (e) {
        console.warn('Could not load incidents:', e);
    }
}

function renderIncidents(incidents) {
    const container = document.getElementById('incident-rows');
    if (!container) return;

    if (!incidents || incidents.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:var(--text-muted); font-size:12px; text-align:center;">No field incidents logged yet.</div>';
        return;
    }

    container.innerHTML = incidents.slice().reverse().map((inc, idx) => {
        const t = new Date(inc.timestamp);
        const timeStr = t.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + t.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
        const severityClass = (inc.severity === 'critical' || inc.severity === 'high') ? 'unstable' : inc.severity === 'medium' ? 'marginal' : 'stable';
        const typeLabel = (inc.type || '').replace(/_/g, ' ').toUpperCase();
        return `
            <div class="row" style="--i:${idx};">
                <div><b>${timeStr}</b></div>
                <div>${inc.segment_id || '-'}</div>
                <span class="rain">${typeLabel}</span>
                <span class="status ${severityClass}" style="font-size:9px; padding:4px 8px;">${(inc.severity||'').toUpperCase()}</span>
                <span class="confidence-text">✓ LOGGED</span>
            </div>
        `;
    }).join('');
}

const incidentForm = document.getElementById('incident-form');
if (incidentForm) {
    incidentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const statusEl = document.getElementById('inc-status');

        const segmentEl = document.getElementById('inc-segment');
        const typeEl = document.getElementById('inc-type');
        const severityEl = document.getElementById('inc-severity');
        const rainfallEl = document.getElementById('inc-rainfall');
        const descriptionEl = document.getElementById('inc-description');

        const segmentId = segmentEl ? segmentEl.value : '';
        const type = typeEl ? typeEl.value : '';
        const severity = severityEl ? severityEl.value : '';
        const rainfall = rainfallEl ? (parseFloat(rainfallEl.value) || 0) : 0;
        const description = descriptionEl ? descriptionEl.value.trim() : '';

        // Find FoS of the selected segment from current data
        const seg = allSegments.find(s => s.id === segmentId);
        const fosAtTime = seg ? seg.fos : null;

        if (statusEl) {
            statusEl.textContent = 'Transmitting...';
            statusEl.style.color = '#00f2fe';
        }

        try {
            const res = await fetch('/api/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    segment_id: segmentId,
                    type: type,
                    severity: severity,
                    description: description,
                    fos_at_time: fosAtTime,
                    rainfall_at_time: rainfall
                })
            });

            if (res.ok) {
                if (statusEl) {
                    statusEl.textContent = '✓ Incident logged';
                    statusEl.style.color = '#2ed573';
                }
                incidentForm.reset();
                loadIncidents();
                if (statusEl) setTimeout(() => { statusEl.textContent = ''; }, 3000);
            } else {
                if (statusEl) {
                    statusEl.textContent = '✗ Server error';
                    statusEl.style.color = '#ff4757';
                }
            }
        } catch (err) {
            if (statusEl) {
                statusEl.textContent = '✗ Network error';
                statusEl.style.color = '#ff4757';
            }
        }
    });
}

// Load incidents on startup
loadIncidents();

// Dismiss alarm button
const dismissBtn = document.getElementById('dismiss-emergency');
if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
        window.emergencyMuted = true;
        const bannerEl = document.getElementById('emergency-banner');
        if (bannerEl) bannerEl.classList.remove('show');
        if (window.alarmInterval) {
            clearInterval(window.alarmInterval);
            window.alarmInterval = null;
        }

        // Reset mute if it goes stable later
        setTimeout(() => {
            const unstableCount = allSegments.filter(s => s.risk_level === 'UNSTABLE').length;
            if (unstableCount === 0) window.emergencyMuted = false;
        }, 10000);
    });
}

// Heavy Storm UI & Canvas Engine
let stormRainFrame;
let lightningInterval;
function toggleStormEffect(active) {
    const stormCont = document.getElementById('storm-container');
    const stormRain = document.getElementById('storm-rain-canvas');
    const stormLig = document.getElementById('storm-lightning');
    if (!stormCont || !stormRain) return;

    if (active) {
        stormCont.style.display = 'block';
        playUIBeep('error'); // simulate siren/alert beep

        // Rain canvas logic
        const ctx = stormRain.getContext('2d');
        stormRain.width = window.innerWidth;
        stormRain.height = window.innerHeight;
        const raindrops = [];
        for (let i = 0; i < 300; i++) {
            raindrops.push({
                x: Math.random() * stormRain.width,
                y: Math.random() * stormRain.height,
                len: Math.random() * 20 + 10,
                speed: Math.random() * 15 + 15
            });
        }

        function drawRain() {
            ctx.clearRect(0, 0, stormRain.width, stormRain.height);
            ctx.strokeStyle = 'rgba(174,194,224,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < raindrops.length; i++) {
                let d = raindrops[i];
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - d.len / 4, d.y + d.len);
                d.y += d.speed;
                d.x -= d.speed / 4;
                if (d.y > stormRain.height) {
                    d.y = -20;
                    d.x = Math.random() * stormRain.width + 50;
                }
            }
            ctx.stroke();
            stormRainFrame = requestAnimationFrame(drawRain);
        }
        drawRain();

        // Lightning logic
        lightningInterval = setInterval(() => {
            if (Math.random() > 0.6 && stormLig) {
                stormLig.style.animation = 'none';
                void stormLig.offsetWidth; // trigger reflow
                stormLig.style.animation = 'strobeLightning 0.5s ease-out';
                setTimeout(() => playUIBeep('error'), 100);
            }
        }, 3000);

    } else {
        stormCont.style.display = 'none';
        if (stormRainFrame) cancelAnimationFrame(stormRainFrame);
        if (lightningInterval) clearInterval(lightningInterval);
        if (stormLig) stormLig.style.animation = 'none';
    }
}
