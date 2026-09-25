#  SolarIS: Enterprise SCADA Management & Fleet Analytics

SolarIS is a full-stack, real-time SCADA (Supervisory Control and Data Acquisition) system designed for monitoring, analytics, and active control of remote solar panel cleaning fleets. 

This repository features a luxury-minimalist HMI frontend, a secure API relay gateway, and a hardware abstraction layer (HAL) supporting both **virtual edge simulation** and **physical STM32 hardware deployment** via cellular/MQTT channels.

---

##  How the Software Maps to Hardware (Concept Guide)

If your background is in hardware design, firmware, or PLCs, here is how the software stack corresponds to standard electrical engineering components:

| Software Component | SCADA/Hardware Equivalent | Purpose |
| :--- | :--- | :--- |
| **React UI (Frontend)** | **HMI (Human Machine Interface)** | The monitoring screen displaying live gauges, dial readouts, telemetry plots, and operational controls. |
| **Node.js (Backend Gateway)** | **SCADA Master Unit / Gateway** | The central controller that listens for incoming telemetry, parses data packets, logs them to the historian, and dispatches command overrides. |
| **MongoDB (Database)** | **Data Historian** | The central log storage. It records all historical readings chronologically for charting, trend analysis, and PDF report creation. |
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
*   Real-time meteorological validation integrated via the Open-Meteo API.

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

> [!NOTE]
> You **do not** need to install MongoDB on your system. The backend uses an automatic, local, in-memory MongoDB server (`mongodb-memory-server`) that spins up on port `27017` automatically.

---

##  Step-by-Step Installation and Launch Guide

Follow these steps to set up and start the complete SCADA simulation fleet:

### 1. Set Up Python Virtual Environment
Create a virtual environment named `solarvenv` in the **root** folder and install the Python dependencies.

*   **On macOS / Linux:**
    ```bash
    python3 -m venv solarvenv
    ./solarvenv/bin/pip install flask==3.0.3 pandas==2.2.2 numpy==1.26.4 scikit-learn==1.5.1 python-dotenv flask-cors pymongo requests aiohttp
    ```
*   **On Windows:**
    ```powershell
    python -m venv solarvenv
    .\solarvenv\Scripts\pip install flask==3.0.3 pandas==2.2.2 numpy==1.26.4 scikit-learn==1.5.1 python-dotenv flask-cors pymongo requests aiohttp
    ```

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
MONGO_URI=mongodb://127.0.0.1:27017/solar_scada
DATA_SOURCE=SIMULATOR
```

### 4. Initialize & Seed Database
Start the MongoDB memory server first to download the MongoDB binary and seed the database:
```bash
# Terminal 1: Start the in-memory database server
npm run start:db

# Terminal 2: Seed the mock telemetry records
node backend/scripts/seedReadings.js
```
*(Once seeded successfully with "Success: Inserted 300 records", you can stop/close Terminal 1 and 2).*

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

SolarIS abstracts the telemetry source. When transitioning from simulated nodes to actual physical cellular modems sending packets from the field:

1.  Setup an **MQTT Broker** (e.g., Mosquitto, EMQX, or HiveMQ) on your server.
2.  Configure your STM32 microcontrollers to publish their 64-byte telemetry payloads in JSON format to the broker.
3.  Edit the central Gateway configuration file: [BACKEND/.env](file:///Users/MedhanshNagpal/Desktop/Kunjika/solar-farm-dashboard/BACKEND/.env):
    ```env
    # Change data source from SIMULATOR to PHYSICAL
    DATA_SOURCE=PHYSICAL
    
    # Configure your MQTT Broker URL
    MQTT_BROKER_URL=mqtt://your-broker-ip-address:1883
    ```
4.  Restart your Node.js backend Gateway (`node server.js`). The gateway will now subscribe to live cellular hardware nodes, log their telemetry directly, and route your UI command overrides back to the physical devices.
