import { queryOne } from "../db.js";

// ---------------------------------------------------------------------
// Blynk WRITE/CONTROL proxy. Tokens live in the DB and never reach the
// browser. Use blr1.blynk.cloud from India (bare blynk.cloud returns
// "Invalid token" on a GeoDNS mismatch).
//
//   V0 mode | V1 motor % | V2 start cycle | V3 dock | V4 reset
//   V5 fault code | V6 power on/off | V7 direction (0 fwd/1 rev) | V8 buzzer | V10–V15 readback
//
// Charts do NOT use Blynk history (capped at 10 calls/device/day) — that
// comes from ThingSpeak. Blynk is control + live connection state only.
// ---------------------------------------------------------------------
const BLYNK_BASE = process.env.BLYNK_BASE || "https://blr1.blynk.cloud";

export const PINS = { MODE: "V0", MOTOR: "V1", START: "V2", DOCK: "V3", RESET: "V4", FAULT: "V5", POWER: "V6", DIR: "V7", BUZZER: "V8" };

// A power on/off value can arrive as "ON"/"OFF", true/false, or 1/0.
function isPowerOn(value) {
  return value === "ON" || value === "on" || value === 1 || value === "1" || value === true;
}

// Map an app command onto Blynk virtual-pin writes.
export function commandToPins(command, value) {
  switch (command) {
    case "SET_MODE":
      return { V0: value === "MANUAL" ? 1 : 0 };
    case "SET_RPM":
      return { V1: Number(value) || 0 };
    case "CMD_START_CYCLE":
      return { V2: 1 };
    case "CMD_DOCK":
      return { V3: 1 };
    case "RESET":
    case "CMD_RESET":
      return { V4: 1 };
    case "POWER":
      return { V6: isPowerOn(value) ? 1 : 0 };
    case "BUZZER":
      // Sound (1) or silence (0) the robot's alarm buzzer.
      return { V8: isPowerOn(value) ? 1 : 0 };
    case "SET_DIR":
      // V7: 0 = forward, 1 = reverse
      return { V7: value === "REVERSE" || value === 1 || value === "1" ? 1 : 0 };
    default:
      return null;
  }
}

// One call, aligned timestamps: /external/api/batch/update for multi-pin writes.
export async function blynkBatchUpdate(token, pins) {
  const qs = Object.entries(pins)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${BLYNK_BASE}/external/api/batch/update?token=${encodeURIComponent(token)}&${qs}`;
  const t0 = Date.now();
  const r = await fetch(url);
  const latency = Date.now() - t0;
  const text = await r.text().catch(() => "");
  return { ok: r.ok, status: r.status, latency, text };
}

const connCache = new Map(); // token -> { t, data }
const CONN_TTL = 15000;

// GET /api/control/:farmId/connection  → drives the LIVE "sites online" badge.
export const isConnected = async (req, res) => {
  try {
    const { farmId } = req.params;
    const farm = await queryOne("SELECT blynk_token FROM farms WHERE farm_id = ?", [farmId]);
    // Simulated farms are always "online".
    if (!farm?.blynk_token) return res.json({ connected: true, source: "SIM" });

    const cached = connCache.get(farm.blynk_token);
    if (cached && Date.now() - cached.t < CONN_TTL) return res.json(cached.data);

    const url = `${BLYNK_BASE}/external/api/isHardwareConnected?token=${encodeURIComponent(farm.blynk_token)}`;
    const r = await fetch(url);
    const txt = (await r.text()).trim();
    const data = { connected: txt === "true", source: "LIVE" };
    connCache.set(farm.blynk_token, { t: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error("❌ Blynk connection check failed:", err.message);
    res.status(500).json({ error: "Connection check failed", connected: false });
  }
};

// GET /api/control/:farmId/readback  → V10–V15 device state.
export const readback = async (req, res) => {
  try {
    const { farmId } = req.params;
    const farm = await queryOne("SELECT blynk_token FROM farms WHERE farm_id = ?", [farmId]);
    if (!farm?.blynk_token) return res.status(404).json({ error: "No Blynk device for this farm" });

    const pins = ["V10", "V11", "V12", "V13", "V14", "V15"];
    const url = `${BLYNK_BASE}/external/api/get?token=${encodeURIComponent(farm.blynk_token)}&${pins.join("&")}`;
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    res.json(data);
  } catch (err) {
    console.error("❌ Blynk readback failed:", err.message);
    res.status(500).json({ error: "Readback failed" });
  }
};

// POST /api/control/:farmId/log-event  { code, description }
// Fires a free Blynk mobile push on critical faults.
export const logEvent = async (req, res) => {
  try {
    const { farmId } = req.params;
    const { code, description } = req.body || {};
    const farm = await queryOne("SELECT blynk_token FROM farms WHERE farm_id = ?", [farmId]);
    if (!farm?.blynk_token) return res.status(404).json({ error: "No Blynk device for this farm" });

    const desc = description || `Critical fault ${code || ""}`.trim();
    const url = `${BLYNK_BASE}/external/api/logEvent?token=${encodeURIComponent(
      farm.blynk_token
    )}&event=fault&description=${encodeURIComponent(desc)}`;
    const r = await fetch(url);
    res.json({ ok: r.ok, pushed: r.ok });
  } catch (err) {
    console.error("❌ Blynk logEvent failed:", err.message);
    res.status(500).json({ error: "logEvent failed" });
  }
};
