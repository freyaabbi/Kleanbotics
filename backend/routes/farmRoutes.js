import express from "express";
import { getFarms, addFarm, deleteFarm } from "../controllers/farmController.js";
import { getRows, getRowPanels } from "../controllers/layoutController.js";
import { getRowCompare, getMaintenanceQueue, getReplay } from "../controllers/explorerController.js";

const router = express.Router();

router.get("/", getFarms);
router.post("/", addFarm);

// --- Fleet hierarchy drill-down (Farm › Row › Panel) ---
router.get("/:id/rows/compare", getRowCompare);     // overlay 2–5 rows on one chart
router.get("/:id/rows", getRows);                    // row grid for a farm
router.get("/:id/rows/:rowNo/panels", getRowPanels); // panel strip for a row

// --- Analytics screens ---
router.get("/:id/maintenance", getMaintenanceQueue); // ranked by lost kWh
router.get("/:id/replay", getReplay);                // day-replay fault timeline

router.delete("/:id", deleteFarm);

export default router;
