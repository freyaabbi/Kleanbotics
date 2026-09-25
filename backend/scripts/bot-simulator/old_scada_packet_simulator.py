import asyncio
import time
import random
from datetime import datetime
from pymongo import MongoClient
from aiohttp import web

# Import your awesome new weather service!
from services.weather_service import get_solar_farm_weather


client = MongoClient('mongodb://127.0.0.1:27017/')
db = client['solar_scada']
collection = db['scada_packets']
farms_collection = db['farms']
def load_farms_from_db(self):
        """Loads farms from MongoDB. If empty, seeds the default farms."""
        db_farms = list(farms_collection.find({}, {'_id': 0}))
        
        if not db_farms:
            print("🌱 No farms found in DB. Seeding defaults...")
            default_farms = {
                'delhi_north': {'lat': 28.6139, 'lng': 77.2090, 'capacity': 250, 'name': 'Delhi North Farm'},
                'delhi_south': {'lat': 28.4595, 'lng': 77.0266, 'capacity': 180, 'name': 'Delhi South Farm'},
                'mumbai_coastal': {'lat': 19.0760, 'lng': 72.8777, 'capacity': 300, 'name': 'Mumbai Coastal'},
                'australia': {'lat': -33.8688, 'lng': 151.2093, 'capacity': 250, 'name': 'Sydney Desert'},
                'usa': {'lat': 36.7783, 'lng': -119.4179, 'capacity': 180, 'name': 'California Valley'}
            }
            # Save defaults to DB
            for farm_id, data in default_farms.items():
                db_record = data.copy()
                db_record['farm_id'] = farm_id
                farms_collection.insert_one(db_record)
                self.farms[farm_id] = data
        else:
            print(f"🌍 Loaded {len(db_farms)} farms from Database.")
            for f in db_farms:
                farm_id = f.pop('farm_id')
                self.farms[farm_id] = f

def add_new_farm(self, farm_id, name, lat, lng, capacity):
        """Allows external APIs to inject a new farm dynamically"""
        new_farm = {'lat': lat, 'lng': lng, 'capacity': capacity, 'name': name}
        self.farms[farm_id] = new_farm
        
        # Save to DB so it survives the next restart
        db_record = new_farm.copy()
        db_record['farm_id'] = farm_id
        farms_collection.update_one({'farm_id': farm_id}, {'$set': db_record}, upsert=True)
        return new_farm
class SCADAPacketSimulator:
    def __init__(self):
        self.farms = {
            'delhi_north': {'lat': 28.6139, 'lng': 77.2090, 'capacity': 250, 'name': 'Delhi North Farm'},
            'delhi_south': {'lat': 28.4595, 'lng': 77.0266, 'capacity': 180, 'name': 'Delhi South Farm'},
            'mumbai_coastal': {'lat': 19.0760, 'lng': 72.8777, 'capacity': 300, 'name': 'Mumbai Coastal'}
        }
        self.active_faults = {}  # {farm_id: [fault_id, ...]}

    async def generate_normal_packet(self, farm_id):
        farm = self.farms[farm_id]
        
        # 🌤️ 1. FETCH REAL LIVE WEATHER
        live_weather = get_solar_farm_weather(lat=farm['lat'], lon=farm['lng'])
        
        # 2. Physics & Math based on Real Weather
        irradiance = live_weather['solar_radiation'] 
        ambient_temp = live_weather['temperature']
        
        # Panel temp is ambient + 20% due to dark glass absorbing heat
        panel_temp = ambient_temp * 1.2 if irradiance > 100 else ambient_temp
        
        dc_voltage = random.uniform(850, 950) if irradiance > 100 else 0
        dc_current = random.uniform(8, 15) if irradiance > 100 else 0
        
        # Power generation drops to 0 at night!
        ac_power = round((irradiance / 1000) * farm['capacity'] * 0.92, 1)
        
        battery_voltage = random.uniform(3.8, 4.15)
        chip_temp = random.uniform(50, 70)

        packet = {
            'packet_id': f"STM{int(time.time()*1000)}",
            'farm_id': farm_id,
            'farm_name': farm['name'],
            'location': {'lat': farm['lat'], 'lng': farm['lng']},
            'timestamp': datetime.now().isoformat(),
            'weather_context': live_weather,  # Injecting the live weather dict here
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

        # We use _update_nested because our packet is complex and deeply nested now
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
            {'id': 'F10', 'name': 'Connectivity Loss (Machine)', 'severity': 'MEDIUM',
             'modify': lambda p: self._update_nested(p, ['connectivity'], {'lora': False, 'gsm': False})}
        ]
        
        # Find the specific fault requested by the UI, or pick a random one if it's not in the list
        selected_fault = next((f for f in all_faults if f['id'] == self.active_faults[farm_id][0]), random.choice(all_faults))
        
        fault_packet = selected_fault['modify'](base_packet)
        fault_packet['faults'] = [{
            'code': selected_fault['id'],
            'name': selected_fault['name'],
            'severity': selected_fault['severity'],
            'triggered_by': 'UI_SIMULATOR',
            'timestamp': datetime.now().isoformat(),
            'action': 'TRIGGERED'
        }]
        fault_packet['status'] = 'FAULT'
        return fault_packet

    def _update_nested(self, packet, keys, value):
        """Helper for safe nested dict updates."""
        p = packet.copy()
        current = p
        for key in keys[:-1]:
            current = current.setdefault(key, {})
        current[keys[-1]] = value
        return p

    async def run_simulation(self):
        print("🚀 SCADA Simulator ACTIVE | NORMAL packets only")
        print("🌍 Live Weather Engine: ONLINE")
        
        while True:
            for farm_id in list(self.farms.keys()):
                if farm_id in self.active_faults and self.active_faults[farm_id]:
                    # If a fault is queued up, generate a broken packet and pop the fault off the queue
                    packet = await self.generate_fault_packet(farm_id)
                    self.active_faults[farm_id].pop(0) 
                else:
                    packet = await self.generate_normal_packet(farm_id)
                
                collection.insert_one(packet)
                
                status = packet['status']
                power = packet['electrical']['ac_power_kw']
                weather = packet['weather_context']['condition']
                print(f"📦 [{farm_id.upper()}] {power}kW | 🌤️ {weather} | {status}")
            await asyncio.sleep(5) # Slowed down to 5s so we don't spam the free weather API

async def main():
    
    sim = SCADAPacketSimulator()
    app = web.Application()
    async def add_farm_api(request):
        try:
            data = await request.json()
            farm_id = data['farm_id']
            
            sim.add_new_farm(
                farm_id=farm_id,
                name=data['name'],
                lat=float(data['lat']),
                lng=float(data['lng']),
                capacity=float(data['capacity'])
            )
            
            print(f"🏗️ SUCCESS! New farm dynamically added: {data['name']}")
            return web.json_response({'status': 'farm_added', 'farm': farm_id})
        except Exception as e:
            print(f"❌ Failed to add farm: {e}")
            return web.json_response({'error': str(e)}, status=400)

    app.router.add_post('/add-farm', add_farm_api) # Register the route

    runner = web.AppRunner(app)
    await runner.setup()
    
    site = web.TCPSite(runner, '0.0.0.0', 8085)
    await site.start()
    print("🌐 Python API explicitly listening on http://0.0.0.0:8085")
    
    await sim.run_simulation()
    async def trigger_fault(request):
        data = await request.json()
        farm_id = data['farm_id']
        fault_id = data.get('fault_id')
        
        if farm_id not in sim.active_faults:
            sim.active_faults[farm_id] = []
            
        if fault_id: 
            sim.active_faults[farm_id].append(fault_id)
            return web.json_response({'status': 'fault_queued', 'farm': farm_id, 'fault': fault_id})
        return web.json_response({'status': 'cleared', 'farm': farm_id})

    app.router.add_post('/trigger-fault', trigger_fault)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', 8085)
    await site.start()
    
    await sim.run_simulation()

if __name__ == "__main__":
    asyncio.run(main())