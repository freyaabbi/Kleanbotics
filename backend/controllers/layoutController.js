import { query, queryOne } from "../db.js";

// --- ID helpers (keep the format identical everywhere) ---
export const rowIdFor = (farmId, rowNo) =>
  `${farmId}_r${String(rowNo).padStart(2, "0")}`;
export const panelIdFor = (farmId, rowNo, panelNo) =>
  `${farmId}_r${String(rowNo).padStart(2, "0")}_p${String(panelNo).padStart(2, "0")}`;

// Deterministic pseudo-variance so synthesized per-panel telemetry looks
// alive & stable across polls (no DB write needed for every panel).
const jitter = (seed, spread) => {
  const x = Math.sin(seed * 999.13) * 10000;
  return (x - Math.floor(x)) * spread - spread / 2;
};

// Fetch the most recent telemetry packet for a farm (used to drive rollups).
async function latestFarmPacket(farmId) {
  return queryOne(
    "SELECT * FROM scada_packets WHERE farm_id = ? ORDER BY id DESC LIMIT 1",
    [farmId]
  );
}

function rankStatus(s) {
  // Higher = worse, for rolling child statuses up to the parent.
  return { OFFLINE: 3, FAULT: 2, MAINTENANCE: 2, DEGRADED: 1, NORMAL: 0, OK: 0 }[s] ?? 0;
}
function worstStatus(list) {
  return list.reduce((worst, s) => (rankStatus(s) > rankStatus(worst) ? s : worst), "NORMAL");
}

// Flat-column accessors for the farm's live packet (post SQL migration).
const packetPower = (pkt) => pkt?.ac_power_kw ?? 0;
const packetVolt = (pkt) => pkt?.dc_voltage_v ?? pkt?.voltage_solar_panel ?? 0;
const packetCurr = (pkt) => pkt?.dc_current_a ?? pkt?.running_current ?? 0;
const packetTemp = (pkt) => pkt?.panel_temp_c ?? pkt?.temperature ?? 30;

/**
 * GET /api/farms/:id/rows
 * Row grid for a farm: every row + a rollup of its panels' health + power.
 */
export const getRows = async (req, res) => {
  try {
    const { id: farmId } = req.params;

    const farm = await queryOne("SELECT * FROM farms WHERE farm_id = ?", [farmId]);
    const rows = await query(
      "SELECT * FROM panel_rows WHERE farm_id = ? ORDER BY row_no ASC",
      [farmId]
    );
    const panels = await query("SELECT * FROM panels WHERE farm_id = ?", [farmId]);
    const packet = await latestFarmPacket(farmId);

    // Split the farm's live AC power evenly across panels so each row shows a share.
    const farmPower = packetPower(packet);
    const perPanelPower = panels.length ? farmPower / panels.length : 0;

    const byRow = {};
    panels.forEach((p) => {
      (byRow[p.row_no] = byRow[p.row_no] || []).push(p);
    });

    const enriched = rows.map((row) => {
      const rowPanels = byRow[row.row_no] || [];
      const faults = rowPanels.filter((p) => rankStatus(p.status) >= 2).length;
      const degraded = rowPanels.filter((p) => p.status === "DEGRADED").length;
      // Real even share of the farm's live output; downed panels contribute 0.
      const rowPower = rowPanels.reduce(
        (sum, p) => sum + (rankStatus(p.status) >= 2 ? 0 : perPanelPower),
        0
      );
      return {
        ...row,
        panel_count: rowPanels.length,
        fault_count: faults,
        degraded_count: degraded,
        active_power_kw: Number(Math.max(0, rowPower).toFixed(2)),
        status: worstStatus(rowPanels.map((p) => p.status)),
      };
    });

    res.json({
      farm: farm || { farm_id: farmId, name: farmId },
      rows: enriched,
      totals: {
        rows: rows.length,
        panels: panels.length,
        active_power_kw: Number(farmPower.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("❌ Failed to get rows:", error.message);
    res.status(500).json({ error: "Failed to get rows" });
  }
};

/**
 * GET /api/farms/:id/rows/:rowNo/panels
 * Panel strip for a single row.
 */
export const getRowPanels = async (req, res) => {
  try {
    const { id: farmId, rowNo } = req.params;

    const row = await queryOne(
      "SELECT * FROM panel_rows WHERE farm_id = ? AND row_no = ?",
      [farmId, Number(rowNo)]
    );
    const farm = await queryOne("SELECT * FROM farms WHERE farm_id = ?", [farmId]);
    const panels = await query(
      "SELECT * FROM panels WHERE farm_id = ? AND row_no = ? ORDER BY panel_no ASC",
      [farmId, Number(rowNo)]
    );
    const packet = await latestFarmPacket(farmId);

    const farmPower = packetPower(packet);
    const countRow = await queryOne(
      "SELECT COUNT(*) AS c FROM panels WHERE farm_id = ?",
      [farmId]
    );
    const allPanels = countRow ? Number(countRow.c) : 0;
    const perPanelPower = allPanels ? farmPower / allPanels : 0;

    const enriched = panels.map((p) => ({
      ...p,
      active_power_kw:
        rankStatus(p.status) >= 2
          ? 0
          : Number(Math.max(0, perPanelPower + jitter(p.panel_no, 0.4)).toFixed(3)),
    }));

    res.json({
      farm: farm || { farm_id: farmId, name: farmId },
      row: row || { farm_id: farmId, row_no: Number(rowNo), label: `Row ${rowNo}` },
      panels: enriched,
    });
  } catch (error) {
    console.error("❌ Failed to get row panels:", error.message);
    res.status(500).json({ error: "Failed to get row panels" });
  }
};

/**
 * GET /api/panels/:id
 * Single panel detail: metadata + synthesized live telemetry + its alerts.
 */
export const getPanel = async (req, res) => {
  try {
    const { id: panelId } = req.params;

    const panel = await queryOne("SELECT * FROM panels WHERE panel_id = ?", [panelId]);
    if (!panel) return res.status(404).json({ error: "Panel not found" });

    const farm = await queryOne("SELECT * FROM farms WHERE farm_id = ?", [panel.farm_id]);
    const row = await queryOne("SELECT * FROM panel_rows WHERE row_id = ?", [panel.row_id]);
    const packet = await latestFarmPacket(panel.farm_id);

    const isFault = rankStatus(panel.status) >= 2;
    const seed = panel.panel_no + panel.row_no * 20;

    // Derive this panel's telemetry from the farm packet + deterministic jitter.
    const farmVolt = packetVolt(packet);
    const farmCurr = packetCurr(packet);
    const farmTemp = packetTemp(packet);
    const countRow = await queryOne(
      "SELECT COUNT(*) AS c FROM panels WHERE farm_id = ?",
      [panel.farm_id]
    );
    const allPanels = countRow ? Number(countRow.c) : 0;
    const farmPower = packetPower(packet);
    const perPanelPower = allPanels ? farmPower / allPanels : 0;

    const telemetry = {
      voltage_v: isFault ? 0 : Number((farmVolt / 20 + jitter(seed, 2)).toFixed(1)),
      current_a: isFault ? 0 : Number(Math.max(0, farmCurr / 20 + jitter(seed, 0.3)).toFixed(2)),
      power_kw: isFault ? 0 : Number(Math.max(0, perPanelPower + jitter(seed, 0.4)).toFixed(3)),
      temperature_c: Number((farmTemp + jitter(seed, 4)).toFixed(1)),
      last_clean_at: panel.last_clean_at,
    };

    // Panel-scoped alerts: fault rows carrying this panel_id (newest first).
    const alertRows = await query(
      `SELECT code, name, severity, row_id, panel_id, \`timestamp\`
         FROM packet_faults
        WHERE panel_id = ?
        ORDER BY \`timestamp\` DESC
        LIMIT 20`,
      [panelId]
    );

    const alerts = alertRows.map((f) => ({
      code: f.code,
      name: f.name,
      severity: f.severity || "MEDIUM",
      row_id: f.row_id,
      panel_id: f.panel_id,
      timestamp: f.timestamp,
    }));

    res.json({
      panel,
      farm: farm || { farm_id: panel.farm_id, name: panel.farm_id },
      row: row || { row_no: panel.row_no, label: `Row ${panel.row_no}` },
      telemetry,
      alerts,
    });
  } catch (error) {
    console.error("❌ Failed to get panel:", error.message);
    res.status(500).json({ error: "Failed to get panel" });
  }
};
