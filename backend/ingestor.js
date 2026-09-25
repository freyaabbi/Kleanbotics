import fs from 'fs';
import path from 'path';
import connectDB, { query } from './db.js';

// 1. RE-USE YOUR PARSING LOGIC (Updated for the new 64-byte format)
const parseBinaryPacket = (buffer) => {
  return {
    device_id: buffer.readUInt32LE(0),
    device_state: buffer.readUInt16LE(4),
    temperature: buffer.readUInt16LE(6) / 100,
    humidity: buffer.readUInt16LE(8) / 100,
    voltage_battery: buffer.readUInt16LE(10),
    voltage_solar_panel: buffer.readUInt16LE(12),
    running_current: buffer.readUInt16LE(14),
    avg_current: buffer.readUInt16LE(16),
    motor_speed: buffer.readUInt16LE(18) / 100,
    panel_location: buffer.readUInt16LE(20),
    battery_percentage: buffer.readUInt8(22),
    connectivity_status: buffer.readUInt8(23),
    error_code: buffer.readUInt32LE(24),
    total_runtime: buffer.readUInt32LE(28),
    // ... we can add more fields from your spec here
    timestamp: new Date().toISOString(),
    status: buffer.readUInt16LE(4) === 2 ? 'FAULT' : 'NORMAL'
  };
};

const processFile = async (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size !== 64) return; // Ignore if file is incomplete

    const buffer = fs.readFileSync(filePath);
    const jsonData = parseBinaryPacket(buffer);

    // Direct insert into the scada_packets table (flat columns).
    await query(
      `INSERT INTO scada_packets
        (device_id, device_state, temperature, humidity, voltage_battery,
         voltage_solar_panel, running_current, avg_current, motor_speed,
         panel_location, battery_percentage, connectivity_status, error_code,
         total_runtime, \`timestamp\`, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jsonData.device_id,
        jsonData.device_state,
        jsonData.temperature,
        jsonData.humidity,
        jsonData.voltage_battery,
        jsonData.voltage_solar_panel,
        jsonData.running_current,
        jsonData.avg_current,
        jsonData.motor_speed,
        jsonData.panel_location,
        jsonData.battery_percentage,
        jsonData.connectivity_status,
        jsonData.error_code,
        jsonData.total_runtime,
        new Date(jsonData.timestamp),
        jsonData.status,
      ]
    );

    console.log(`📥 Ingested: Device ${jsonData.device_id} | State: ${jsonData.device_state} | Time: ${jsonData.timestamp}`);
  } catch (err) {
    console.error(`❌ Ingestion failed for ${filePath}:`, err.message);
  }
};

// 2. THE WATCHER LOOP
const startIngestion = () => {
  const directoryPath = './'; // Directory where .dat files are generated
  
  console.log("🚀 SCADA Ingestion Engine ACTIVE. Watching for .dat files...");

  // We poll every 5 seconds to match your simulator
  setInterval(() => {
    for (let i = 1; i <= 5; i++) {
      const fileName = `solar_panel_${i}.dat`;
      const filePath = path.join(directoryPath, fileName);
      
      if (fs.existsSync(filePath)) {
        processFile(filePath);
      }
    }
  }, 5000);
};

// 3. Connect to DB and Start
connectDB()
  .then(() => startIngestion())
  .catch(err => console.error("DB Connection Failed", err));