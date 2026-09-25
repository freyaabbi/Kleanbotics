// scripts/seedLayout.js
// Seeds the fleet HIERARCHY: farms -> rows -> panels (12 rows x 20 panels),
// replacing the old notion of farms being flat leaf "hubs".
import { pool, query } from "../db.js";
import dotenv from "dotenv";
import { rowIdFor, panelIdFor } from "../controllers/layoutController.js";

dotenv.config();

// Parent farms the layout hangs off of. Kept in sync with the simulator defaults
// so the hierarchy always has a valid parent even on a fresh database.
const FARMS = [
  { farm_id: "delhi_north", name: "Delhi North", city: "Delhi", capacity: 250, lat: 28.6139, lng: 77.209 },
  { farm_id: "delhi_south", name: "Delhi South", city: "Delhi", capacity: 180, lat: 28.4595, lng: 77.0266 },
  { farm_id: "mumbai_coastal", name: "Mumbai Coastal", city: "Mumbai", capacity: 300, lat: 19.076, lng: 72.8777 },
  { farm_id: "australia", name: "Sydney Desert", city: "Sydney", capacity: 250, lat: -33.8688, lng: 151.2093 },
  { farm_id: "usa", name: "California Valley", city: "California", capacity: 180, lat: 36.7783, lng: -119.4179 },
];

const ROWS_PER_FARM = 12;
const PANELS_PER_ROW = 20;

const FAULT_LIBRARY = [
  { code: "F1", name: "Over-Temperature", severity: "HIGH" },
  { code: "F5", name: "Over-Current (Running)", severity: "HIGH" },
  { code: "F8", name: "Battery Voltage Out of Range", severity: "CRITICAL" },
  { code: "F12", name: "RPM Control Fault", severity: "HIGH" },
];

// Deterministic-ish status distribution: mostly healthy, a sprinkle of issues.
function panelStatus(rowNo, panelNo) {
  const roll = (rowNo * 31 + panelNo * 17) % 100;
  if (roll < 4) return "FAULT";
  if (roll < 7) return "MAINTENANCE";
  if (roll < 14) return "DEGRADED";
  return "OK";
}

const seed = async () => {
  try {
    console.log("🔌 Connected to MySQL for layout seeding");

    // 1. Ensure parent farms exist (upsert – never clobber live custom farms).
    for (const f of FARMS) {
      await query(
        `INSERT INTO farms (farm_id, name, city, capacity, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), city = VALUES(city), capacity = VALUES(capacity),
           lat = VALUES(lat), lng = VALUES(lng)`,
        [f.farm_id, f.name, f.city, f.capacity, f.lat, f.lng]
      );
    }

    // 2. Wipe & rebuild rows/panels for these farms only.
    const farmIds = FARMS.map((f) => f.farm_id);
    const inList = farmIds.map(() => "?").join(", ");
    await query(`DELETE FROM panel_rows WHERE farm_id IN (${inList})`, farmIds);
    await query(`DELETE FROM panels WHERE farm_id IN (${inList})`, farmIds);
    // Panel-scoped alert packets (those tagged with a panel_id). packet_faults
    // rows cascade-delete via the FK.
    await query(
      `DELETE FROM scada_packets WHERE panel_id IS NOT NULL AND farm_id IN (${inList})`,
      farmIds
    );
    console.log("🧹 Cleared old rows/panels/panel-alerts");

    const rows = [];
    const panels = [];
    const alertPackets = [];

    for (const farm of FARMS) {
      for (let r = 1; r <= ROWS_PER_FARM; r++) {
        const row_id = rowIdFor(farm.farm_id, r);
        const rowPanels = [];

        for (let p = 1; p <= PANELS_PER_ROW; p++) {
          const status = panelStatus(r, p);
          const panel_id = panelIdFor(farm.farm_id, r, p);
          // Installed 1–4 years ago, deterministic per panel.
          const ageDays = 365 + ((r * 37 + p * 13) % 1100);
          panels.push([
            panel_id,
            farm.farm_id,
            row_id,
            r,
            p,
            `Panel ${String(p).padStart(2, "0")}`,
            `${farm.farm_id.toUpperCase()}-R${r}-P${p}`,
            550, // Wp per module
            25,
            180,
            status,
            new Date(Date.now() - ((r + p) % 9) * 86400000),
            new Date(Date.now() - ageDays * 86400000),
          ]);
          rowPanels.push(status);

          // Every faulted / maintenance panel emits a panel-scoped alert packet
          // carrying row_id + panel_id foreign keys (not just farm_id).
          if (status === "FAULT" || status === "MAINTENANCE") {
            const fault = FAULT_LIBRARY[(r + p) % FAULT_LIBRARY.length];
            alertPackets.push({
              farm_id: farm.farm_id,
              row_id,
              panel_id,
              row_no: r,
              panel_no: p,
              city: farm.city,
              device_state: 2,
              error_code: parseInt(fault.code.replace(/\D/g, ""), 10),
              status: "FAULT",
              timestamp: new Date(),
              fault: {
                code: fault.code,
                name: fault.name,
                severity: fault.severity,
                triggered_by: "SEED_LAYOUT",
                timestamp: new Date(),
              },
            });
          }
        }

        const faultCount = rowPanels.filter((s) => s === "FAULT" || s === "MAINTENANCE").length;
        rows.push([
          row_id,
          farm.farm_id,
          r,
          `Row ${String(r).padStart(2, "0")}`,
          PANELS_PER_ROW,
          r % 2 === 0 ? "E-W" : "N-S",
          25,
          faultCount > 0 ? "FAULT" : "NORMAL",
        ]);
      }
    }

    // Bulk insert rows + panels.
    await pool.query(
      `INSERT INTO panel_rows
        (row_id, farm_id, row_no, label, panel_count, orientation, tilt_deg, status)
       VALUES ?`,
      [rows]
    );
    await pool.query(
      `INSERT INTO panels
        (panel_id, farm_id, row_id, row_no, panel_no, label, serial, wattage,
         tilt_deg, azimuth_deg, status, last_clean_at, installed_at)
       VALUES ?`,
      [panels]
    );

    // Alert packets: one scada_packets row + one packet_faults row each.
    for (const a of alertPackets) {
      const result = await query(
        `INSERT INTO scada_packets
          (farm_id, row_id, panel_id, row_no, panel_no, city, device_state,
           error_code, status, \`timestamp\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.farm_id, a.row_id, a.panel_id, a.row_no, a.panel_no, a.city,
         a.device_state, a.error_code, a.status, a.timestamp]
      );
      await query(
        `INSERT INTO packet_faults
          (packet_ref, farm_id, code, name, severity, triggered_by, row_id, panel_id, \`timestamp\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.insertId, a.farm_id, a.fault.code, a.fault.name, a.fault.severity,
         a.fault.triggered_by, a.row_id, a.panel_id, a.fault.timestamp]
      );
    }

    console.log(
      `✅ Seeded ${FARMS.length} farms × ${ROWS_PER_FARM} rows × ${PANELS_PER_ROW} panels ` +
        `= ${rows.length} rows / ${panels.length} panels / ${alertPackets.length} panel-alerts`
    );
    process.exit(0);
  } catch (err) {
    console.error("❌ Layout seeding failed:", err.message);
    process.exit(1);
  }
};

seed();
