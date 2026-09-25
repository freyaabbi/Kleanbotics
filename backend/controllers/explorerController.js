import { query, queryOne } from "../db.js";

// ---------------------------------------------------------------------
// Shared synthesis helpers. Rows/panels don't carry their own telemetry
// stream, so per-panel/row time series are DERIVED from the farm's capacity
// + a solar day-curve + deterministic jitter (same spirit as layoutController).
// ---------------------------------------------------------------------
const jitter = (seed, spread) => {
  const x = Math.sin(seed * 999.13) * 10000;
  return (x - Math.floor(x)) * spread - spread / 2;
};

const rankStatus = (s) =>
  ({ OFFLINE: 3, FAULT: 2, MAINTENANCE: 2, DEGRADED: 1, NORMAL: 0, OK: 0 }[s] ?? 0);

// Smooth solar bell: 0 before ~6am, peak ~1pm, 0 after ~7pm (local-ish).
function solarFactor(hourFloat) {
  const t = (hourFloat - 6) / 13; // 6:00 -> 0, 19:00 -> 1
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * t);
}

// Loss fraction of a panel's potential output for a given health state.
function lossFraction(status) {
  if (status === "FAULT" || status === "MAINTENANCE" || status === "OFFLINE") return 1.0;
  if (status === "DEGRADED") return 0.4;
  return 0;
}

async function farmPeakPerPanel(farmId) {
  const farm = await queryOne("SELECT * FROM farms WHERE farm_id = ?", [farmId]);
  const cnt = await queryOne("SELECT COUNT(*) AS c FROM panels WHERE farm_id = ?", [farmId]);
  const total = cnt ? Number(cnt.c) : 0;
  const capacity = farm?.capacity || 100;
  // 0.92 derate factor mirrors the simulator's AC power calc.
  const peak = total ? (capacity * 0.92) / total : 0;
  return { farm, total, peak };
}

// Build an array of `points` timestamps spanning the last `hours`.
function timeline(hours, points) {
  const end = Date.now();
  const step = (hours * 3600 * 1000) / (points - 1);
  return Array.from({ length: points }, (_, i) => new Date(end - (points - 1 - i) * step));
}

// ---------------------------------------------------------------------
// GET /api/panels/:id/history?hours=24&points=48
// 24h synthesized V / I / T / power sparkline for one panel.
// ---------------------------------------------------------------------
export const getPanelHistory = async (req, res) => {
  try {
    const { id: panelId } = req.params;
    const hours = Math.min(72, Math.max(1, Number(req.query.hours) || 24));
    const points = Math.min(200, Math.max(8, Number(req.query.points) || 48));

    const panel = await queryOne("SELECT * FROM panels WHERE panel_id = ?", [panelId]);
    if (!panel) return res.status(404).json({ error: "Panel not found" });

    const { peak } = await farmPeakPerPanel(panel.farm_id);
    const seed = panel.panel_no + panel.row_no * 20;
    const isFault = rankStatus(panel.status) >= 2;
    const degrade = panel.status === "DEGRADED" ? 0.6 : 1;

    const series = timeline(hours, points).map((ts, i) => {
      const hour = ts.getHours() + ts.getMinutes() / 60;
      const sf = solarFactor(hour);
      const noise = 1 + jitter(seed + i * 3.1, 0.12);
      const power = isFault ? 0 : Math.max(0, peak * sf * degrade * noise);
      const voltage = isFault ? 0 : sf > 0 ? 30 + 12 * sf + jitter(seed + i, 2) : 0;
      const current = isFault ? 0 : sf > 0 ? Math.max(0, (power * 1000) / (voltage || 1)) : 0;
      const temp = 18 + 22 * sf + jitter(seed + i * 2, 3);
      return {
        t: ts.toISOString(),
        time: ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
        power_kw: Number(power.toFixed(3)),
        voltage_v: Number(voltage.toFixed(1)),
        current_a: Number(current.toFixed(2)),
        temperature_c: Number(temp.toFixed(1)),
      };
    });

    res.json({ panel_id: panelId, hours, series });
  } catch (err) {
    console.error("❌ Panel history failed:", err.message);
    res.status(500).json({ error: "Failed to build panel history" });
  }
};

// ---------------------------------------------------------------------
// POST /api/panels/:id/action   body: { action: 'CLEAN' | 'REPLACE' }
// ---------------------------------------------------------------------
export const panelAction = async (req, res) => {
  try {
    const { id: panelId } = req.params;
    const action = String(req.body?.action || "").toUpperCase();

    const panel = await queryOne("SELECT * FROM panels WHERE panel_id = ?", [panelId]);
    if (!panel) return res.status(404).json({ error: "Panel not found" });

    const now = new Date();
    if (action === "CLEAN") {
      // Cleaning clears a DEGRADED (soiling) state but not a hardware FAULT.
      const newStatus = panel.status === "DEGRADED" ? "OK" : panel.status;
      await query("UPDATE panels SET last_clean_at = ?, status = ? WHERE panel_id = ?", [
        now,
        newStatus,
        panelId,
      ]);
    } else if (action === "REPLACE") {
      // Replacement resets the module: healthy, freshly installed & cleaned.
      await query(
        "UPDATE panels SET status = 'OK', installed_at = ?, last_clean_at = ? WHERE panel_id = ?",
        [now, now, panelId]
      );
      // Clear this panel's outstanding fault alerts.
      await query("DELETE FROM packet_faults WHERE panel_id = ?", [panelId]);
    } else {
      return res.status(400).json({ error: "action must be CLEAN or REPLACE" });
    }

    const updated = await queryOne("SELECT * FROM panels WHERE panel_id = ?", [panelId]);
    res.json({ success: true, action, panel: updated });
  } catch (err) {
    console.error("❌ Panel action failed:", err.message);
    res.status(500).json({ error: "Failed to apply panel action" });
  }
};

// ---------------------------------------------------------------------
// GET /api/farms/:id/rows/compare?rows=1,2,3&hours=24&points=48
// Overlay-ready per-row power series for 2–5 rows.
// ---------------------------------------------------------------------
export const getRowCompare = async (req, res) => {
  try {
    const { id: farmId } = req.params;
    const hours = Math.min(72, Math.max(1, Number(req.query.hours) || 24));
    const points = Math.min(200, Math.max(8, Number(req.query.points) || 48));
    const rowNos = String(req.query.rows || "")
      .split(",")
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n))
      .slice(0, 5);

    if (rowNos.length < 1) return res.status(400).json({ error: "provide ?rows=1,2,3" });

    const farm = await queryOne("SELECT * FROM farms WHERE farm_id = ?", [farmId]);

    // Active-panel share per requested row (downed panels generate nothing).
    const allPanels = await query(
      "SELECT status, row_no FROM panels WHERE farm_id = ?",
      [farmId]
    );
    const totalActive = allPanels.filter((p) => rankStatus(p.status) < 2).length || 1;
    const rowsMeta = rowNos.map((rowNo) => {
      const panels = allPanels.filter((p) => p.row_no === rowNo);
      const activeCount = panels.filter((p) => rankStatus(p.status) < 2).length;
      return { rowNo, count: panels.length, share: activeCount / totalActive };
    });

    // REAL telemetry: the farm's logged power packets over the window.
    const since = new Date(Date.now() - hours * 3600000);
    const packets = await query(
      `SELECT \`timestamp\`, ac_power_kw FROM scada_packets
        WHERE farm_id = ? AND \`timestamp\` >= ? AND ac_power_kw IS NOT NULL
        ORDER BY \`timestamp\` ASC`,
      [farmId, since]
    );

    // Downsample to at most `points` samples so the chart stays light.
    const stride = Math.max(1, Math.ceil(packets.length / points));
    const sampled = packets.filter((_, i) => i % stride === 0);

    // Each row's line = real farm power × that row's active-panel share.
    const series = sampled.map((pkt) => {
      const d = new Date(pkt.timestamp);
      const point = {
        t: d.toISOString(),
        time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
      };
      const farmPower = Number(pkt.ac_power_kw) || 0;
      rowsMeta.forEach((rm) => {
        point[`row${rm.rowNo}`] = Number((farmPower * rm.share).toFixed(2));
      });
      return point;
    });

    res.json({
      farm: farm || { farm_id: farmId, name: farmId },
      rows: rowsMeta.map((r) => ({ row_no: r.rowNo, key: `row${r.rowNo}`, panel_count: r.count })),
      hours,
      series,
    });
  } catch (err) {
    console.error("❌ Row compare failed:", err.message);
    res.status(500).json({ error: "Failed to build row comparison" });
  }
};

// ---------------------------------------------------------------------
// GET /api/farms/:id/maintenance
// Panels/rows needing attention, ranked by estimated lost kWh.
// ---------------------------------------------------------------------
export const getMaintenanceQueue = async (req, res) => {
  try {
    const { id: farmId } = req.params;
    const { peak, farm, total } = await farmPeakPerPanel(farmId);

    // Every panel that isn't fully healthy.
    const panels = await query(
      `SELECT panel_id, row_id, row_no, panel_no, status, serial, last_clean_at, installed_at
         FROM panels
        WHERE farm_id = ? AND status NOT IN ('OK','NORMAL')
        ORDER BY row_no, panel_no`,
      [farmId]
    );

    // Earliest fault timestamp per panel (when the loss started).
    const faultStarts = await query(
      `SELECT panel_id, MIN(\`timestamp\`) AS started
         FROM packet_faults
        WHERE farm_id = ?
        GROUP BY panel_id`,
      [farmId]
    );
    const startMap = {};
    faultStarts.forEach((f) => (startMap[f.panel_id] = f.started));

    const EFFECTIVE_SUN_HOURS = 5.5; // usable generation hours per day
    const dailyRate = peak * EFFECTIVE_SUN_HOURS; // kWh/day at full output

    const now = Date.now();
    const queue = panels.map((p) => {
      const started = startMap[p.panel_id] ? new Date(startMap[p.panel_id]).getTime() : null;
      const fallbackHrs = p.status === "DEGRADED" ? 72 : 24;
      const hoursDown = started ? (now - started) / 3600000 : fallbackHrs;
      const daysDown = Math.min(60, hoursDown / 24); // cap so numbers stay sane
      const lostKwh = dailyRate * daysDown * lossFraction(p.status);
      const action = p.status === "DEGRADED" ? "CLEAN" : "REPLACE";
      return {
        panel_id: p.panel_id,
        row_id: p.row_id,
        row_no: p.row_no,
        panel_no: p.panel_no,
        status: p.status,
        serial: p.serial,
        last_clean_at: p.last_clean_at,
        installed_at: p.installed_at,
        days_down: Number(daysDown.toFixed(1)),
        lost_kwh: Number(lostKwh.toFixed(1)),
        recommended_action: action,
        priority: rankStatus(p.status),
      };
    });

    queue.sort((a, b) => b.lost_kwh - a.lost_kwh);

    const summary = {
      panels_flagged: queue.length,
      total_panels: total,
      total_lost_kwh: Number(queue.reduce((s, q) => s + q.lost_kwh, 0).toFixed(1)),
      faults: queue.filter((q) => q.priority >= 2).length,
      degraded: queue.filter((q) => q.status === "DEGRADED").length,
    };

    res.json({ farm: farm || { farm_id: farmId, name: farmId }, summary, queue });
  } catch (err) {
    console.error("❌ Maintenance queue failed:", err.message);
    res.status(500).json({ error: "Failed to build maintenance queue" });
  }
};

// ---------------------------------------------------------------------
// GET /api/farms/:id/replay?hours=24
// Grid + per-panel fault "appearance" time for the day-replay scrubber.
// ---------------------------------------------------------------------
export const getReplay = async (req, res) => {
  try {
    const { id: farmId } = req.params;
    const hours = Math.min(72, Math.max(6, Number(req.query.hours) || 24));

    const farm = await queryOne("SELECT * FROM farms WHERE farm_id = ?", [farmId]);
    const panels = await query(
      "SELECT panel_id, row_no, panel_no, status FROM panels WHERE farm_id = ? ORDER BY row_no, panel_no",
      [farmId]
    );

    // Real fault onset times (if the simulator has logged any within window).
    const dayStart = Date.now() - hours * 3600000;
    const faultStarts = await query(
      `SELECT panel_id, MIN(\`timestamp\`) AS started
         FROM packet_faults WHERE farm_id = ? GROUP BY panel_id`,
      [farmId]
    );
    const startMap = {};
    faultStarts.forEach((f) => (startMap[f.panel_id] = new Date(f.started).getTime()));

    let rows = 0;
    let cols = 0;
    const out = panels.map((p) => {
      rows = Math.max(rows, p.row_no);
      cols = Math.max(cols, p.panel_no);
      const faulted = rankStatus(p.status) >= 2 || p.status === "DEGRADED";
      let appearAt = null;
      if (faulted) {
        // Real onset only — no synthesized cascade. If the fault started inside
        // the window use its real time; if it began earlier (or we have no
        // logged onset yet) it was already down, so show it from day start.
        const real = startMap[p.panel_id];
        appearAt = real && real >= dayStart ? real : dayStart;
      }
      return {
        panel_id: p.panel_id,
        row_no: p.row_no,
        panel_no: p.panel_no,
        status: p.status,
        appear_at: appearAt ? new Date(appearAt).toISOString() : null,
      };
    });

    res.json({
      farm: farm || { farm_id: farmId, name: farmId },
      day_start: new Date(dayStart).toISOString(),
      day_end: new Date().toISOString(),
      rows,
      cols,
      panels: out,
    });
  } catch (err) {
    console.error("❌ Replay build failed:", err.message);
    res.status(500).json({ error: "Failed to build replay" });
  }
};
