import express from "express";
import {
  getDashboardData,
  triggerFault,
  getRobotHistory
} from "../controllers/fakeDataController.js";

const router = express.Router();

/**
 * GET /api/fake-data
 * Purpose: Provides the "Live" snapshot for the dashboard.
 * Source: Scada packets ingested from .dat files.
 */
router.get("/fake-data", getDashboardData);

/**
 * GET /api/fakedataRoutes/robot-history/:farmId
 * Purpose: time-ordered robot signal series (PWM, obstacle, rain, alarm) for charts.
 */
router.get("/robot-history/:farmId", getRobotHistory);

/**
 * POST /api/trigger-fault
 * Purpose: Relays a UI command to the Python simulator (Port 8085).
 * Payload: { farm_id: "delhi_north", fault_id: "F1" }
 */
router.post("/trigger-fault", triggerFault);

export default router;