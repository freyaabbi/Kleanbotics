// controllers/ingestController.js
// HTTP ingest path for REAL robot hardware (WiFi robots, or a laptop bridge).
//
// A robot POSTs its current status as JSON to POST /api/telemetry/ingest every
// few seconds. We validate it, then write ONE row into scada_packets via the
// shared normaliser — the same columns the Robot Monitor reads.
//
// Auth: if INGEST_API_KEY is set in backend/.env, every request must send a
// matching `x-api-key` header. If unset, ingest is open (dev only, warned once).
import { findFarm, buildPacketRow, insertPacketRow } from "../lib/robotTelemetry.js";

let warnedNoKey = false;

// POST /api/telemetry/ingest
export const ingestRobotPacket = async (req, res) => {
  // 1) Auth
  const requiredKey = process.env.INGEST_API_KEY;
  if (requiredKey) {
    if (req.get("x-api-key") !== requiredKey) {
      return res.status(401).json({ success: false, message: "Invalid or missing x-api-key" });
    }
  } else if (!warnedNoKey) {
    warnedNoKey = true;
    console.warn("⚠️  INGEST_API_KEY not set — /api/telemetry/ingest is OPEN. Set it in backend/.env for production.");
  }

  // 2) Validate
  const body = req.body || {};
  const farmId = body.farm_id ? String(body.farm_id).slice(0, 64) : null;
  if (!farmId) {
    return res.status(400).json({ success: false, message: "farm_id is required" });
  }

  const farm = await findFarm(farmId);
  if (!farm) {
    return res.status(404).json({
      success: false,
      message: `Unknown farm_id "${farmId}". Register it first under Manage Farms, then point the robot at it.`,
    });
  }

  // 3) Normalise + insert
  try {
    const row = buildPacketRow(body, farm);
    const { insertId } = await insertPacketRow(row);
    return res.status(201).json({ success: true, id: insertId, farm_id: farmId, status: row.status, message: "Telemetry stored" });
  } catch (err) {
    console.error("❌ Ingest failed:", err.message);
    return res.status(500).json({ success: false, message: "Failed to store telemetry" });
  }
};
