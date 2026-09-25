// mqttClient.js — EMQX / MQTT bridge for real robots.
//
// STATUS (robot -> dashboard): robots publish JSON to
//     <MQTT_BASE_TOPIC>/<farm_id>/status        e.g. kleanobotics/robots/rooftop-a/status
//   We subscribe, normalise, and write each message into scada_packets — the
//   same table the Robot Monitor reads. So MQTT and HTTP ingest are equivalent.
//
// COMMANDS (dashboard -> robot): the control buttons publish JSON to
//     <MQTT_BASE_TOPIC>/<farm_id>/cmd           the robot subscribes to this.
//
// Enabled only when MQTT_URL is set in backend/.env; otherwise this is a no-op
// and the app runs exactly as before.
import mqtt from "mqtt";
import { findFarm, buildPacketRow, insertPacketRow } from "./lib/robotTelemetry.js";

const BASE = (process.env.MQTT_BASE_TOPIC || "kleanobotics/robots").replace(/\/+$/, "");
const STATUS_SUB = `${BASE}/+/status`;

let client = null;

export function isMqttEnabled() {
  return !!process.env.MQTT_URL;
}

export function isMqttReady() {
  return !!client && client.connected;
}

// farm_id is the topic segment right before "/status".
function farmIdFromTopic(topic) {
  const parts = topic.split("/");
  const i = parts.lastIndexOf("status");
  return i > 0 ? parts[i - 1] : null;
}

async function handleStatusMessage(topic, payloadBuf) {
  let body;
  try {
    body = JSON.parse(payloadBuf.toString());
  } catch {
    console.warn(`⚠️  MQTT: non-JSON payload on ${topic}, ignored`);
    return;
  }

  const farmId = farmIdFromTopic(topic) || (body.farm_id ? String(body.farm_id) : null);
  if (!farmId) {
    console.warn(`⚠️  MQTT: could not resolve farm_id from ${topic}`);
    return;
  }

  const farm = await findFarm(farmId);
  if (!farm) {
    console.warn(`⚠️  MQTT: unknown farm_id "${farmId}" (register it under Manage Farms). Dropped.`);
    return;
  }

  try {
    const row = buildPacketRow(body, farm);
    await insertPacketRow(row);
  } catch (err) {
    console.error(`❌ MQTT: failed to store status for ${farmId}:`, err.message);
  }
}

export function startMqtt() {
  if (!isMqttEnabled()) {
    console.log("ℹ️  MQTT disabled (set MQTT_URL in backend/.env to enable EMQX ingest).");
    return null;
  }

  const url = process.env.MQTT_URL; // e.g. mqtts://xxxx.emqxsl.com:8883  or  mqtt://localhost:1883
  const options = {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: `kleanobotics-backend-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000, // auto-reconnect every 3s
    connectTimeout: 10000,
  };

  console.log(`📡 MQTT: connecting to ${url} …`);
  client = mqtt.connect(url, options);

  client.on("connect", () => {
    console.log(`✅ MQTT: connected. Subscribing to ${STATUS_SUB}`);
    client.subscribe(STATUS_SUB, { qos: 1 }, (err) => {
      if (err) console.error("❌ MQTT: subscribe failed:", err.message);
    });
  });

  client.on("message", (topic, payload) => {
    if (topic.endsWith("/status")) handleStatusMessage(topic, payload);
  });

  client.on("reconnect", () => console.log("… MQTT: reconnecting"));
  client.on("error", (err) => console.error("❌ MQTT error:", err.message));
  client.on("close", () => console.log("… MQTT: connection closed"));

  return client;
}

/**
 * Publish a control command to a robot's cmd topic.
 * Returns true if handed to the broker, false if MQTT isn't connected.
 */
export function publishCommand(farmId, command, value) {
  if (!isMqttReady()) return false;
  const topic = `${BASE}/${farmId}/cmd`;
  const message = JSON.stringify({ command, value: value ?? null, ts: new Date().toISOString() });
  client.publish(topic, message, { qos: 1 });
  return true;
}
