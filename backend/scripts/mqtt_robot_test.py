"""
mqtt_robot_test.py — pretend to be a real robot and PUBLISH status to EMQX.

Proves the MQTT pipe end-to-end before hardware exists: publishes a changing
status every 3s to  <base>/<farm>/status . The backend's MQTT subscriber stores
each message, and it appears on the Robot Monitor (Demo = Off).

Prereqs:
  1. The farm must be registered in the dashboard (Manage Farms), e.g. "rooftop-a".
  2. The Node API must be running with MQTT_URL set in backend/.env.
  3. Same broker + credentials the backend uses.

Run (EMQX Cloud Serverless, TLS):
  ..\..\solarvenv\Scripts\python mqtt_robot_test.py --host xxxx.emqxsl.com --port 8883 --tls \
      --user USER --pass PASS --farm rooftop-a
Run (local EMQX, no TLS):
  ..\..\solarvenv\Scripts\python mqtt_robot_test.py --host localhost --port 1883 --farm rooftop-a
"""
import argparse
import json
import math
import random
import time

import paho.mqtt.client as mqtt

p = argparse.ArgumentParser()
p.add_argument("--host", required=True)
p.add_argument("--port", type=int, default=1883)
p.add_argument("--tls", action="store_true", help="use TLS (EMQX Cloud uses 8883)")
p.add_argument("--user", default=None)
p.add_argument("--pass", dest="password", default=None)
p.add_argument("--farm", required=True, help="farm_id registered in the dashboard")
p.add_argument("--base", default="kleanobotics/robots")
p.add_argument("--interval", type=float, default=3.0)
args = p.parse_args()

topic = f"{args.base}/{args.farm}/status"

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"robot-test-{random.randint(1000,9999)}")
if args.user:
    client.username_pw_set(args.user, args.password)
if args.tls or args.port == 8883:
    client.tls_set()  # system CA roots (works with EMQX Cloud)

client.connect(args.host, args.port, keepalive=30)
client.loop_start()
print(f"📡 Publishing to {args.host}:{args.port}  topic={topic}  every {args.interval}s. Ctrl+C to stop.")

i = 0
try:
    while True:
        raining = random.random() < 0.05
        obstacle = (not raining) and random.random() < 0.08
        pwm = 0 if (raining or obstacle) else max(0, min(255, int(150 + 80 * math.sin(i / 5) + random.uniform(-12, 12))))
        running = pwm > 0

        payload = {
            "farm_id": args.farm,  # also carried in the topic; either works
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
        info = client.publish(topic, json.dumps(payload), qos=1)
        info.wait_for_publish(timeout=5)
        print(f"  [{time.strftime('%H:%M:%S')}] pub pwm={pwm:>3} dir={payload['motor_direction']:<7} "
              f"rain={payload['rain_status']} obs={payload['obstacle_detected']}")
        i += 1
        time.sleep(args.interval)
except KeyboardInterrupt:
    print("\n🛑 Stopped.")
    client.loop_stop()
    client.disconnect()
