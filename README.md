# 🛡️ JANRAKSHAK — National & Global Multi-Hazard Landslide Early Warning System

> **Physics-Based Geotechnical Slope Stability · Real-Time Satellite Telemetry · Keyless Doppler Weather Radar · 3D WebGL Topography Studio**  
> *Geospatial Multi-Hazard Predictive Intelligence | COGNITIA 2026*  
> **Live Demo:** [https://janrakshak-cognitia.vercel.app/](https://janrakshak-cognitia.vercel.app/)

---

## 🎯 Executive Summary & System Capabilities

**JANRAKSHAK** is an enterprise-grade, real-time multi-hazard geotechnical early warning and emergency command center. Originally developed for the high-risk NH-07 Himalayan corridor in Uttarakhand, the system has evolved into a comprehensive **Pan-India & Global Landslide Intelligence Platform** capable of evaluating slope failure risks for any coordinate on Earth.

By coupling the **Mohr-Coulomb failure criterion** with **Green-Ampt hydrological infiltration** and **pseudo-static seismic horizontal acceleration ($k_h$)**, JANRAKSHAK bridges the gap between raw meteorological/seismic telemetry and actionable geotechnical engineering decisions.

```
                                  ┌──────────────────────────────┐
                                  │   Global Multi-Source Feeds  │
                                  └──────────────┬───────────────┘
                                                 │
                  ┌──────────────────────────────┼──────────────────────────────┐
                  │                              │                              │
                  ▼                              ▼                              ▼
        ┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
        │ Open-Meteo &     │           │ USGS Real-Time   │           │ NASA SRTM 30m    │
        │ RainViewer Radar │           │ Earthquake Feed  │           │ Global DEM / API │
        │ (Precip / Wind)  │           │ (Magnitude / Dist)│           │ (Elevation/Slope)│
        └─────────┬────────┘           └─────────┬────────┘           └─────────┬────────┘
                  │                              │                              │
                  └──────────────────────┬───────┴──────────────────────────────┘
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │   JANRAKSHAK Geotechnical Physics Engine       │
                 │   • Mohr-Coulomb Effective Stress Analysis     │
                 │   • Green-Ampt Pore Water Pressure u(t)        │
                 │   • Pseudo-Static Seismic Inertia Force (kh)   │
                 └───────────────────────┬────────────────────────┘
                                         │
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │   Real-Time Command Stream & Visual Consoles   │
                 │   • Bi-directional WebSockets (Flask-SocketIO) │
                 │   • Tactical Leaflet GIS & Live Doppler Radar  │
                 │   • 3D WebGL (Three.js) DEM Topography Studio  │
                 │   • Automated NDMA/USDMA Emergency Bulletins   │
                 └────────────────────────────────────────────────┘
```

---

## 🌟 Key Features & Innovations

### 1. 🌐 Pan-India Corridors & Universal Global Point Assessment
- **50+ Pre-Configured High-Risk Corridors**: Out-of-the-box real-time monitoring across major Indian landslide belts:
  - **Uttarakhand (Garhwal & Kumaon)**: Rishikesh, Devprayag, Rudraprayag, Karnaprayag, Chamoli, Joshimath, Badrinath, Nainital, Almora, Pithoragarh.
  - **Himachal Pradesh**: Shimla, Kinnaur (Reckong Peo), Kullu-Manali, Kangra-Dharamshala, Solan.
  - **Jammu & Kashmir & Ladakh**: NH-44 Jammu-Srinagar Highway, Ramban, Banihal, Zoji La Pass, Kargil-Leh.
  - **Western Ghats**: Konkan (Mahad, Chiplun), Nilgiris (Ooty, Coonoor), Kerala (Idukki, Wayanad, Munnar).
  - **Northeast India**: Shillong, Kohima, Gangtok, NH-10 Kalimpong-Sikkim corridor.
- **Universal Coordinate Evaluator (`/api/assess_point`)**: Click anywhere on the global map to retrieve elevation, compute slope angle ($\beta$), ingest live 24h precipitation, and calculate the instantaneous Factor of Safety ($\text{FoS}$).

### 2. 📡 Keyless Global Doppler Weather Radar (`/rainfall`)
- **RainViewer Live Radar Tile Pipeline**: Keyless, high-resolution Doppler radar integration delivering animated storm cell loops, timeline scrubbing, color palette customization, and infrared satellite cloud coverage overlays.
- **Continuous Meteorological Ingestion**: Zero-token Open-Meteo API ingestion delivering precipitation rates, 24-hour antecedent rainfall accumulations, temperatures, surface pressures, and relative humidities.

### 3. 🏔️ 3D WebGL Topography & Global Elevation Studio (`/terrain`)
- **Dual-Mode 3D WebGL & 2D Topographic GIS**: Switch seamlessly between interactive Three.js 3D terrain meshes and high-resolution OpenTopoMap / Esri Satellite cartography.
- **Procedural DEM Elevation Generator**: Procedurally reconstructs 3D topographical relief grids using real-world elevation matrices, wireframe contour overlays, and risk-color shaders.
- **Click-to-Inspect Telemetry Probe**: Click any location worldwide to probe real-time elevation, derive slope gradients, select soil stratigraphy, and simulate geotechnical stability.

### 4. ⚡ Multi-Hazard Earthquake & Cloudburst Simulation
- **USGS Seismic Integration**: Ingests real-time global earthquake feeds (`earthquake.usgs.gov`) to compute epicentral distance attenuation and dynamic pseudo-static horizontal acceleration ($k_h$).
- **Interactive Multi-Hazard Sandbox**:
  - 🌧️ **Cloudburst Surge**: Simulates extreme downpours ($110\,\text{mm/hr}$) to observe rapid pore-water pressure spikes and infiltration saturation.
  - 🌋 **Seismic Shock**: Applies horizontal earthquake inertia forces ($k_h = 0.18\,\text{g}$) to simulate slope liquefaction and rockfall triggers.
  - 🚨 **Compound Multi-Hazard**: Evaluates simultaneous cloudburst + seismic shock scenarios to identify catastrophic multi-hazard slope collapses.

### 5. 🔄 Low-Latency Real-Time WebSockets (`Flask-SocketIO`)
- Bi-directional real-time telemetry streaming that synchronizes sector risk levels, sensor readings, and alert banners across all connected operator dashboards without polling or page reloads.

---

## 📐 Mathematical Physics & Geotechnical Formulations

JANRAKSHAK rejects heuristic approximations in favor of rigorous, closed-form limit equilibrium geotechnical physics:

### 1. Multi-Hazard Mohr-Coulomb Slope Stability Model

The **Factor of Safety ($\text{FoS}$)** is the ratio of resisting shear strength ($\tau_{\text{resist}}$) to driving gravitational and seismic shear stresses ($\tau_{\text{drive}}$) along a slip surface at depth $z$:

$$\text{FoS} = \frac{\tau_{\text{resist}}}{\tau_{\text{drive}}} = \frac{c' + (\sigma_n - u - k_h \gamma z \sin\beta\cos\beta)\tan\phi'}{\gamma z \sin\beta\cos\beta + k_h \gamma z \cos^2\beta}$$

Where:
- $\sigma_n = \gamma z \cos^2\beta$ is the total normal stress on the failure plane ($\text{kPa}$).
- $c'$ is the effective soil cohesion ($\text{kPa}$).
- $\phi'$ is the effective internal angle of friction ($^\circ$).
- $\gamma$ is the moist unit weight of the soil mass ($\text{kN/m}^3$).
- $z$ is the depth of the failure slip plane ($\text{m}$).
- $\beta$ is the slope inclination angle ($^\circ$).
- $u$ is the pore-water pressure along the shear plane ($\text{kPa}$).
- $k_h$ is the dimensionless pseudo-static horizontal seismic acceleration coefficient ($0.00 \le k_h \le 0.35$).

---

### 2. Green-Ampt Hydrological Pore-Water Pressure Coupling

Rainfall infiltration reduces effective stress ($\sigma_n' = \sigma_n - u$) by increasing subsurface pore-water pressure:

$$u = m \cdot \gamma_w \cdot z \cdot \cos^2\beta \quad (\gamma_w = 9.81\,\text{kN/m}^3)$$

The **Saturation Ratio ($m$)** ($0.10 \le m \le 1.00$) is dynamically computed using a modified Green-Ampt infiltration relationship based on rainfall intensity ($I$), continuous rainfall duration ($t$), and 24-hour cumulative precipitation ($P_{24\text{h}}$):

$$m = \max \left( \frac{\min(I, K_s) \cdot t}{z \cdot n}, \; \frac{\min(P_{24\text{h}}, K_s \cdot 24)}{z \cdot n} \right)$$

Where:
- $K_s$ = Saturated Hydraulic Conductivity ($\text{m/s}$).
- $n$ = Effective Soil Porosity ($n \approx 0.40$).

---

### 3. Stability Thresholds & Threat Classifications

| Factor of Safety ($\text{FoS}$) | Risk Classification | System Status | Recommended Emergency Action |
| :---: | :---: | :---: | :--- |
| $\text{FoS} < 1.00$ | 🔴 **UNSTABLE** | **CRITICAL HIGH ALERT** | Immediate road closure, NDMA alert broadcast, evacuation of toe settlements. |
| $1.00 \le \text{FoS} \le 1.30$ | 🟡 **MARGINAL** | **ELEVATED SURVEILLANCE** | Speed restrictions, heavy vehicle diversion, deploy drone & patrol units. |
| $\text{FoS} > 1.30$ | 🟢 **STABLE** | **NOMINAL MONITORING** | Continuous satellite telemetry monitoring, normal traffic flow permitted. |

---

## 🪨 Soil Mechanics Geotechnical Lookup Matrix

Geotechnical parameters calibrated against Himalayan and Western Ghats lithologies (Geological Survey of India / Gupta & Joshi 2016):

| Soil Class ID | Lithological Description | Cohesion $c'$ ($\text{kPa}$) | Friction $\phi'$ ($^\circ$) | Unit Weight $\gamma$ ($\text{kN/m}^3$) | Depth $z$ ($\text{m}$) | Conductivity $K_s$ ($\text{m/s}$) |
|---|---|:---:|:---:|:---:|:---:|:---:|
| `alluvial_plain` | River Alluvium / Silt | $5.0$ | $28.0^\circ$ | $18.0$ | $2.0$ | $1.0 \times 10^{-5}$ |
| `residual_hill` | Weathered Residual Hill Soil | $12.0$ | $32.0^\circ$ | $19.5$ | $1.5$ | $5.0 \times 10^{-6}$ |
| `colluvial_slope`| Colluvial Deposit / Talus | $8.0$ | $26.0^\circ$ | $17.5$ | $3.0$ | $8.0 \times 10^{-6}$ |
| `weathered_rock` | Schist / Phyllite / Fractured Gneiss | $25.0$ | $35.0^\circ$ | $22.0$ | $1.0$ | $1.0 \times 10^{-7}$ |
| `debris_fan` | Debris Flow Fan / Glacial Moraine | $3.0$ | $30.0^\circ$ | $18.5$ | $2.5$ | $2.0 \times 10^{-5}$ |

---

## 🗺️ Monitored Regional Corridors

```
JANRAKSHAK MONITORED SECTOR NETWORK (50+ SECTORS)
├── 🏔️ Uttarakhand Garhwal (NH-07 / Char Dham)
│   ├── SEC-01 to SEC-07: Rishikesh · Byasi · Devprayag · Srinagar · Rudraprayag · Karnaprayag · Chamoli
│   └── SEC-08 to SEC-12: Joshimath (Sinking Zone) · Govindghat · Pandukeshwar · Lambagar · Badrinath
├── 🌲 Uttarakhand Kumaon
│   └── SEC-13 to SEC-17: Nainital · Almora · Pithoragarh · Bhowali · Dharchula (Tawaghat)
├── ⛰️ Himachal Pradesh
│   └── SEC-18 to SEC-24: Shimla (Taradevi) · Solan · Kinnaur (Nigulsari) · Kullu · Manali · Dharamshala · Mandi
├── ❄️ Jammu, Kashmir & Ladakh
│   └── SEC-25 to SEC-32: Ramban · Banihal · Khooni Nala · Panthyal · Anantnag · Zoji La Pass · Drass · Kargil
├── 🌴 Western Ghats (Maharashtra, Tamil Nadu, Kerala, Karnataka)
│   └── SEC-33 to SEC-42: Mahad (Varandha Ghat) · Chiplun · Khandala · Ooty · Coonoor · Wayanad · Idukki · Munnar · Agumbe
├── 🌿 Northeast India
│   └── SEC-43 to SEC-50: Shillong · Guwahati · Kohima · Dimapur · Gangtok · Kalimpong · NH-10 Teesta Corridor
└── 🌍 Universal Global Coordinates
    └── Dynamic Assessment (/api/assess_point) anywhere on Earth
```

---

## 🚀 Quick Start & Installation

### Prerequisites
- Python 3.9+ installed
- Modern WebGL-capable browser (Chrome, Firefox, Edge, Safari)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/<your-username>/janrakshak.git
cd janrakshak

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Launch the Application

```bash
python app.py
```

The server will initialize the background telemetry cache and start on **`http://localhost:5000`**.

---

## 🧭 Application Web Navigation

| Route | View Description |
|---|---|
| `/` | **Tactical Splash & SatCom Boot Page**: Three.js particle canvas, direct access to Dashboard & Radar. |
| `/dashboard` | **Glassmorphism Command Center**: Multi-hazard map, real-time metrics, sector table, and live simulation controls. |
| `/rainfall` | **Live RainViewer Doppler Radar Console**: Animated precipitation frames, timeline playback, and worldwide weather lookups. |
| `/rainfall-landing` | **SatCom Precipitation Portal**: Atmospheric pulse telemetry with procedural downpour audio synthesis. |
| `/terrain` | **3D WebGL Topography & Global DEM Studio**: Interactive Three.js elevation mesh generator and global coordinate probe. |
| `/validation` | **Historical Incident & Model Validation Audit**: Accuracy benchmarks, confusion matrices, and feedback logger. |

---

## 🛠️ Complete REST & WebSocket API Specification

### REST Endpoints

#### 1. Real-Time Corridor Telemetry
```http
GET /api/segments
```
Returns all 50+ monitored sectors with live Factor of Safety, 24h accumulated rainfall, current rain rate, elevation, slope angle, and threat category.

---

#### 2. Multi-Hazard Simulation Controller
```http
GET or POST /api/simulate
Content-Type: application/json

{
  "preset": "cloudburst" | "earthquake" | "compound" | "reset",
  "kh": 0.18
}
```
*Also supports query parameters for simple GET requests (`/api/simulate?preset=storm`).*

---

#### 3. Universal Global Point Assessment
```http
POST /api/assess_point
Content-Type: application/json

{
  "lat": 30.28,
  "lng": 79.15,
  "slope_deg": 38.5,
  "soil_class": "colluvial_slope",
  "rainfall_24h_mm": 45.0,
  "rain_rate_mm_h": 12.0,
  "kh": 0.05
}
```
*Returns instantaneous FoS, pore water pressure $u$, normal stress $\sigma_n$, saturation ratio $m$, and risk level.*

---

#### 4. Global DEM Elevation Lookup
```http
GET /api/elevation?lat=30.28&lng=79.15
```
Returns elevation in meters above sea level via Open-Meteo SRTM 30m dataset.

---

#### 5. Live Doppler Radar Frames
```http
GET /api/radar_frames
```
Returns current RainViewer Doppler radar timestamp series and color scheme mappings for animated map playback.

---

#### 6. Real-Time USGS Earthquakes
```http
GET /api/earthquakes
```
Returns active global earthquake events ingested directly from the USGS GeoJSON feed.

---

#### 7. Official Emergency Advisory Bulletin
```http
GET /api/bulletin
```
Generates a structured NDMA/USDMA emergency disaster management advisory containing critical sector alerts, meteorological summaries, and recommended tactical countermeasures.

---

#### 8. System Health & Performance
```http
GET /api/health
```
Returns server uptime, telemetry cache status, background worker health, and active sector counts.

---

### WebSocket Stream Events (`Flask-SocketIO`)

| Event Name | Direction | Payload Description |
|---|:---:|---|
| `connect` | Client $\rightarrow$ Server | Establishes bi-directional telemetry session. |
| `request_update` | Client $\rightarrow$ Server | Requests immediate full-state payload refresh. |
| `data_update` | Server $\rightarrow$ Client | Broadcasts updated sector states, FoS values, and simulation triggers. |
| `alert` | Server $\rightarrow$ Client | Broadcasts urgent emergency warnings when critical sectors drop below $\text{FoS} < 1.00$. |

---

## 🛡️ Zero-Key & Zero-Cost Open Infrastructure

JANRAKSHAK is architected to operate with **zero API keys** and **zero paid dependencies**:

- **Cartography & Tiles**: OpenTopoMap, CartoDB Dark Matter, and OpenStreetMap.
- **Meteorological Data**: Open-Meteo Non-Commercial Global Forecast & Historical APIs.
- **Doppler Radar Tiles**: RainViewer Global Weather Radar Tile Cache API.
- **Elevation Data**: NASA SRTM 30m 1-arc-second Digital Elevation Model via Open-Meteo.
- **Seismic Telemetry**: USGS Earthquake Hazards Program GeoJSON Live Feeds.

---

## 👥 Contributors & Acknowledgments

- **Lead Development**: Developed for **COGNITIA 2026** Geotechnical & Geospatial Hackathon.
- **Geotechnical Standards**: Geological Survey of India (GSI), Bureau of Indian Standards (BIS 14458), and National Disaster Management Authority (NDMA).
- **Cartographic Data**: © OpenStreetMap contributors, © CartoDB, © RainViewer, © Open-Meteo, and USGS.

---

## 📜 License

This project is licensed under the **MIT License** — open and accessible for humanitarian, academic, and disaster management research.

<div align="center">
  <sub>🛡️ JANRAKSHAK — Protecting Mountain Transit Corridors with Physics-Driven Geospatial AI</sub>
</div>
