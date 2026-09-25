import { queryOne } from "../db.js";

// ---------------------------------------------------------------------
// ThingSpeak READ proxy. All requests go through the server so the read
// API key never reaches the browser. Responses are cached for 15s to
// respect the free tier and match the client's 15s refresh.
//
//   field1 V | field2 A | field3 °C | field4 rain | field5 tracker angle
//   field6 SoC | field7 kW | field8 panel index (multiplexed)
// ---------------------------------------------------------------------
const TS_BASE = process.env.THINGSPEAK_BASE || "https://api.thingspeak.com";
const TTL = 15000;
const cache = new Map(); // key -> { t, data }

const getCached = (k) => {
  const e = cache.get(k);
  return e && Date.now() - e.t < TTL ? e.data : null;
};
const setCached = (k, data) => cache.set(k, { t: Date.now(), data });

const FIELD_MAP = {
  field1: "voltage_v",
  field2: "current_a",
  field3: "temperature_c",
  field4: "rain",
  field5: "tracker_angle",
  field6: "soc",
  field7: "power_kw",
  field8: "panel_idx",
};

function mapFeed(f) {
  if (!f) return null;
  const o = { created_at: f.created_at, entry_id: f.entry_id };
  for (const k in FIELD_MAP) {
    const v = f[k];
    o[FIELD_MAP[k]] = v == null || v === "" ? null : Number(v);
  }
  return o;
}

async function farmChannel(farmId) {
  return queryOne("SELECT ts_channel_id, ts_read_key FROM farms WHERE farm_id = ?", [farmId]);
}

// Reusable: read + map the latest feed for a channel (cached 15s).
// Used by the route below AND the dashboard for LIVE farms.
export async function readLast(channelId, readKey) {
  if (!channelId) return null;
  const key = `last:${channelId}`;
  let data = getCached(key);
  if (!data) {
    let url = `${TS_BASE}/channels/${channelId}/feeds/last.json`;
    if (readKey) url += `?api_key=${encodeURIComponent(readKey)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`ThingSpeak responded ${r.status}`);
    data = mapFeed(await r.json());
    setCached(key, data);
  }
  return data;
}

// GET /api/telemetry/:farmId/last
export const getLast = async (req, res) => {
  try {
    const { farmId } = req.params;
    const farm = await farmChannel(farmId);
    if (!farm?.ts_channel_id) {
      return res.status(404).json({ error: "No ThingSpeak channel configured for this farm" });
    }
    const data = await readLast(farm.ts_channel_id, farm.ts_read_key);
    res.set("Cache-Control", "public, max-age=15"); // revalidate: 15
    res.json(data);
  } catch (err) {
    console.error("❌ ThingSpeak last failed:", err.message);
    res.status(502).json({ error: "Failed to fetch live telemetry" });
  }
};

// ThingSpeak only supports these averaging windows (minutes). Using an
// average keeps results under the 8000-row cap — never fetch raw for charts.
const ALLOWED_AVG = new Set([10, 15, 20, 30, 60, 240, 720, 1440]);

// GET /api/telemetry/:farmId/history?days=7&average=60
export const getHistory = async (req, res) => {
  try {
    const { farmId } = req.params;
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
    let average = Number(req.query.average) || 60;
    if (!ALLOWED_AVG.has(average)) average = 60; // enforce server-side averaging

    const farm = await farmChannel(farmId);
    if (!farm?.ts_channel_id) {
      return res.status(404).json({ error: "No ThingSpeak channel configured for this farm" });
    }

    const key = `hist:${farm.ts_channel_id}:${days}:${average}`;
    let data = getCached(key);
    if (!data) {
      let url = `${TS_BASE}/channels/${farm.ts_channel_id}/feeds.json?days=${days}&average=${average}`;
      if (farm.ts_read_key) url += `&api_key=${encodeURIComponent(farm.ts_read_key)}`;
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ error: `ThingSpeak responded ${r.status}` });
      const json = await r.json();
      data = {
        channel: json.channel?.name || farm.ts_channel_id,
        days,
        average,
        series: (json.feeds || []).map(mapFeed),
      };
      setCached(key, data);
    }
    res.set("Cache-Control", "public, max-age=15");
    res.json(data);
  } catch (err) {
    console.error("❌ ThingSpeak history failed:", err.message);
    res.status(500).json({ error: "Failed to fetch telemetry history" });
  }
};

// GET /api/telemetry/probe?channel=12397&days=1&average=60
// Console helper: read ANY public ThingSpeak channel (no key) so the
// Integrations page can show real data end-to-end through the proxy.
export const probe = async (req, res) => {
  try {
    const channel = String(req.query.channel || "").trim();
    if (!/^\d+$/.test(channel)) return res.status(400).json({ error: "numeric ?channel required" });
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 1));
    let average = Number(req.query.average) || 60;
    if (!ALLOWED_AVG.has(average)) average = 60;

    const key = `probe:${channel}:${days}:${average}`;
    let data = getCached(key);
    if (!data) {
      const url = `${TS_BASE}/channels/${channel}/feeds.json?days=${days}&average=${average}`;
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ error: `ThingSpeak responded ${r.status}` });
      const json = await r.json();
      const feeds = json.feeds || [];
      const ch = json.channel || {};
      const field_names = {};
      for (let i = 1; i <= 8; i++) if (ch[`field${i}`]) field_names[`field${i}`] = ch[`field${i}`];
      data = {
        channel: { id: ch.id, name: ch.name, field_names },
        last: mapFeed(feeds[feeds.length - 1]),
        series: feeds.map(mapFeed),
      };
      setCached(key, data);
    }
    res.set("Cache-Control", "public, max-age=15");
    res.json(data);
  } catch (err) {
    console.error("❌ ThingSpeak probe failed:", err.message);
    res.status(500).json({ error: "Probe failed" });
  }
};
