// lib/robotTelemetry.js
// Shared robot-telemetry normalisation + persistence, used by BOTH the HTTP
// ingest endpoint (ingestController) and the MQTT subscriber (mqttClient), so a
// packet is stored identically no matter how it arrived.
import { query, queryOne } from "../db.js";

// --- coercion helpers (hardware sends strings / varied types) ---------------
export const num = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
export const int = (v) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};
// Accept 1/0, true/false, "on"/"off", "1"/"0" -> 1 | 0 | null
export const bit = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (v === true || v === 1 || v === "1" || v === "true" || v === "on") return 1;
  if (v === false || v === 0 || v === "0" || v === "false" || v === "off") return 0;
  return num(v) ? 1 : 0;
};
export const str = (v, max) => (v === undefined || v === null ? null : String(v).slice(0, max));
export const clampPwm = (v) => {
  const n = int(v);
  return n === null ? null : Math.max(0, Math.min(255, n));
};

const VALID_DIR = new Set(["FORWARD", "REVERSE", "STOP"]);
const VALID_MOTOR = new Set(["RUNNING", "IDLE", "FAULT"]);

/** Look up a registered farm (the packet's "home"). Returns row or null. */
export function findFarm(farmId) {
  return queryOne("SELECT farm_id, name, city FROM farms WHERE farm_id = ?", [farmId]);
}

/** Map an arbitrary robot payload + its farm onto flat scada_packets columns. */
export function buildPacketRow(body, farm) {
  const dir = str(body.motor_direction, 8);
  const motorStatus = str(body.motor_status, 12);
  const motor_direction = dir && VALID_DIR.has(dir.toUpperCase()) ? dir.toUpperCase() : null;
  const motor_status = motorStatus && VALID_MOTOR.has(motorStatus.toUpperCase()) ? motorStatus.toUpperCase() : null;

  const error_code = int(body.error_code) ?? 0;
  const faulted = error_code !== 0 || motor_status === "FAULT";
  const status = faulted ? "FAULT" : "NORMAL";

  return {
    packet_id: `HW${Date.now()}`,
    farm_id: farm.farm_id,
    farm_name: farm.name || null,
    city: farm.city || null,
    device_id: int(body.device_id),
    timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),

    // core telemetry (all optional)
    motor_speed: num(body.motor_speed),
    battery_percentage: int(body.battery_percentage),
    battery_v: num(body.battery_v),
    temperature: num(body.temperature),
    humidity: num(body.humidity),
    voltage_solar_panel: num(body.voltage_solar_panel),
    running_current: num(body.running_current),
    ac_power_kw: num(body.ac_power_kw),

    // robot live-tracking signals
    motor_direction,
    motor_pwm: clampPwm(body.motor_pwm),
    power_state: bit(body.power_state),
    rain_status: bit(body.rain_status),
    motor_status,
    obstacle_detected: bit(body.obstacle_detected),
    alarm_active: bit(body.alarm_active),

    device_state: faulted ? 2 : 1,
    error_code,
    status,
  };
}

/** Insert one prepared row into scada_packets. Returns { insertId }. */
export async function insertPacketRow(row) {
  const cols = Object.keys(row);
  const colSql = cols.map((c) => (c === "timestamp" ? "`timestamp`" : c)).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((c) => row[c]);
  const result = await query(
    `INSERT INTO scada_packets (${colSql}) VALUES (${placeholders})`,
    values
  );
  return { insertId: result.insertId };
}
