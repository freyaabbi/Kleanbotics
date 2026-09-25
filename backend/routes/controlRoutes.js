import express from "express";
import { isConnected, readback, logEvent } from "../controllers/blynkController.js";
import { getAudit } from "../controllers/commandcontroller.js";

const router = express.Router();

router.get("/:farmId/connection", isConnected); // LIVE online badge
router.get("/:farmId/readback", readback);       // V10–V15 device state
router.post("/:farmId/log-event", logEvent);     // Blynk push on critical faults
router.get("/:farmId/audit", getAudit);          // command audit trail

export default router;
