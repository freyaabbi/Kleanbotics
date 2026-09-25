import express from "express";
import { getLast, getHistory, probe } from "../controllers/thingspeakController.js";
import { ingestRobotPacket } from "../controllers/ingestController.js";

const router = express.Router();

// Real-hardware ingest: robots POST their status here (writes scada_packets).
router.post("/ingest", ingestRobotPacket);

// Console probe for any public channel (must precede /:farmId routes)
router.get("/probe", probe);

// ThingSpeak read proxy (keys stay server-side, cached 15s)
router.get("/:farmId/last", getLast);        // live snapshot (feeds/last.json)
router.get("/:farmId/history", getHistory);  // charts (feeds.json?days&average)

export default router;
