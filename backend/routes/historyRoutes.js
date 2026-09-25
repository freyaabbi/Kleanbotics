import express from "express";
import { getHistory } from "../controllers/historyController.js";

const router = express.Router();

/**
 * GET /api/machines/history
 * 
 * Compatibility Note: 
 * This route matches your existing structure. 
 * Ensure your Frontend 'fetch' call uses: `/api/machines/history?device_id=1`
 */
router.get("/machines/history", getHistory);

export default router;