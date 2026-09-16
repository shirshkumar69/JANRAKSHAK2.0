// JANRAKSHAK Dashboard - Real-time Functionality
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        updateInterval: 30000, // 30 seconds
        maxRetries: 3,
        retryDelay: 5000
    };

    // State
    let map = null;
    let markers = [];
    let updateTimer = null;
    let isOnline = true;

    // Sector data
    const SECTORS = [
        { id: 'S01', name: 'Rishikesh', lat: 30.0869, lon: 78.2676, fos: 1.65, rain: 65, status: 'success' },
        { id: 'S03', name: 'Devprayag', lat: 30.1487, lon: 78.6067, fos: 0.68, rain: 340, status: 'danger' },
        { id: 'S07', name: 'Rudraprayag', lat: 30.2844, lon: 78.9819, fos: 1.12, rain: 145, status: 'warning' },
        { id: 'S09', name: 'Karnaprayag', lat: 30.2600, lon: 79.2300, fos: 1.42, rain: 28, status: 'success' },
        { id: 'S11', name: 'Joshimath', lat: 30.5730, lon: 79.5667, fos: 0.81, rain: 12, status: 'danger' }
    ];

    const STATUS_COLORS = {
        danger: '#ff4757',
        warning: '#ffa502',
        success: '#2ed573'
    };

    // DOM Elements
    const elements = {
        map: null,
        lastSync: document.getElementById('last-sync'),
        unstableCount: document.getElementById('unstable-count'),
        maxRain: document.getElementById('max-rain'),
        confidence: document.getElementById('confidence'),
        statusDot: document.querySelector('.status-dot')
    };

    // Initialize
    function init() {
        initMap();
        initNavigation();
        initRealTimeUpdates();
        startRealTimeUpdates();
        updateTime();
        animateCounters();
    }

    // Map Initialization
    function initMap() {
        if (!document.getElementById('map')) return;

        elements.map = L.map('map', {
            zoomControl: false
        }).setView([30.2, 78.8], 9);

        // Dark map tiles
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap, ©CartoDB',
            maxZoom: 19
        }).addTo(elements.map);

        // Add zoom control
        L.control.zoom({ position: 'bottomright' }).addTo(elements.map);

        // Add markers
        addMarkers();

        // Map controls
        initMapControls();
    }

    function addMarkers() {
        SECTORS.forEach(sector => {
            const marker = L.circleMarker([sector.lat, sector.lon], {
                radius: 12,
                fillColor: STATUS_COLORS[sector.status],
                color: STATUS_COLORS[sector.status],
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(elements.map);

            // Add pulse animation for danger status
            if (sector.status === 'danger') {
                const pulseMarker = L.circleMarker([sector.lat, sector.lon], {
                    radius: 20,
                    fillColor: STATUS_COLORS[sector.status],
                    color: 'transparent',
                    opacity: 0.3,
                    fillOpacity: 0.3,
                    interactive: false
                }).addTo(elements.map);

                animatePulse(pulseMarker);
            }

            marker.bindPopup(createPopupContent(sector));
            markers.push(marker);
        });
    }

    function createPopupContent(sector) {
        return `
            <div style="font-family: 'Space Grotesk', sans-serif; min-width: 180px; padding: 4px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="font-size: 16px;">NH07-${sector.id}</strong>
                    <span style="padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;
                        background: ${STATUS_COLORS[sector.status]}20; color: ${STATUS_COLORS[sector.status]};">
                        ${sector.status.toUpperCase()}
                    </span>
                </div>
                <div style="color: #64748b; font-size: 12px; margin-bottom: 12px;">${sector.name}</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                    <div>
                        <div style="color: #64748b;">Factor of Safety</div>
                        <strong style="color: ${STATUS_COLORS[sector.status]}; font-size: 18px;">${sector.fos}</strong>
                    </div>
                    <div>
                        <div style="color: #64748b;">24H Rainfall</div>
                        <strong style="color: #00d9ff;">${sector.rain}mm</strong>
                    </div>
                </div>
            </div>
        `;
    }

    function animatePulse(marker) {
        let radius = 15;
        let opacity = 0.4;

        setInterval(() => {
            radius = radius >= 30 ? 15 : radius + 1;
            opacity = opacity <= 0.1 ? 0.4 : opacity - 0.02;
            marker.setRadius(radius);
            marker.setStyle({ opacity: opacity, fillOpacity: opacity });
        }, 100);
    }

    function initMapControls() {
        const mapBtns = document.querySelectorAll('.map-btn');
        mapBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                mapBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // In production, switch tile layers here
            });
        });
    }

    // Navigation
    function initNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    // Real-time Updates
    function initRealTimeUpdates() {
        // Check online status
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Refresh button
        const refreshBtn = document.querySelector('.btn:not(.btn-primary)');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('refreshing');
                setTimeout(() => refreshBtn.classList.remove('refreshing'), 1000);
                fetchLatestData();
            });
        }

        // Simulate button
        const simulateBtn = document.querySelector('.btn-primary');
        if (simulateBtn) {
            simulateBtn.addEventListener('click', runSimulation);
        }
    }

    function startRealTimeUpdates() {
        updateTimer = setInterval(updateTime, CONFIG.updateInterval);
    }

    function updateTime() {
        if (elements.lastSync) {
            elements.lastSync.textContent = 'Just now';
            elements.lastSync.dataset.time = Date.now();
        }
    }

    async function fetchLatestData() {
        try {
            // Simulate API call - in production, this would be a real fetch
            await simulateFetch();

            // Update UI
            updateDashboard();
            updateTime();

            showNotification('Data synchronized successfully', 'success');
        } catch (error) {
            console.error('Failed to fetch data:', error);
            showNotification('Sync failed. Using cached data.', 'warning');
        }
    }

    async function simulateFetch() {
        return new Promise(resolve => setTimeout(resolve, 1000));
    }

    function updateDashboard() {
        // Update metrics with animation
        animateValue('unstable-count', 3, 150);
        animateValue('max-rain', 84.6, 0);
        animateValue('confidence', 94.2, 0);
    }

    // Animations
    function animateCounters() {
        const counters = document.querySelectorAll('.metric-value');
        counters.forEach(counter => {
            const text = counter.textContent;
            const num = parseFloat(text);
            if (!isNaN(num)) {
                // Counter animation would go here
            }
        });
    }

    function animateValue(elementId, target, decimals = 0) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const current = parseFloat(el.textContent) || 0;
        const diff = target - current;
        const duration = 500;
        const start = performance.now();

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

            const value = current + (diff * eased);
            el.textContent = decimals > 0 ? value.toFixed(decimals) : Math.round(value);

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    // Simulation
    function runSimulation() {
        const btn = document.querySelector('.btn-primary');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Simulating...';

        // Simulate data changes
        SECTORS.forEach((sector, index) => {
            setTimeout(() => {
                sector.fos = +(sector.fos * (0.9 + Math.random() * 0.2)).toFixed(2);
                sector.rain = Math.round(sector.rain * (0.8 + Math.random() * 0.4));

                // Update status based on FoS
                if (sector.fos < 1.0) sector.status = 'danger';
                else if (sector.fos < 1.35) sector.status = 'warning';
                else sector.status = 'success';

                // Update marker
                updateMarker(index);
            }, index * 500);
        });

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<span>▶</span><span>Simulate</span>';
            showNotification('Simulation complete. Risk levels updated.', 'success');
        }, 3000);
    }

    function updateMarker(index) {
        const sector = SECTORS[index];
        if (markers[index]) {
            markers[index].setStyle({ fillColor: STATUS_COLORS[sector.status] });
            markers[index].setPopupContent(createPopupContent(sector));
        }
    }

    // Notification System
    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${type === 'success' ? '✓' : type === 'warning' ? '⚠' : 'ℹ'}</span>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Online/Offline Handlers
    function handleOnline() {
        isOnline = true;
        if (elements.statusDot) {
            elements.statusDot.classList.add('active');
        }
        showNotification('Connection restored', 'success');
    }

    function handleOffline() {
        isOnline = false;
        if (elements.statusDot) {
            elements.statusDot.classList.remove('active');
        }
        showNotification('Offline mode - using cached data', 'warning');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Add notification styles
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 14px 20px;
            background: var(--dark-lighter, #1e2a3d);
            border: 1px solid var(--border, rgba(255,255,255,0.08));
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s ease;
            z-index: 9999;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        .notification.show {
            transform: translateY(0);
            opacity: 1;
        }
        .notification-success { border-color: #2ed573; }
        .notification-success .notification-icon { color: #2ed573; }
        .notification-warning { border-color: #ffa502; }
        .notification-warning .notification-icon { color: #ffa502; }
        .spinner {
            width: 14px;
            height: 14px;
            border: 2px solid transparent;
            border-top-color: currentColor;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // Expose for debugging
    window.JANRAKSHAK = {
        refresh: fetchLatestData,
        simulate: runSimulation,
        getSectors: () => SECTORS,
        getMap: () => map
    };
})();