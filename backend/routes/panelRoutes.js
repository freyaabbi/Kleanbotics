import express from "express";
import { getPanel } from "../controllers/layoutController.js";
import { getPanelHistory, panelAction } from "../controllers/explorerController.js";

const router = express.Router();

// GET /api/panels/:id - single panel detail (metadata + telemetry + alerts)
router.get("/:id", getPanel);

// GET /api/panels/:id/history - 24h synthesized V/I/T/power sparkline
router.get("/:id/history", getPanelHistory);

// POST /api/panels/:id/action - clean / replace action
router.post("/:id/action", panelAction);

export default router;
