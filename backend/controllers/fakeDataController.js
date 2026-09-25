import { query } from "../db.js";
import { readLast } from "./thingspeakController.js";

export const triggerFault = async (req, res) => {
  try {
    const { farm_id, faultCode } = req.body;
    
    const pythonResponse = await fetch('http://127.0.0.1:8085/trigger-fault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farm_id, faultCode }) 
    });

    const data = await pythonResponse.json();
    res.status(pythonResponse.status).json(data);
  } catch (error) {
    console.error("Relay Error:", error.message);
    res.status(500).json({ error: "Failed to reach Python Simulator" });
  }
};

// GET /api/fakedataRoutes/robot-history/:farmId
// Time-ordered robot signal series for the Robot Monitor charts.
export const getRobotHistory = async (req, res) => {
  try {
    const { farmId } = req.params;
    // Inlined LIMIT (MySQL won't bind it); capped so the query stays cheap.
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 5), 200);

    const rows = await query(
      `SELECT \`timestamp\`, motor_pwm, motor_speed, motor_status,
              rain_status, obstacle_detected, alarm_active
         FROM scada_packets
        WHERE farm_id = ?
        ORDER BY id DESC LIMIT ${limit}`,
      [farmId]
    );

    // Reverse to chronological order for left-to-right charts.
    const series = rows.reverse().map((r) => ({
      t: r.timestamp
        ? new Date(r.timestamp).toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          })
        : "",
      pwm: Number(r.motor_pwm ?? 0),
      rpm: Number(r.motor_speed ?? 0),
      obstacle: r.obstacle_detected ? 1 : 0,
      rain: r.rain_status ? 1 : 0,
      alarm: r.alarm_active ? 1 : 0,
    }));

    res.json(series);
  } catch (err) {
    console.error("Robot history failed:", err.message);
    res.status(500).json({ error: "Robot history failed" });
  }
};

export const getDashboardData = async (req, res) => {
  try {
    // The FARMS table is the source of truth for "places". Every registered
    // farm shows up on the dashboard/map — even before any telemetry arrives.
    const farms = await query(
      "SELECT farm_id, name, city, capacity, lat, lng, ts_channel_id, ts_read_key, data_source FROM farms"
    );

    // Latest SIM packet per farm (for farms still driven by the simulator).
    const latest = await query(
      `SELECT p.*
         FROM scada_packets p
         INNER JOIN (
           SELECT COALESCE(farm_id, CAST(device_id AS CHAR)) AS grp, MAX(id) AS max_id
             FROM scada_packets GROUP BY grp
         ) l ON p.id = l.max_id`
    );
    const packetByFarm = {};
    latest.forEach((p) => {
      const g = p.farm_id || (p.device_id != null ? String(p.device_id) : null);
      if (g) packetByFarm[g] = p;
    });

    const dashboardData = {};

    for (const f of farms) {
      // Prefer REAL ThingSpeak values for LIVE farms; fall back to a SIM packet.
      let live = null;
      if (f.ts_channel_id) {
        try {
          live = await readLast(f.ts_channel_id, f.ts_read_key);
        } catch (e) {
          live = null; // channel unreachable / not yet publishing
        }
      }
      const pkt = packetByFarm[f.farm_id];

      const acPower = live?.power_kw ?? pkt?.ac_power_kw ?? 0;
      const voltage = live?.voltage_v ?? pkt?.voltage_solar_panel ?? 0;
      const current = live?.current_a ?? pkt?.running_current ?? 0;
      const temp = live?.temperature_c ?? pkt?.temperature ?? 0;
      const battery = live?.soc ?? pkt?.battery_percentage ?? 0;
      const errorCode = pkt?.error_code || 0;
      const tsTime = live?.created_at || pkt?.timestamp || null;

      const hasData = !!(live || pkt);
      const stale = tsTime ? Date.now() - new Date(tsTime).getTime() > 120000 : true;
      const status = !hasData || stale ? "OFFLINE" : errorCode !== 0 ? "FAULT" : "NORMAL";

      dashboardData[f.farm_id] = {
        device_id: f.farm_id,
        farm_id: f.farm_id,
        farm_name: f.name,
        city: f.city || "Unknown",
        lat: f.lat,
        lng: f.lng,
        capacity: f.capacity || 0,
        data_source: f.data_source || "SIM",
        source_kind: live ? "THINGSPEAK" : pkt ? "SIM" : "NONE",

        temperature: temp,
        humidity: pkt?.humidity || 0,
        running_current: current,
        voltage_solar_panel: voltage,
        ac_power_kw: acPower,
        battery_percentage: battery,
        panel_location: pkt?.panel_location || 0,
        error_code: errorCode,

        electrical: { dc_voltage_v: voltage, dc_current_a: current, ac_power_kw: acPower },
        environmental: { temperature_c: temp, humidity: pkt?.humidity || 0 },
        status,

        // Robot live-tracking signals (simulator/hardware, not on ThingSpeak).
        motor_speed: pkt?.motor_speed ?? 0,
        robot: {
          motor_direction: pkt?.motor_direction ?? "STOP",
          motor_pwm: pkt?.motor_pwm ?? 0,
          power_state: pkt?.power_state ?? 0,
          rain_status: pkt?.rain_status ?? 0,
          motor_status: pkt?.motor_status ?? "IDLE",
          obstacle_detected: pkt?.obstacle_detected ?? 0,
          alarm_active: pkt?.alarm_active ?? 0,
        },
      };
    }

    res.json(dashboardData);
  } catch (err) {
    console.error("Dashboard sync failed:", err);
    res.status(500).json({ error: "Dashboard sync failed" });
  }
};