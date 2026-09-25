// scripts/clearMockLayout.js
// Removes the temporary mock layout (rows/panels/packets/faults) for every
// registered farm, leaving the farms themselves intact.
//   Run: node scripts/clearMockLayout.js
import { query } from "../db.js";

const run = async () => {
  try {
    const farms = await query("SELECT farm_id FROM farms");
    for (const f of farms) {
      await query("DELETE FROM panel_rows WHERE farm_id = ?", [f.farm_id]);
      await query("DELETE FROM panels WHERE farm_id = ?", [f.farm_id]);
      await query("DELETE FROM scada_packets WHERE farm_id = ?", [f.farm_id]);
    }
    console.log(`🧹 Cleared mock layout for ${farms.length} farm(s). Farms kept.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Clear failed:", err.message);
    process.exit(1);
  }
};

run();
