import { query } from "../db.js";

export async function getHistory(req, res) {
  try {
    const { device_id, interval } = req.query;
    const samplingInterval = parseInt(interval) || 5;

    if (!device_id) {
      return res.status(400).json({ error: "device_id is required" });
    }

    // Fetch static metadata from the farms table to match farm_id mapping
    const farmsList = await query("SELECT * FROM farms");
    const farmMeta = {};
    farmsList.forEach(f => {
      if (f.farm_id) farmMeta[f.farm_id] = f;
    });

    // Limit is inlined (not bound) so MySQL accepts it in the LIMIT clause.
    const limit = samplingInterval >= 60 ? 100 : 30;

    // Query history matching either numeric device_id OR string farm_id matching selection
    const numericId = Number(device_id);
    const history = Number.isFinite(numericId)
      ? await query(
          `SELECT * FROM scada_packets
            WHERE device_id = ? OR farm_id = ?
            ORDER BY id DESC LIMIT ${limit}`,
          [numericId, String(device_id)]
        )
      : await query(
          `SELECT * FROM scada_packets
            WHERE farm_id = ?
            ORDER BY id DESC LIMIT ${limit}`,
          [String(device_id)]
        );

    const isDeviceOffline = history.length > 0 && 
      (Date.now() - new Date(history[0].timestamp || Date.now()).getTime()) > 30000;

    const formattedData = history.map(packet => {
      const meta = farmMeta[packet.farm_id] || {};

      // Compute safe fallbacks
      const vSolar = packet.voltage_solar_panel || packet.voltage || 0;
      const iRun = packet.running_current || packet.current || 0;
      const acPower = packet.ac_power_kw || packet.power || ((vSolar * iRun) / 1000);

      let errorCode = 0;
      if (packet.error_code !== undefined) {
        errorCode = packet.error_code;
      } else if (packet.faults && packet.faults.length > 0) {
        const firstFault = packet.faults[0];
        const firstFaultCode = typeof firstFault === 'object' ? firstFault.code : firstFault;
        if (typeof firstFaultCode === 'string') {
          errorCode = parseInt(firstFaultCode.replace(/[^0-9]/g, '')) || 0;
        } else {
          errorCode = parseInt(firstFaultCode) || 0;
        }
      }

      // Structure exactly like fakeDataController.js so metrics don't break or read 0!
      return {
        ...packet,
        farm_name: meta.name || packet.farm_name || `Bot #${packet.farm_id || device_id}`,
        city: meta.city || packet.city || 'Unknown',
        electrical: {
          dc_voltage_v: vSolar,
          dc_current_a: iRun,
          ac_power_kw: acPower
        },
        environmental: {
          temperature_c: packet.temperature || 0,
          humidity: packet.humidity || 0
        },
        motor_speed: packet.motor_speed || 0,
        status: isDeviceOffline ? 'OFFLINE' : (packet.status || ((packet.device_state === 2 || errorCode !== 0) ? 'FAULT' : 'NORMAL')),
        
        // Exact 24-hour time formatting string for chart alignment
        time: new Date(packet.timestamp || Date.now()).toLocaleTimeString('en-GB', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      };
    }).reverse(); // Left-to-right timeline representation

    res.json(formattedData);

  } catch (error) {
    console.error("❌ History Controller Error:", error.message);
    res.status(500).json({ error: "Failed to fetch historical telemetry" });
  }
}