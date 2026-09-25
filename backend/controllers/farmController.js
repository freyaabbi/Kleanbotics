import { query } from "../db.js";

// GET /api/farms - Get list of all farms
// NOTE: secrets (ts_read_key, blynk_token) are never returned to the client —
// only the non-sensitive channel id + booleans indicating what's configured.
export const getFarms = async (req, res) => {
  try {
    const farmsList = await query(
      `SELECT farm_id, name, city, capacity, lat, lng, ts_channel_id, data_source,
              (blynk_token IS NOT NULL) AS has_blynk,
              (ts_read_key IS NOT NULL) AS has_ts_key
         FROM farms`
    );
    res.json(farmsList);
  } catch (error) {
    console.error("❌ Failed to get farms:", error.message);
    res.status(500).json({ error: "Failed to get farms" });
  }
};

// POST /api/farms - Add a new farm
export const addFarm = async (req, res) => {
  try {
    const { farm_id, name, city, capacity, lat, lng } = req.body;

    if (!farm_id || !name || !city || !capacity || !lat || !lng) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Optional external-integration fields. Empty strings become NULL.
    const nn = (v) => (v === undefined || v === null || v === "" ? null : v);
    const ts_channel_id = nn(req.body.ts_channel_id);
    const ts_read_key = nn(req.body.ts_read_key);
    const blynk_token = nn(req.body.blynk_token);
    const data_source = ts_channel_id || blynk_token ? "LIVE" : "SIM";

    const farmDoc = {
      farm_id,
      name,
      city,
      capacity: Number(capacity),
      lat: Number(lat),
      lng: Number(lng),
    };

    // 1. Save or update in MySQL (upsert on farm_id primary key)
    await query(
      `INSERT INTO farms (farm_id, name, city, capacity, lat, lng, ts_channel_id, ts_read_key, blynk_token, data_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         city = VALUES(city),
         capacity = VALUES(capacity),
         lat = VALUES(lat),
         lng = VALUES(lng),
         ts_channel_id = VALUES(ts_channel_id),
         ts_read_key = VALUES(ts_read_key),
         blynk_token = VALUES(blynk_token),
         data_source = VALUES(data_source)`,
      [farmDoc.farm_id, farmDoc.name, farmDoc.city, farmDoc.capacity, farmDoc.lat, farmDoc.lng,
       ts_channel_id, ts_read_key, blynk_token, data_source]
    );

    // 2. Notify Python simulator if running
    try {
      const pythonResponse = await fetch("http://127.0.0.1:8085/add-farm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(farmDoc),
      });
      if (!pythonResponse.ok) {
        console.warn("⚠️ Python simulator returned error status:", pythonResponse.status);
      }
    } catch (simError) {
      console.warn("⚠️ Failed to reach Python simulator to register farm:", simError.message);
    }

    res.json({ success: true, farm: farmDoc });
  } catch (error) {
    console.error("❌ Failed to add farm:", error.message);
    res.status(500).json({ error: "Failed to add farm" });
  }
};

// DELETE /api/farms/:id - Delete a farm by farm_id
export const deleteFarm = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Farm ID is required" });
    }

    // 1. Delete from farms table
    await query("DELETE FROM farms WHERE farm_id = ?", [id]);

    // 2. Clean up telemetry packets for this farm (string farm_id OR numeric device_id)
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
      await query("DELETE FROM scada_packets WHERE farm_id = ? OR device_id = ?", [id, numericId]);
    } else {
      await query("DELETE FROM scada_packets WHERE farm_id = ?", [id]);
    }

    // 3. Notify Python simulator
    try {
      const pythonResponse = await fetch("http://127.0.0.1:8085/delete-farm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: id }),
      });
      if (!pythonResponse.ok) {
        console.warn("⚠️ Python simulator returned error status during deletion:", pythonResponse.status);
      }
    } catch (simError) {
      console.warn("⚠️ Failed to reach Python simulator during farm deletion:", simError.message);
    }

    res.json({ success: true, deleted_id: id });
  } catch (error) {
    console.error("❌ Failed to delete farm:", error.message);
    res.status(500).json({ error: "Failed to delete farm" });
  }
};
