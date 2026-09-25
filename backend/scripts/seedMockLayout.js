// scripts/seedMockLayout.js
// TEMPORARY mock data for the Explorer analytics screens (Row Grid, Compare,
// Maintenance Queue, Day Replay, Panel Detail). Generates a 12x20 row/panel
// hierarchy + fault alerts + one recent telemetry packet for EVERY farm that
// is currently registered in the DB (your real "places").
//
//   Run:    node scripts/seedMockLayout.js
//   Undo:   node scripts/clearMockLayout.js
import { pool, query } from "../db.js";
import dotenv from "dotenv";
import { rowIdFor, panelIdFor } from "../controllers/layoutController.js";

dotenv.config();

const ROWS_PER_FARM = 12;
const PANELS_PER_ROW = 20;
const DAY = 86400000;

const FAULT_LIBRARY = [
  { code: "F1", name: "Over-Temperature", severity: "HIGH" },
  { code: "F5", name: "Over-Current (Running)", severity: "HIGH" },
  { code: "F8", name: "Battery Voltage Out of Range", severity: "CRITICAL" },
  { code: "F12", name: "RPM Control Fault", severity: "HIGH" },
];

function panelStatus(rowNo, panelNo) {
  const roll = (rowNo * 31 + panelNo * 17) % 100;
  if (roll < 4) return "FAULT";
  if (roll < 7) return "MAINTENANCE";
  if (roll < 14) return "DEGRADED";
  return "OK";
}

const seed = async () => {
  try {
    const farms = await query("SELECT farm_id, name, city, capacity FROM farms");
    if (farms.length === 0) {
      console.log("⚠️ No farms registered yet. Add a farm in Manage Farms first, then re-run.");
      process.exit(0);
    }
    console.log(`🔌 Generating mock layout for ${farms.length} registered farm(s)...`);

    for (const farm of farms) {
      // Wipe any prior mock layout for this farm.
      await query("DELETE FROM panel_rows WHERE farm_id = ?", [farm.farm_id]);
      await query("DELETE FROM panels WHERE farm_id = ?", [farm.farm_id]);
      await query("DELETE FROM scada_packets WHERE farm_id = ?", [farm.farm_id]);

      const rows = [];
      const panels = [];
      const alertPackets = [];

      for (let r = 1; r <= ROWS_PER_FARM; r++) {
        const row_id = rowIdFor(farm.farm_id, r);
        const rowPanels = [];
        for (let p = 1; p <= PANELS_PER_ROW; p++) {
          const status = panelStatus(r, p);
          const ageDays = 365 + ((r * 37 + p * 13) % 1100);
          panels.push([
            panelIdFor(farm.farm_id, r, p), farm.farm_id, row_id, r, p,
            `Panel ${String(p).padStart(2, "0")}`,
            `${farm.farm_id.toUpperCase()}-R${r}-P${p}`,
            550, 25, 180, status,
            new Date(Date.now() - ((r + p) % 9) * DAY),
            new Date(Date.now() - ageDays * DAY),
          ]);
          rowPanels.push(status);

          if (status === "FAULT" || status === "MAINTENANCE") {
            const fault = FAULT_LIBRARY[(r + p) % FAULT_LIBRARY.length];
            // Spread onset across the last 24h so Day Replay animates nicely.
            const onset = new Date(Date.now() - Math.random() * DAY);
            alertPackets.push({
              farm_id: farm.farm_id, row_id, panel_id: panelIdFor(farm.farm_id, r, p),
              row_no: r, panel_no: p, city: farm.city, error_code: parseInt(fault.code.replace(/\D/g, ""), 10),
              timestamp: onset, fault,
            });
          }
        }
        const faultCount = rowPanels.filter((s) => s === "FAULT" || s === "MAINTENANCE").length;
        rows.push([
          row_id, farm.farm_id, r, `Row ${String(r).padStart(2, "0")}`, PANELS_PER_ROW,
          r % 2 === 0 ? "E-W" : "N-S", 25, faultCount > 0 ? "FAULT" : "NORMAL",
        ]);
      }

      await pool.query(
        `INSERT INTO panel_rows (row_id, farm_id, row_no, label, panel_count, orientation, tilt_deg, status) VALUES ?`,
        [rows]
      );
      await pool.query(
        `INSERT INTO panels (panel_id, farm_id, row_id, row_no, panel_no, label, serial, wattage, tilt_deg, azimuth_deg, status, last_clean_at, installed_at) VALUES ?`,
        [panels]
      );

      // Alert packets + faults for the flagged panels.
      for (const a of alertPackets) {
        const result = await query(
          `INSERT INTO scada_packets (farm_id, row_id, panel_id, row_no, panel_no, city, device_state, error_code, status, \`timestamp\`)
           VALUES (?, ?, ?, ?, ?, ?, 2, ?, 'FAULT', ?)`,
          [a.farm_id, a.row_id, a.panel_id, a.row_no, a.panel_no, a.city, a.error_code, a.timestamp]
        );
        await query(
          `INSERT INTO packet_faults (packet_ref, farm_id, code, name, severity, triggered_by, row_id, panel_id, \`timestamp\`)
           VALUES (?, ?, ?, ?, ?, 'MOCK', ?, ?, ?)`,
          [result.insertId, a.farm_id, a.fault.code, a.fault.name, a.fault.severity, a.row_id, a.panel_id, a.timestamp]
        );
      }

      // One recent "live" farm packet — inserted LAST so it's the newest row
      // (latestFarmPacket picks by id), giving Row Grid / Compare real power.
      const power = Number(((farm.capacity || 100) * 0.62).toFixed(1));
      await query(
        `INSERT INTO scada_packets
          (farm_id, city, ac_power_kw, dc_voltage_v, voltage_solar_panel, dc_current_a, running_current,
           temperature, panel_temp_c, battery_percentage, status, \`timestamp\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', ?)`,
        [farm.farm_id, farm.city, power, 820, 820, 12.5, 12.5, 41, 41, 88, new Date()]
      );

      console.log(`  ✅ ${farm.name}: ${rows.length} rows / ${panels.length} panels / ${alertPackets.length} alerts`);
    }

    console.log("🎉 Mock layout ready — open Fleet Explorer to verify.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Mock layout failed:", err.message);
    process.exit(1);
  }
};

seed();
