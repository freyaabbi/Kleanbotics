// controllers/commandController.js
import axios from 'axios';
import { queryOne, query } from '../db.js';
import { commandToPins, blynkBatchUpdate } from './blynkController.js';
import { isMqttReady, publishCommand } from '../mqttClient.js';

// Persist every command attempt for the audit trail.
async function logCommand(farm_id, command, value, pins, target, status, latency, response) {
  try {
    await query(
      `INSERT INTO command_log (farm_id, command, value, pins, target, status, latency_ms, response)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        farm_id,
        command,
        value == null ? null : String(value),
        pins ? JSON.stringify(pins) : null,
        target,
        status,
        latency,
        response ? String(response).slice(0, 500) : null,
      ]
    );
  } catch (e) {
    console.error('⚠️ Audit log write failed:', e.message);
  }
}

// POST /api/commands/send  { farm_id, command, value }
// LIVE farms (with a Blynk token) get a real pin write; SIM farms relay to
// the Python simulator. Both paths are logged with a latency measurement.
export const executeCommand = async (req, res) => {
  const { farm_id, command, value } = req.body;
  if (!farm_id || !command) {
    return res.status(400).json({ success: false, message: 'farm_id and command are required' });
  }

  const farm = await queryOne('SELECT blynk_token FROM farms WHERE farm_id = ?', [farm_id]);
  const pins = commandToPins(command, value);
  // Delivery precedence: a Blynk device wins; else MQTT if connected; else the
  // REST command queue (the robot polls it). A real REST robot uses QUEUE.
  const target = farm?.blynk_token ? 'BLYNK' : isMqttReady() ? 'MQTT' : 'QUEUE';
  let latency = 0;

  try {
    if (target === 'BLYNK') {
      // --- LIVE: batch pin write to Blynk (blr1.blynk.cloud) ---
      if (!pins) throw new Error(`Command "${command}" has no Blynk pin mapping`);
      const r = await blynkBatchUpdate(farm.blynk_token, pins);
      latency = r.latency;
      if (!r.ok) throw new Error(`Blynk update failed (${r.status})`);
      await logCommand(farm_id, command, value, pins, target, 'ACK', latency, r.text);
    } else if (target === 'MQTT') {
      // --- MQTT: publish to the robot's cmd topic (EMQX) ---
      const t0 = Date.now();
      publishCommand(farm_id, command, value);
      latency = Date.now() - t0;
      await logCommand(farm_id, command, value, pins, target, 'ACK', latency, 'published');
    } else {
      // --- REST QUEUE: persist as PENDING; the robot pulls it on its next
      // poll (GET /api/commands/pending/:farm_id). No broker required.
      const t0 = Date.now();
      const r = await query(
        `INSERT INTO command_queue (farm_id, command, value, status)
         VALUES (?, ?, ?, 'PENDING')`,
        [farm_id, command, value == null ? null : String(value)]
      );
      latency = Date.now() - t0;
      await logCommand(farm_id, command, value, pins, target, 'QUEUED', latency, `queue_id=${r.insertId}`);
      // Best-effort relay to the local Python simulator so demo mode still
      // reacts instantly; ignored if the simulator isn't running.
      axios.post('http://127.0.0.1:8085/api/hardware/command', { farm_id, command, value }).catch(() => {});
      return res.status(200).json({ success: true, target, status: 'QUEUED', queue_id: r.insertId, latency_ms: latency });
    }
    return res.status(200).json({ success: true, target, status: 'ACK', latency_ms: latency });
  } catch (error) {
    await logCommand(farm_id, command, value, pins, target, 'FAILED', latency, error.message);
    return res.status(502).json({ success: false, target, status: 'FAILED', latency_ms: latency, message: error.message });
  }
};

// Optional shared secret: reuse the ingest key so a robot uses one credential.
function checkRobotKey(req, res) {
  const requiredKey = process.env.INGEST_API_KEY;
  if (requiredKey && req.get('x-api-key') !== requiredKey) {
    res.status(401).json({ success: false, message: 'Invalid or missing x-api-key' });
    return false;
  }
  return true;
}

// GET /api/commands/pending/:farmId
// The robot polls this every few seconds (piggyback on its telemetry loop).
// Returns any PENDING commands and flips them to DELIVERED so they aren't
// handed out twice.
export const getPendingCommands = async (req, res) => {
  if (!checkRobotKey(req, res)) return;
  try {
    const { farmId } = req.params;
    // LIMIT can't be a bound param in mysql2 prepared statements — inline a
    // sanitised integer instead.
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const rows = await query(
      `SELECT id, command, value, created_at FROM command_queue
       WHERE farm_id = ? AND status = 'PENDING' ORDER BY id ASC LIMIT ${limit}`,
      [farmId]
    );
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await query(
        `UPDATE command_queue SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP(3)
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }
    return res.json({ farm_id: farmId, commands: rows });
  } catch (err) {
    console.error('❌ Pending-command fetch failed:', err.message);
    return res.status(500).json({ error: 'Failed to load pending commands' });
  }
};

// POST /api/commands/ack   { ids: [1,2,3] }  (or { id: 1 })
// The robot confirms it applied the commands.
export const ackCommands = async (req, res) => {
  if (!checkRobotKey(req, res)) return;
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids : body.id != null ? [body.id] : [];
    if (!ids.length) return res.status(400).json({ success: false, message: 'ids (array) or id is required' });
    await query(
      `UPDATE command_queue SET status = 'ACKED', acked_at = CURRENT_TIMESTAMP(3)
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    return res.json({ success: true, acked: ids.length });
  } catch (err) {
    console.error('❌ Command ack failed:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to ack commands' });
  }
};

// GET /api/control/:farmId/audit  → recent command history for a farm.
export const getAudit = async (req, res) => {
  try {
    const { farmId } = req.params;
    const rows = await query(
      'SELECT id, command, value, target, status, latency_ms, created_at FROM command_log WHERE farm_id = ? ORDER BY id DESC LIMIT 50',
      [farmId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit trail' });
  }
};
