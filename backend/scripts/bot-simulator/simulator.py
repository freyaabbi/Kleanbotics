import asyncio
import time
import random
import threading
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

from database import (
    fetch_all_farms,
    upsert_farm,
    delete_farm,
    delete_packets_for_farm,
    insert_packet,
)
from services.weather_service import get_solar_farm_weather

app = Flask(__name__)
CORS(app)

class SCADAPacketSimulator:
    def __init__(self):
        self.farms = {}
        self.active_faults = {}
        # NEW: Track the override states from the React Dashboard
        self.device_states = {} 
        self.load_farms_from_db()

    def load_farms_from_db(self):
        # No auto-seeding of demo farms — the fleet is whatever the operator has
        # registered (real places). An empty DB simply means nothing to simulate.
        db_farms = fetch_all_farms()
        print(f"🌍 Loaded {len(db_farms)} farm(s) from Database.")
        for f in db_farms:
            farm_id = f.pop('farm_id')
            self.farms[farm_id] = f
            self._init_device_state(farm_id)

    def _init_device_state(self, farm_id):
        if farm_id not in self.device_states:
            self.device_states[farm_id] = {
                "MODE": "AUTO",
                "RPM": None,
                "STATE": 1 # 0: Docked, 1: Cleaning
            }

    # --- NEW: COMMAND PROCESSOR ---
    def process_command(self, farm_id, command, value):
        self._init_device_state(farm_id)
        print(f"⚡ [COMMAND LINK] Farm {farm_id} received {command}: {value}")

        if command == "SET_MODE":
            self.device_states[farm_id]["MODE"] = value
            if value == "AUTO":
                self.device_states[farm_id]["RPM"] = None
        elif command == "SET_RPM":
            self.device_states[farm_id]["RPM"] = float(value)
        elif command == "CMD_START_CYCLE":
            self.device_states[farm_id]["STATE"] = 1
        elif command == "CMD_DOCK":
            self.device_states[farm_id]["STATE"] = 0
            self.device_states[farm_id]["RPM"] = 0.0
        elif command == "POWER":
            on = str(value).upper() in ("ON", "1", "TRUE")
            self.device_states[farm_id]["STATE"] = 1 if on else 0
            if not on:
                self.device_states[farm_id]["RPM"] = 0.0

        return {"status": "ACK", "message": f"Command {command} applied to {farm_id}"}

    def add_new_farm(self, farm_id, name, lat, lng, capacity, city=None):
        new_farm = {'lat': lat, 'lng': lng, 'capacity': capacity, 'name': name}
        self.farms[farm_id] = new_farm
        db_record = new_farm.copy()
        db_record['farm_id'] = farm_id
        if city is not None:
            db_record['city'] = city  # don't clobber the city the Node API stored
        upsert_farm(db_record)
        self._init_device_state(farm_id)
        return new_farm

    async def generate_normal_packet(self, farm_id):
        farm = self.farms[farm_id]
        state = self.device_states[farm_id]
        
        # Determine Motor RPM based on active commands
        if state["MODE"] == "MANUAL" and state["RPM"] is not None:
            current_rpm = state["RPM"]
        elif state["STATE"] == 0:
            current_rpm = 0.0 # Docked
        else:
            current_rpm = round(random.uniform(50.0, 60.0), 2) # Auto cleaning speed

        # Calculate local timezone offset from longitude (15 degrees = 1 hour)
        offset_hours = round(farm['lng'] / 15.0)
        
        # Calculate local time relative to UTC
        from datetime import datetime, timezone, timedelta
        utc_now = datetime.now(timezone.utc)
        local_time = utc_now + timedelta(hours=offset_hours)
        local_hour = local_time.hour
        
        # Daylight hours window: 8:00 AM to 6:00 PM (18:00) local time
        is_daylight = 8 <= local_hour < 18

        # Live Weather
        try:
            live_weather = get_solar_farm_weather(lat=farm['lat'], lon=farm['lng'])
            irradiance = live_weather.get('solar_radiation', 500) 
            ambient_temp = live_weather.get('temperature', 30)
        except:
            live_weather = {"condition": "Unknown", "temperature": 30, "solar_radiation": 500}
            irradiance, ambient_temp = 500, 30

        if is_daylight:
            # If weather API is blocked or returned non-positive irradiance during the day, fallback to positive daytime irradiance
            if not irradiance or irradiance <= 0:
                irradiance = random.uniform(400, 800)
        else:
            # Nighttime: force zero solar irradiance
            irradiance = 0.0

        # Update the live weather context to reflect day/night irradiance
        live_weather['solar_radiation'] = round(irradiance, 1)

        panel_temp = ambient_temp * 1.2 if irradiance > 100 else ambient_temp
        dc_voltage = random.uniform(850, 950) if irradiance > 100 else 0.0
        dc_current = random.uniform(8, 15) if irradiance > 100 else 0.0
        ac_power = round((irradiance / 1000) * farm['capacity'] * 0.92, 1) if irradiance > 0 else 0.0
        
        battery_voltage = random.uniform(3.8, 4.15)
        chip_temp = random.uniform(50, 70)

        # --- Robot live-tracking signals (drive + cleaning head) ---
        is_running = current_rpm > 0
        # PWM duty scaled from RPM (cleaning speed tops out ~60 rpm -> 255).
        motor_pwm = int(min(255, max(0, round(current_rpm / 60.0 * 255)))) if is_running else 0
        # Alternate travel direction every ~30s so the sweep looks alive.
        direction = ("FORWARD" if int(time.time() // 30) % 2 == 0 else "REVERSE") if is_running else "STOP"
        rain_detected = 1 if "rain" in str(live_weather.get("condition", "")).lower() else (1 if random.random() < 0.05 else 0)
        obstacle = 1 if (is_running and random.random() < 0.05) else 0
        # Rain or an obstacle stalls the head; the buzzer sounds until cleared.
        if rain_detected or obstacle:
            motor_status = "IDLE"
            alarm = 1
        elif is_running:
            motor_status = "RUNNING"
            alarm = 0
        else:
            motor_status = "IDLE"
            alarm = 0

        robot = {
            "motor_direction": "STOP" if (rain_detected or obstacle) else direction,
            "motor_pwm": 0 if (rain_detected or obstacle) else motor_pwm,
            "power_state": 0 if state["STATE"] == 0 else 1,
            "rain_status": rain_detected,
            "motor_status": motor_status,
            "obstacle_detected": obstacle,
            "alarm_active": alarm,
        }

        packet = {
            'packet_id': f"STM{int(time.time()*1000)}",
            'farm_id': farm_id,
            'farm_name': farm['name'],
            'location': {'lat': farm['lat'], 'lng': farm['lng']},
            'timestamp': datetime.now().isoformat(),
            'weather_context': live_weather,
            'motor_speed': current_rpm, # NEW: Pulled out for easy mapping in Reports
            'robot': robot,             # NEW: live drive / cleaning-head signals
            'environmental': {
                'irradiance_wm2': round(irradiance, 1),
                'panel_temp_c': round(panel_temp, 1),
                'ambient_temp_c': round(ambient_temp, 1)
            },
            'electrical': {
                'dc_voltage_v': round(dc_voltage, 1),
                'dc_current_a': round(dc_current, 1),
                'ac_power_kw': ac_power,
                'frequency_hz': 50.0 if irradiance > 100 else 0.0
            },
            'stm32_chip': {
                'chip_temp_c': round(chip_temp, 1),
                'battery_v': round(battery_voltage, 2),
                'uptime_hours': random.randint(150, 800),
                'firmware': 'v2.1.3'
            },
            'connectivity': {'lora': True, 'gsm': True},
            'faults': [],
            'status': 'NORMAL'
        }
        return packet

    async def generate_fault_packet(self, farm_id):
        base_packet = await self.generate_normal_packet(farm_id)
        all_faults = [
            {'id': 'F1', 'name': 'Over-Temperature', 'severity': 'HIGH',
             'modify': lambda p: self._update_nested(p, ['environmental', 'panel_temp_c'], random.uniform(68, 78))},
            {'id': 'F4', 'name': 'Battery Over-Charge', 'severity': 'HIGH',
             'modify': lambda p: self._update_nested(p, ['stm32_chip', 'battery_v'], random.uniform(29.2, 30.5))},
            {'id': 'F5', 'name': 'Over-Current (Running)', 'severity': 'HIGH',
             'modify': lambda p: self._update_nested(p, ['electrical', 'dc_current_a'], random.uniform(20, 26))},
            {'id': 'F6', 'name': 'Under-Current / Low Load', 'severity': 'LOW',
             'modify': lambda p: self._update_nested(p, ['electrical', 'dc_current_a'], random.uniform(0.5, 1.8))},
            {'id': 'F7', 'name': 'Solar Panel Input Fault', 'severity': 'LOW',
             'modify': lambda p: self._update_nested(p, ['environmental', 'irradiance_wm2'], random.uniform(20, 90))},
            {'id': 'F8', 'name': 'Battery Voltage Out of Range', 'severity': 'CRITICAL',
             'modify': lambda p: self._update_nested(p, ['stm32_chip', 'battery_v'], random.choice([random.uniform(1.8, 2.9), random.uniform(16, 18)]))},
            {'id': 'F10', 'name': 'Connectivity Loss', 'severity': 'MEDIUM',
             'modify': lambda p: self._update_nested(p, ['connectivity'], {'lora': False, 'gsm': False})}
        ]
        
        selected_fault = next((f for f in all_faults if f['id'] == self.active_faults[farm_id][0]), random.choice(all_faults))
        fault_packet = selected_fault['modify'](base_packet)

        # Tag the fault to a specific row/panel so alerts carry hierarchy FKs
        # (12 rows x 20 panels layout, matching seedLayout.js).
        row_no = random.randint(1, 12)
        panel_no = random.randint(1, 20)
        fault_packet['row_no'] = row_no
        fault_packet['panel_no'] = panel_no
        fault_packet['row_id'] = f"{farm_id}_r{row_no:02d}"
        fault_packet['panel_id'] = f"{farm_id}_r{row_no:02d}_p{panel_no:02d}"

        fault_packet['faults'] = [{
            'code': selected_fault['id'],
            'name': selected_fault['name'],
            'severity': selected_fault['severity'],
            'triggered_by': 'UI_SIMULATOR',
            'row_id': fault_packet['row_id'],
            'panel_id': fault_packet['panel_id'],
            'timestamp': datetime.now().isoformat(),
            'action': 'TRIGGERED'
        }]
        fault_packet['status'] = 'FAULT'
        # A fault trips the motor into FAULT and sounds the alarm.
        fault_robot = dict(fault_packet.get('robot', {}))
        fault_robot['motor_status'] = 'FAULT'
        fault_robot['alarm_active'] = 1
        fault_packet['robot'] = fault_robot
        return fault_packet

    def _update_nested(self, packet, keys, value):
        p = packet.copy()
        current = p
        for key in keys[:-1]:
            current = current.setdefault(key, {})
        current[keys[-1]] = value
        return p

    async def run_simulation(self):
        print("🚀 SCADA Simulator ACTIVE | Normal & Manual Overrides Online")
        
        while True:
            for farm_id in list(self.farms.keys()):
                if farm_id in self.active_faults and self.active_faults[farm_id]:
                    packet = await self.generate_fault_packet(farm_id)
                    self.active_faults[farm_id].pop(0) 
                else:
                    packet = await self.generate_normal_packet(farm_id)
                
                insert_packet(packet)

                status = packet['status']
                power = packet['electrical']['ac_power_kw']
                rpm = packet['motor_speed']
                print(f"📦 [{farm_id.upper()}] {power}kW | RPM: {rpm} | {status}")
            await asyncio.sleep(5)

# --- GLOBAL INSTANCE ---
sim = SCADAPacketSimulator()

# --- FLASK API ROUTES ---
@app.route('/api/hardware/command', methods=['POST'])
def receive_command():
    data = request.json
    farm_id = data.get("farm_id")
    command = data.get("command")
    value = data.get("value")
    
    if not farm_id or not command:
        return jsonify({"error": "Missing parameters"}), 400
        
    response = sim.process_command(farm_id, command, value)
    return jsonify(response), 200

@app.route('/trigger-fault', methods=['POST'])
def trigger_fault_api():
    """Catches fault injections from Node.js and queues them in the simulator."""
    data = request.json
    farm_id = data.get("farm_id")
    fault_code = data.get("faultCode") or data.get("fault_id")
    
    if not farm_id:
        return jsonify({"error": "Missing farm_id"}), 400
        
    if farm_id not in sim.active_faults:
        sim.active_faults[farm_id] = []
        
    if fault_code:
        sim.active_faults[farm_id].append(fault_code)
        print(f"🔴 [SCADA LAB] Queued Fault {fault_code} for Hub {farm_id}")
        return jsonify({'status': 'fault_queued', 'farm': farm_id, 'fault': fault_code}), 200
        
    # If no fault code is sent, clear all faults
    sim.active_faults[farm_id] = []
    print(f"🟢 [SCADA LAB] Cleared all faults for Hub {farm_id}")
    return jsonify({'status': 'cleared', 'farm': farm_id}), 200

@app.route('/add-farm', methods=['POST'])
def add_farm_api():
    """Dynamically adds/updates a solar farm in the simulator."""
    data = request.json
    farm_id = data.get("farm_id")
    name = data.get("name")
    lat = float(data.get("lat"))
    lng = float(data.get("lng"))
    capacity = float(data.get("capacity"))
    
    if not farm_id or not name:
        return jsonify({"error": "Missing farm_id or name"}), 400
        
    new_farm = sim.add_new_farm(farm_id, name, lat, lng, capacity, city=data.get("city"))
    print(f"🌱 [SCADA SIMULATOR] Dynamically added farm: {farm_id} ({name})")
    return jsonify({"status": "farm_added", "farm": new_farm}), 200

@app.route('/delete-farm', methods=['POST'])
def delete_farm_api():
    """Dynamically deletes a solar farm from the simulator."""
    data = request.json
    farm_id = data.get("farm_id")
    
    if not farm_id:
        return jsonify({"error": "Missing farm_id"}), 400
        
    if farm_id in sim.farms:
        del sim.farms[farm_id]
    if farm_id in sim.device_states:
        del sim.device_states[farm_id]
    if farm_id in sim.active_faults:
        del sim.active_faults[farm_id]
        
    # Also delete database rows (done on Node side too, but done here for safety)
    delete_farm(farm_id)
    delete_packets_for_farm(farm_id)
    
    print(f"🗑️ [SCADA SIMULATOR] Dynamically deleted farm: {farm_id}")
    return jsonify({"status": "farm_deleted", "farm_id": farm_id}), 200


# --- MULTI-THREADING SETUP ---
def start_async_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(sim.run_simulation())

if __name__ == "__main__":
    # 1. Start the simulation loop in a background thread
    threading.Thread(target=start_async_loop, daemon=True).start()
    
    # 2. Start the Flask server on the main thread
    print("📡 Flask Command Listener booting on port 8085...")
    app.run(host='0.0.0.0', port=8085, debug=False, use_reloader=False)