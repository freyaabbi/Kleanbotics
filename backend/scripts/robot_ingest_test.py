"""
robot_ingest_test.py — pretend to be a real robot and POST live telemetry.

Use this to prove the ingest pipe end-to-end BEFORE the hardware is ready:
it sends a changing status every 3s to POST /api/telemetry/ingest, exactly
like an ESP32/Raspberry Pi would. Open the Robot Monitor (Demo = Off) and you
should see this unit appear and move.

Prereqs:
  1. The farm must exist. Add it under "Manage Farms" (or the API), e.g. farm_id "rooftop-a".
  2. The Node API must be running (npm run start:api).

Run:
  ..\..\solarvenv\Scripts\python robot_ingest_test.py --farm rooftop-a
  (add --key YOUR_KEY if INGEST_API_KEY is set in backend/.env)
"""
import argparse
import math
import random
import time

import requests

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:5050/api/telemetry/ingest")
parser.add_argument("--farm", required=True, help="farm_id already registered in the dashboard")
parser.add_argument("--key", default=None, help="x-api-key if INGEST_API_KEY is set")
parser.add_argument("--interval", type=float, default=3.0)
args = parser.parse_args()

headers = {"Content-Type": "application/json"}
if args.key:
    headers["x-api-key"] = args.key

print(f"📡 Posting fake robot telemetry to {args.url} as '{args.farm}' every {args.interval}s. Ctrl+C to stop.")

i = 0
try:
    while True:
        raining = random.random() < 0.05
        obstacle = (not raining) and random.random() < 0.08
        pwm = 0 if (raining or obstacle) else max(0, min(255, int(150 + 80 * math.sin(i / 5) + random.uniform(-12, 12))))
        running = pwm > 0

        payload = {
            "farm_id": args.farm,
            "motor_direction": ("FORWARD" if (i // 5) % 2 == 0 else "REVERSE") if running else "STOP",
            "motor_pwm": pwm,
            "motor_speed": round(pwm / 255 * 60, 1),
            "power_state": 1,
            "rain_status": 1 if raining else 0,
            "obstacle_detected": 1 if obstacle else 0,
            "alarm_active": 1 if (raining or obstacle) else 0,
            "motor_status": "IDLE" if (raining or obstacle) else ("RUNNING" if running else "IDLE"),
            "battery_percentage": 80,
        }

        try:
            r = requests.post(args.url, json=payload, headers=headers, timeout=5)
            print(f"  [{time.strftime('%H:%M:%S')}] {r.status_code} pwm={pwm:>3} "
                  f"dir={payload['motor_direction']:<7} rain={payload['rain_status']} "
                  f"obs={payload['obstacle_detected']} -> {r.json().get('message', r.text[:60])}")
        except requests.RequestException as e:
            print(f"  ⚠️  request failed: {e}")

        i += 1
        time.sleep(args.interval)
except KeyboardInterrupt:
    print("\n🛑 Stopped.")
