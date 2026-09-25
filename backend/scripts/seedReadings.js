// scripts/seedReadings.js
import { pool, query } from "../db.js";
import dotenv from "dotenv";

dotenv.config();

const FARMS = [
  { id: 1, city: "Delhi" },
  { id: 2, city: "Mumbai" },
  { id: 3, city: "Bangalore" },
  { id: 4, city: "Chennai" },
  { id: 5, city: "Hyderabad" }
];

const RECORDS_PER_FARM = 60; // Total 300 records (60 * 5)

function get15MinSlotStart(date = new Date()) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(Math.floor(m / 15) * 15);
  return d;
}

function generateReading(index, farm) {
  const now = new Date();
  // Spread data points back in 15-min increments
  now.setMinutes(now.getMinutes() - index * 15);

  const v_solar = Math.floor(2400 + Math.random() * 200);
  const current = Math.floor(120 + Math.random() * 10);

  return {
    device_id: farm.id,
    city: farm.city,
    device_state: Math.floor(Math.random() * 3),
    fw_version: 101,
    temperature: parseFloat((28 + Math.random() * 5).toFixed(2)),
    humidity: parseFloat((65 + Math.random() * 10).toFixed(2)),
    voltage_battery: Math.floor(1100 + Math.random() * 100),
    voltage_solar_panel: v_solar,
    running_current: current,
    ac_power_kw: parseFloat(((v_solar * current) / 1000).toFixed(2)),
    avg_current: Math.floor(110 + Math.random() * 15),
    motor_speed: parseFloat((Math.random() * 0.1).toFixed(2)),
    panel_location: Math.floor(10 + Math.random() * 5),
    battery_percentage: Math.floor(Math.random() * 101),
    connectivity_status: 1,
    error_code: 0,
    total_runtime: Math.floor(30 + Math.random() * 20),

    dbg_accel: Math.floor(Math.random() * 1000),
    dbg_gyro: Math.floor(Math.random() * 1000),
    dbg_rain: Math.floor(Math.random() * 100),
    dbg_wind: Math.floor(Math.random() * 100),
    dbg_last_err: 0,
    motor_status_0: 1,
    motor_status_1: 1,
    general_status: 1,

    slot_start: get15MinSlotStart(now),
    timestamp: now,
  };
}

const COLUMNS = [
  "device_id", "city", "device_state", "fw_version", "temperature", "humidity",
  "voltage_battery", "voltage_solar_panel", "running_current", "ac_power_kw",
  "avg_current", "motor_speed", "panel_location", "battery_percentage",
  "connectivity_status", "error_code", "total_runtime", "dbg_accel", "dbg_gyro",
  "dbg_rain", "dbg_wind", "dbg_last_err", "motor_status_0", "motor_status_1",
  "general_status", "slot_start", "timestamp",
];

const seed = async () => {
  try {
    console.log("🔌 Connected to MySQL for Multi-Farm Seeding");

    // Clear previous test data for these 5 farms
    await query("DELETE FROM scada_packets WHERE device_id IN (1, 2, 3, 4, 5)");
    console.log("🧹 Cleaned up old fleet records");

    const readings = [];
    FARMS.forEach(farm => {
      for (let i = 0; i < RECORDS_PER_FARM; i++) {
        readings.push(generateReading(i, farm));
      }
    });

    // Bulk insert. `timestamp` is quoted because it is a MySQL keyword.
    const colSql = COLUMNS.map((c) => (c === "timestamp" ? "`timestamp`" : c)).join(", ");
    const placeholders = "(" + COLUMNS.map(() => "?").join(", ") + ")";
    const values = readings.map((r) => COLUMNS.map((c) => r[c]));

    const sql = `INSERT INTO scada_packets (${colSql}) VALUES ${readings.map(() => placeholders).join(", ")}`;
    await pool.query(sql, values.flat());

    console.log(`✅ Success: Inserted 300 records across 5 farms (Delhi, Mumbai, Bangalore, Chennai, Hyderabad)`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err.message);
    process.exit(1);
  }
};

seed();
