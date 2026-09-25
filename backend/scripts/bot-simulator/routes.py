from aiohttp import web

def setup_routes(app, sim):
    async def health_check(request):
        return web.Response(text="✅ Python Simulator is ALIVE and reachable on Port 8085!")

    async def trigger_fault(request):
        print("\n📬 KNOCK KNOCK! Node.js is trying to send a fault...")
        try:
            data = await request.json()
            print(f"📦 Payload received: {data}")
            
            farm_id = data['farm_id']
            # Safely handle both 'fault_id' or 'faultCode' depending on what Node sends
            fault_code = data.get('faultCode') or data.get('fault_id')
            
            if farm_id not in sim.active_faults:
                sim.active_faults[farm_id] = []
                
            if fault_code: 
                sim.active_faults[farm_id].append(fault_code)
                print(f"🔴 SUCCESS! Queued {fault_code} for {farm_id}")
                return web.json_response({'status': 'fault_queued', 'farm': farm_id, 'fault': fault_code})
                
            # If no fault code, clear them
            sim.active_faults[farm_id] = []
            print(f"🟢 SUCCESS! Cleared faults for {farm_id}")
            return web.json_response({'status': 'cleared', 'farm': farm_id})
            
        except Exception as e:
            print(f"❌ PYTHON CRASHED: {e}")
            return web.json_response({'error': str(e)}, status=500)

    async def add_farm_api(request):
        try:
            data = await request.json()
            farm_id = data['farm_id']
            
            sim.add_new_farm(
                farm_id=farm_id,
                name=data['name'],
                lat=float(data['lat']),
                lng=float(data['lng']),
                capacity=float(data['capacity']),
                city=data.get('city')
            )
            
            print(f"🏗️ SUCCESS! New farm dynamically added: {data['name']}")
            return web.json_response({'status': 'farm_added', 'farm': farm_id})
        except Exception as e:
            print(f"❌ Failed to add farm: {e}")
            return web.json_response({'error': str(e)}, status=400)

    async def delete_farm_api(request):
        try:
            data = await request.json()
            farm_id = data.get("farm_id")
            
            if not farm_id:
                return web.json_response({"error": "Missing farm_id"}, status=400)
                
            if farm_id in sim.farms:
                del sim.farms[farm_id]
            if farm_id in sim.device_states:
                del sim.device_states[farm_id]
            if farm_id in sim.active_faults:
                del sim.active_faults[farm_id]
                
            print(f"🗑️ SUCCESS! Decommissioned farm dynamically: {farm_id}")
            return web.json_response({'status': 'farm_deleted', 'farm_id': farm_id})
        except Exception as e:
            print(f"❌ Failed to delete farm: {e}")
            return web.json_response({'error': str(e)}, status=400)

    # --- NEW: ACTIVE COMMAND LINK ---
    async def hardware_command(request):
        try:
            data = await request.json()
            farm_id = data.get("farm_id")
            command = data.get("command")
            value = data.get("value")
            
            if not farm_id or not command:
                return web.json_response({"error": "Missing farm_id or command"}, status=400)
                
            # Forward the command to the simulator's internal logic
            response = sim.process_command(farm_id, command, value)
            return web.json_response(response, status=200)
            
        except Exception as e:
            print(f"❌ COMMAND RELAY CRASHED: {e}")
            return web.json_response({'error': str(e)}, status=500)

    # --- ATTACH ENDPOINTS ---
    app.router.add_get('/', health_check)
    app.router.add_post('/trigger-fault', trigger_fault)
    app.router.add_post('/add-farm', add_farm_api)
    app.router.add_post('/delete-farm', delete_farm_api)
    
    # Node.js looks for this exact URL to relay your React UI commands
    app.router.add_post('/api/hardware/command', hardware_command)