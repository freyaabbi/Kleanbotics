# Connecting a real robot

The dashboard reads every robot from the `scada_packets` table. Data can arrive
two ways — pick one:

- **HTTP ingest** (below) — simplest; good for a WiFi robot or a USB→laptop bridge.
- **EMQX / MQTT** (see the bottom section) — best for many robots / remote sites.

Both use the same payload fields and end up in the same table, so the Robot
Monitor UI is identical either way.

---

## Option A — HTTP ingest

A robot gets its data in through one endpoint:

```
POST /api/telemetry/ingest        (Node API, default http://<server>:5050)
Content-Type: application/json
x-api-key: <INGEST_API_KEY>        # only if configured (see below)
```

## Payload

Only `farm_id` is required; send whatever signals the robot has:

```json
{
  "farm_id": "rooftop-a",
  "motor_direction": "FORWARD",     // FORWARD | REVERSE | STOP
  "motor_pwm": 200,                 // 0..255
  "motor_speed": 47,                // rpm
  "motor_status": "RUNNING",        // RUNNING | IDLE | FAULT
  "power_state": 1,                 // 1 on / 0 off
  "rain_status": 0,                 // 1 wet / 0 dry
  "obstacle_detected": 0,           // 1 blocked / 0 clear
  "alarm_active": 0,                // 1 sounding / 0 silent
  "battery_percentage": 82,
  "error_code": 0                   // non-zero -> row flagged FAULT
}
```

Booleans accept `1/0`, `true/false`, `"on"/"off"`. Post every 2–5 seconds
(older than 2 min shows as **Offline**).

## Steps

1. **Register the robot's farm** in the dashboard → *Manage Farms* (or the farms API).
   The `farm_id` in the payload must match. Unknown ids are rejected with a clear 404.
2. **(Recommended) Set an API key.** In `backend/.env`:
   ```
   INGEST_API_KEY=some-long-random-secret
   ```
   Then send it as the `x-api-key` header. If unset, ingest is open (dev only).
3. **Point the robot at the API** and start posting. Firmware reference:
   `backend/scripts/esp32_robot_ingest.ino`.
4. **Open Robot Monitor**, turn **Demo preview → Off**. The unit's tiles and the
   PWM / Events charts now reflect live hardware.

## Test the pipe without hardware

```
cd backend/scripts
..\..\solarvenv\Scripts\python robot_ingest_test.py --farm rooftop-a
# add --key YOUR_KEY if INGEST_API_KEY is set
```

This posts changing telemetry every 3s so you can confirm the endpoint, DB, and
dashboard all work before flashing a board.

---

## Option B — EMQX / MQTT

Best when you have several robots or they live at remote sites. The backend runs
an MQTT subscriber that writes every status message into the same table.

**Topics** (`MQTT_BASE_TOPIC` defaults to `kleanobotics/robots`):

| Direction | Topic | Payload |
|---|---|---|
| Robot → dashboard | `kleanobotics/robots/<farm_id>/status` | same JSON as HTTP ingest |
| Dashboard → robot | `kleanobotics/robots/<farm_id>/cmd` | `{ "command": "...", "value": ..., "ts": "..." }` |

**Enable it** — set these in `backend/.env`, then restart the API:

```
MQTT_URL=mqtts://<host>.emqxsl.com:8883     # EMQX Cloud (TLS). Local: mqtt://localhost:1883
MQTT_USERNAME=your-user
MQTT_PASSWORD=your-pass
MQTT_BASE_TOPIC=kleanobotics/robots
```

On boot the API logs `✅ MQTT: connected. Subscribing to kleanobotics/robots/+/status`.
Leaving `MQTT_URL` blank disables MQTT entirely (no effect on the rest of the app).

**Steps**

1. Create an EMQX broker (EMQX Cloud Serverless has a free tier, or run EMQX
   locally / in Docker). Note the host, port, username, password.
2. Register the robot's `farm_id` under *Manage Farms* (unknown ids are dropped).
3. Fill in the `MQTT_*` values in `backend/.env` and restart the API.
4. Flash `backend/scripts/esp32_mqtt_robot.ino` (publishes status, subscribes to cmd).
5. Robot Monitor → **Demo off**. Live data flows in.

**Test without hardware:**

```
cd backend/scripts
..\..\solarvenv\Scripts\python mqtt_robot_test.py --host <host> --port 8883 --tls \
    --user USER --pass PASS --farm rooftop-a
```

---

## Controls (dashboard → robot)

Admin control buttons call `POST /api/commands/send`. Delivery precedence:

1. **Blynk** — if the farm has a `blynk_token` (real pin writes).
2. **MQTT** — if EMQX is connected → publishes to `.../cmd` (the robot subscribes).
3. **REST queue** — otherwise, the command is stored as `PENDING` and the robot
   pulls it on its next poll (see below). This is the broker-less control path.

Commands: `POWER` (ON/OFF), `CMD_START_CYCLE`, `CMD_DOCK`, `SET_MODE` (AUTO/MANUAL), `SET_RPM`, `RESET`.

### REST control loop (no broker)

A robot that ingests over HTTP can also be **controlled** over HTTP — no MQTT
needed. It piggybacks two calls on the same loop it already uses to POST
telemetry:

```
GET  /api/commands/pending/<farm_id>?limit=20     # pull queued commands
POST /api/commands/ack   { "ids": [12, 13] }      # confirm they were applied
```

Both accept the same `x-api-key` header as ingest (if `INGEST_API_KEY` is set).

- `pending` returns `{ farm_id, commands: [{ id, command, value, created_at }] }`
  and flips those rows to `DELIVERED` so they aren't handed out twice.
- After acting on them, the robot POSTs their ids to `ack` (→ `ACKED`).

Control latency ≈ the poll interval (poll every 1–3s for near-real-time). Example
firmware loop:

```
every 3s:
  POST /api/telemetry/ingest   { farm_id, ...signals }        # report state
  cmds = GET /api/commands/pending/<farm_id>                  # fetch orders
  for c in cmds: apply(c.command, c.value)
  if cmds: POST /api/commands/ack { ids: [c.id for c in cmds] }
```
