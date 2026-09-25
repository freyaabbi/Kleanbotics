#  SolarIS: Enterprise SCADA Management & Fleet Analytics

SolarIS is a full-stack, real-time SCADA (Supervisory Control and Data Acquisition) system designed for monitoring, analytics, and active control of remote solar panel cleaning fleets. 

This repository features a luxury-minimalist HMI frontend, a secure API relay gateway, and a hardware abstraction layer (HAL) supporting both **virtual edge simulation** and **physical STM32 hardware deployment** over **cellular REST API** channels.

---

##  How the Software Maps to Hardware (Concept Guide)

If your background is in hardware design, firmware, or PLCs, here is how the software stack corresponds to standard electrical engineering components:

| Software Component | SCADA/Hardware Equivalent | Purpose |
| :--- | :--- | :--- |
| **React UI (Frontend)** | **HMI (Human Machine Interface)** | The monitoring screen displaying live gauges, dial readouts, telemetry plots, and operational controls. |
| **Node.js (Backend Gateway)** | **SCADA Master Unit / Gateway** | The central controller that exposes REST endpoints, ingests incoming telemetry, parses data packets, logs them to the historian, and dispatches command overrides. |
| **MySQL / MariaDB (Database)** | **Data Historian** | The central log storage. It records all historical readings chronologically for charting, trend analysis, and PDF report creation. |
| **Python Simulator** | **Virtual Test Bench (RTU Node)** | Acts as a software-simulated Remote Terminal Unit (RTU) out in the field. It simulates sensors (thermocouples, light meters, current sensors) and cleaning panel motors. |

---

##  Telemetry Packet Structure (64-byte payload equivalent)

The system ingests hardware telemetry packets containing essential solar sensor diagnostics. Deployed nodes report:

*   **Environmental Probes**: Solar Irradiance ($W/m^2$), Panel Temp (°C), Ambient Temp (°C), Humidity (%), Rainfall detection.
*   **Electrical Sensor Loop**: DC Bus Voltage ($V$), DC Bus Current ($A$), Grid Inverter Active Power Output ($kW$).
*   **MCU State & Battery Unit**: Li-ion Battery voltage, Battery Charge percentage, chip uptime (hours), firmware tag.
*   **Actuator Feedback**: Motor speed feedback (RPM), clean cycle status, error register diagnostics.

---

##  Core System Features

### 1. Unified HMI Login (Role-Based Access Control)
*   **Operations Analyst (Viewer/User)**: Designed for view-only operators. Provides access to the Operations Map, Alerts Log, and Reports Tab. Restricts the ability to issue motor override commands or register/remove solar hubs.
*   **System Administrator (Full Control)**: Designed for fleet technicians. Full privileges, enabling command execution, motor parameter tuning, fault overrides, and node additions/deletions.

### 2. Live Fleet Map & Weather Dashboard
*   Geospatial map rendering marker pins for all deployed solar installations.
*   Color-coded markers show live hub statuses at a glance:
    *    **Active**: Normal daylight generation.
    *    **Night**: Irradiance is zero, solar panel generation inactive.
    *    **Fault**: Actuator or voltage abnormalities flagged.
    *    **Offline**: No signal received for $>30$ seconds.
*   Real-time meteorological validation integrated via the Open-Meteo REST API.

### 3. Actuator Control Center (Active Command Link)
*   Provides manual overrides for field cleaning mechanisms:
    *   **Operational Mode**: Switch between `AUTO` (light-sensor triggered) and `MANUAL` overrides.
    *   **Motor Speed Adjustment**: Set target rotation speed (RPM).
    *   **Start Clean / Dock Command**: Force cleaning actuators to deploy or return to safety dock positions.

### 4. Fleet Alerts & Diagnostics Tab
*   Central dashboard for registering fault telemetry:
    *   `F1` (Panel Over-Temperature)
    *   `F4` (Battery Over-Charge Protection)
    *   `F5` (Actuator Over-Current)
    *   `F8` (Under-voltage / Battery Drain)
    *   `F10` (Cellular Signal/Connectivity Loss)

### 5. Historic Trend Analysis & Export Utility
*   Plot historical data trends over time (Voltage curves, generation efficiency metrics).
*   Built-in documentation tool to export system summaries to **PDF Reports** or **Excel Spreadsheets** with a single click.

### 6. Node Deployment Manager
*   Deploy new solar installations by defining a unique Node ID, Location, kW Capacity, and GPS Latitude/Longitude. The system automatically initializes telemetry generation for newly registered sites.
*   Decommission old sites by purging their historical database packets.

---

##  Software Pre-requisites

You must install the following software tools to run this system locally:

1.  **Node.js (v18.x or higher)**: [Download Node.js](https://nodejs.org/)
2.  **Python (v3.9 or higher)**: [Download Python](https://www.python.org/)
3.  **MySQL (v8.x) or MariaDB (v10.x+)**: [Download MySQL](https://dev.mysql.com/downloads/) — a running server the backend and Python simulator connect to.

> [!NOTE]
> Both the Node.js backend and the Python simulator read the **same** MySQL/MariaDB connection details from `backend/.env`. Create an empty database (e.g. `solar_scada`) and set `DB_NAME` to match; the schema is created for you by the init step below.

---

##  Step-by-Step Installation and Launch Guide

Follow these steps to set up and start the complete SCADA simulation fleet:

### 1. Set Up Python Virtual Environment
Create a virtual environment named `solarvenv` in the **root** folder and install the Python dependencies.

*   **On macOS / Linux:**
    ```bash
    python3 -m venv solarvenv
    ./solarvenv/bin/pip install -r requirements.txt
    ```
*   **On Windows:**
    ```powershell
    python -m venv solarvenv
    .\solarvenv\Scripts\pip install -r requirements.txt
    ```

> The Python stack uses **PyMySQL** to talk to MySQL/MariaDB (no MongoDB driver required).

### 2. Install Node.js Dependencies
Install the package dependencies in the project directories:
```bash
# Install root tools (concurrently)
npm install

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
cd ..
```

### 3. Create Backend Configuration
Create a `.env` file inside the `backend/` folder:
```env
PORT=5050
DATA_SOURCE=SIMULATOR

# --- MySQL / MariaDB connection (used by both the Node backend and Python simulator) ---
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=solar_scada
DB_POOL_SIZE=10

# --- External REST services (per-farm keys/tokens are stored in the DB, not here) ---
THINGSPEAK_BASE=https://api.thingspeak.com
BLYNK_BASE=https://blr1.blynk.cloud
```

> MQTT is **not** required. Telemetry ingest and device control run over REST APIs (ThingSpeak / Blynk). The optional `MQTT_URL` is left blank, which keeps the MQTT listener disabled.

### 4. Initialize the Database
With your MySQL/MariaDB server running and the empty `DB_NAME` database created, build the schema and seed mock telemetry:
```bash
# Creates the tables and inserts sample readings
npm run init:db
```
*(This runs `backend/initDb.js` against the connection defined in `backend/.env`.)*

### 5. Fire Ignition (Run Everything Concurrently)
Now start the HMI Frontend, Gateway API, and Edge Simulator concurrently in a single command:
```bash
npm run ignition
```
*(This will automatically boot all services and open http://localhost:3000 in your web browser).*

---

## Credentials & Login Levels

*   **Operations Analyst**: Select the **Operations** card and click **Establish Connection** (no password required).
*   **System Administrator**: Select the **Administrator** card, enter password **`admin`**, and click **Establish Connection**.

---

##  Connecting Actual Hardware (STM32 + SIMCOM Module)

SolarIS abstracts the telemetry source. Communication with physical field hardware is done entirely over **REST APIs** — no MQTT broker is required. When transitioning from simulated nodes to actual cellular modems sending packets from the field:

1.  Configure your STM32 microcontrollers to push their telemetry payloads in JSON format to a REST endpoint — either the backend's own ingest route or a **ThingSpeak** channel that the gateway reads.
2.  Store each farm's **ThingSpeak** (telemetry) and **Blynk** (control) keys/tokens in the database against that farm's record. These are read per-farm at runtime, so they are not placed in `.env`.
3.  Edit the central Gateway configuration file `backend/.env`:
    ```env
    # Change data source from SIMULATOR to PHYSICAL
    DATA_SOURCE=PHYSICAL

    # REST service bases (override only if you use a different region/host)
    THINGSPEAK_BASE=https://api.thingspeak.com
    BLYNK_BASE=https://blr1.blynk.cloud
    ```
4.  Restart your Node.js backend Gateway (`node server.js`). The gateway will now read live telemetry from the devices' REST channels, log it to MySQL, and route your UI command overrides back to the physical devices via the Blynk REST API (virtual-pin writes).
