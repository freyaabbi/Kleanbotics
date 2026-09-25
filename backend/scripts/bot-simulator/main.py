import asyncio
import sys

# Force UTF-8 stdout/stderr so emoji log lines don't crash on the Windows
# console (cp1252). Must run before importing simulator (it logs on import).
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from aiohttp import web

# Import our modular components
from simulator import SCADAPacketSimulator
from routes import setup_routes

async def main():
    # 1. Initialize the Core Simulator Logic
    sim = SCADAPacketSimulator()
    
    # 2. Setup the Web Server and attach the routes
    app = web.Application()
    setup_routes(app, sim)
    
    runner = web.AppRunner(app)
    await runner.setup()
    
    # 3. Start listening for Node.js
    site = web.TCPSite(runner, '0.0.0.0', 8085)
    await site.start()
    print("🌐 Python API explicitly listening on http://0.0.0.0:8085")
    
    # 4. Start the continuous SCADA data generation
    await sim.run_simulation()

if __name__ == "__main__":
    asyncio.run(main())