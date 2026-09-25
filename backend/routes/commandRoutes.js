// backend/routes/commandRoutes.js
import express from 'express';
import { executeCommand, getPendingCommands, ackCommands } from '../controllers/commandController.js';

const router = express.Router();

/**
 * POST /api/commands/send
 * Dashboard → server. Body: { farm_id, command, value }.
 * With no Blynk/MQTT the command is queued (status PENDING) for REST pickup.
 */
router.post('/send', executeCommand);

/**
 * GET /api/commands/pending/:farmId
 * Robot → server. Poll for queued commands (auto-marked DELIVERED).
 */
router.get('/pending/:farmId', getPendingCommands);

/**
 * POST /api/commands/ack
 * Robot → server. Confirm applied commands. Body: { ids: [..] } or { id }.
 */
router.post('/ack', ackCommands);

export default router;