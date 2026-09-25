import React, { useEffect, useState, useRef } from 'react';

const FAULT_METADATA = {
  1: { name: "Over-Temperature", desc: "Temp > 65°C or < 24°C" },
  2: { name: "Battery Under-Voltage", desc: "Start-up threshold failure" },
  3: { name: "Voltage Drop", desc: "Voltage drop during operation" },
  4: { name: "Battery Over-Charge", desc: "Voltage ≥ 29.1 V detected" },
  5: { name: "Over-Current", desc: "Exceeds 15A safety limit" },
  6: { name: "Low Load Anomaly", desc: "Current persistently < 2A" },
  7: { name: "Solar Input Fault", desc: "Voltage OOR (10V - 26V)" },
  8: { name: "Battery OOR", desc: "Voltage OOR (3V - 15V)" },
  9: { name: "Charging Surge", desc: "Peak voltage ≥ 29.1 V" },
  10: { name: "Machine Link Loss", desc: "LoRa/GSM connectivity lost" },
  11: { name: "Gateway Link Loss", desc: "Backhaul link down" },
  12: { name: "RPM Control Fault", desc: "Motor feedback deviation" }
};

const FarmControls = ({ botStatus, notifications, setNotifications, activeFarmId, setActiveFarmId }) => {
  const [controlMode, setControlMode] = useState('AUTO');
  const [targetRpm, setTargetRpm] = useState(50);
  const [direction, setDirection] = useState('FWD'); // FWD (→) or REV (←)

  // --- TOLERANCE TIME STATE (In Seconds) ---
  const [toleranceTime, setToleranceTime] = useState(10); 

  // --- POPUP WINDOW CONTROL STATE ---
  const [isSandboxOpen, setIsSandboxOpen] = useState(false);

  // --- VIRTUAL HARDWARE SIMULATOR STATES ---
  const [isBotMoving, setIsBotMoving] = useState(false);
  const [botPosition, setBotPosition] = useState(0); 
  const [lastTxCommand, setLastTxCommand] = useState('NONE');
  const [txPulse, setTxPulse] = useState(false);
  const [rxPulse, setRxPulse] = useState(false);
  
  // MUTABLE REFERENCES TO PREVENT REACT STALE CLOSURES
  const botPositionRef = useRef(0);
  const movingDirectionRef = useRef(1);
  const simIntervalRef = useRef(null);
  const virtualBatteryRef = useRef(25.8); 
  const faultTimestampsRef = useRef([]); 

  // Dynamic references for streaming data loops
  const liveRpmRef = useRef(50);
  const liveModeRef = useRef('AUTO');

  useEffect(() => { liveRpmRef.current = targetRpm; }, [targetRpm]);
  useEffect(() => { liveModeRef.current = controlMode; }, [controlMode]);

  const defaultFarms = [
    { id: 'delhi_north', name: 'Delhi North Farm' },
    { id: 'delhi_south', name: 'Delhi South Farm' },
    { id: 'mumbai_coastal', name: 'Mumbai Coastal' },
    { id: 'australia', name: 'Sydney Desert' },
    { id: 'usa', name: 'California Valley' }
  ];

  const dynamicFarms = Object.values(botStatus || {}).map(farmData => ({
    id: farmData.farm_id || farmData.device_id,
    name: farmData.farm_name || (farmData.city ? `${farmData.city} Hub` : `Bot #${farmData.device_id || farmData.farm_id}`)
  })).filter(f => f.id); 

  const farms = dynamicFarms.length > 0 ? dynamicFarms : defaultFarms;

  useEffect(() => {
    if (farms.length > 0 && !activeFarmId) {
      setActiveFarmId(farms[0].id);
    }
  }, [farms, activeFarmId, setActiveFarmId]);

  // --- LIVE TELEMETRY STREAM LISTENER ---
  useEffect(() => {
    if (!activeFarmId) return;
    const eventSource = new EventSource(`http://localhost:5050/api/telemetry/stream?farm_id=${activeFarmId}`);

    eventSource.onmessage = (event) => {
      if (isBotMoving) return; 
      try {
        const rawData = JSON.parse(event.data);
        const logMsg = `[TELEMETRY] Mode: ${rawData.mode || 'N/A'} | Battery: ${rawData.battery_voltage || 0}V | Current: ${rawData.current || 0}A | RPM: ${rawData.motor_rpm || 0} | Faults: ${rawData.fault_code || 'None'}`;
        
        setNotifications(prev => [{
          id: Date.now(),
          type: rawData.fault_code && rawData.fault_code !== 'None' ? 'error' : 'telemetry',
          message: logMsg
        }, ...prev].slice(0, 25));
      } catch (err) {
        console.error("Error parsing telemetry packet:", err);
      }
    };

    return () => eventSource.close();
  }, [activeFarmId, isBotMoving, setNotifications]);

  // --- TWO-WAY COMMAND SENDER ---
  const sendCommand = async (commandType, value = null) => {
    if (commandType === 'SET_MODE') setControlMode(value);
    
    setLastTxCommand(`${commandType}${value !== null ? `:${value}` : ''}`);
    triggerTxFlash();

    if (commandType === 'CMD_START_CYCLE') {
      executeHardwareLoop(true);
      return;
    }
    if (commandType === 'CMD_DOCK') {
      executeHardwareLoop(false);
      return;
    }

    const payload = {
      farm_id: activeFarmId,
      command: commandType,
      value: value,
      timestamp: new Date().toISOString()
    };

    try {
      await fetch('http://localhost:5050/api/commands/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setNotifications(prev => [{
        id: Date.now(),
        type: 'info',
        message: `[TX_CMD] Transmitted ${commandType} ${value !== null ? `(${value})` : ''} to Hub ${activeFarmId}`,
      }, ...prev].slice(0, 25));
    } catch (err) {
      setNotifications(prev => [{
        id: Date.now(),
        type: 'error',
        message: `❌ [TX_FAIL] Could not relay ${commandType} to backend.`,
      }, ...prev].slice(0, 25));
    }
  };

  // --- CORE TELEMETRY STEP ENGINE ---
  const executeHardwareLoop = (start) => {
    if (start) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      setIsBotMoving(true);

      setNotifications(prev => [{
        id: Date.now(),
        type: 'info',
        message: `⚡ [VIRTUAL_HW] Local Brush Motor Enabled. Initiating automated row sweep...`
      }, ...prev].slice(0, 25));

      simIntervalRef.current = setInterval(() => {
        setRxPulse(true);
        setTimeout(() => setRxPulse(false), 300);

        let currentPos = botPositionRef.current;
        let currentDir = movingDirectionRef.current;
        let nextPos = currentPos + (4 * currentDir); 

        if (nextPos >= 100) {
          movingDirectionRef.current = -1; 
          nextPos = 100;
        } else if (nextPos <= 0) {
          movingDirectionRef.current = 1; 
          nextPos = 0;
        }

        botPositionRef.current = nextPos;
        setBotPosition(nextPos); 

        virtualBatteryRef.current = Math.max(21.0, (virtualBatteryRef.current - 0.01)).toFixed(2);
        const pseudoCurrent = (3.5 + Math.random() * 1.2).toFixed(2);
        const calculatedRpm = Math.floor(liveRpmRef.current * 32 + (Math.random() * 40 - 20));

        const virtualPacket = {
          farm_id: activeFarmId,
          mode: liveModeRef.current,
          battery_voltage: virtualBatteryRef.current,
          current: pseudoCurrent,
          motor_rpm: calculatedRpm,
          fault_code: 'None'
        };

        setNotifications(prev => [{
          id: Date.now(),
          type: 'telemetry',
          message: `[VIRTUAL_HW_DATA] Track Pos: ${botPositionRef.current}% | Battery: ${virtualPacket.battery_voltage}V | Load: ${virtualPacket.current}A | RPM: ${virtualPacket.motor_rpm} | Mode: ${virtualPacket.mode}`
        }, ...prev].slice(0, 25));

        fetch('http://localhost:5050/api/telemetry/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(virtualPacket)
        }).catch(() => {});

      }, 800);

    } else {
      if (!botPositionRef.current && !simIntervalRef.current) {
        return;
      }

      setIsBotMoving(false);
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
        simIntervalRef.current = null; // Clean the reference completely
      }
      
      setNotifications(prev => [{
        id: Date.now(),
        type: 'info',
        message: `🛑 [VIRTUAL_HW] Emergency Halt received. Moving back to home base...`
      }, ...prev].slice(0, 25));

      // Reset tracking references back to home baseline
      botPositionRef.current = 0;
      movingDirectionRef.current = 1;
      setBotPosition(0);
    }
  };

  const triggerTxFlash = () => {
    setTxPulse(true);
    setTimeout(() => setTxPulse(false), 500);
  };

  // --- DIRECTION CONTROL ---
  // Steers the demo bot along the track. Updates the live movement ref so a
  // running sweep changes heading instantly; also relays the command.
  const setBotDirection = (dir) => {
    setDirection(dir);
    movingDirectionRef.current = dir === 'FWD' ? 1 : -1;
    sendCommand('CMD_SET_DIR', dir);
  };

  useEffect(() => {
    return () => { if (simIntervalRef.current) clearInterval(simIntervalRef.current); };
  }, []);

  // --- FAULT INJECTOR WITH AUTO-DOCK CRITERIA ---
  const triggerBackendFault = async (farmId, faultNumber) => {
    const faultCode = faultNumber ? `F${faultNumber}` : null;
    const metadata = faultNumber ? FAULT_METADATA[faultNumber] : null;

    if (faultCode) {
      setLastTxCommand(`INJECT_${faultCode}`);
      triggerTxFlash();

      // --- CRITICAL SAFETY SLIDING WINDOW CHECK ---
      const now = Date.now();
      faultTimestampsRef.current.push(now);

      // Filter array to keep only faults that happened inside our lookback window
      const cutoffTime = now - (toleranceTime * 1000);
      faultTimestampsRef.current = faultTimestampsRef.current.filter(ts => ts >= cutoffTime);

      // Trigger auto-docking sequence if metrics breach safety boundaries
      if (faultTimestampsRef.current.length > 3) {
        setNotifications(prev => [{
          id: Date.now(),
          type: 'error',
          message: `🚨 [CRITICAL_SAFETY_BREACH] Detected ${faultTimestampsRef.current.length} faults within ${toleranceTime}s window! Hard safety threshold breached. Overriding systems...`
        }, ...prev].slice(0, 25));

        // Wipe timestamps list and trip execution safety loop to force docking layout state
        faultTimestampsRef.current = [];
        executeHardwareLoop(false);
        return;
      }
    } else {
      // Clear out timestamps baseline if reset sensors hit manually
      faultTimestampsRef.current = [];
    }

    try {
      await fetch('http://localhost:5050/api/fakedataRoutes/trigger-fault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farm_id: farmId, faultCode: faultCode })
      });
      setNotifications(prev => [{
        id: Date.now(),
        type: faultCode ? 'error' : 'success',
        message: faultCode ? `[INJECTED] ${metadata.name}: ${metadata.desc}` : `[CLEARED] All manual faults cleared for ${farmId}`,
      }, ...prev].slice(0, 25));
    } catch (err) {
      setNotifications(prev => [{
        id: Date.now(),
        type: 'error',
        message: `❌ API Error: Ensure Node.js server is running on port 5050.`,
      }, ...prev].slice(0, 25));
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 font-sans bg-slate-50 min-h-screen p-4 relative">
      
      {/* 1. MISSION CONTROL HEADER */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="bg-slate-900 p-4 rounded-2xl text-emerald-400 shadow-xl shadow-slate-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">Mission Control</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Fleet Overrides</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* INTERACTIVE TOLERANCE WINDOW INPUT FIELD */}
          <div className="bg-slate-100 px-4 py-2 rounded-2xl border border-slate-200 flex items-center gap-2 shadow-inner">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Tolerance Window:</span>
            <input 
              type="number"
              min="2"
              max="120"
              value={toleranceTime}
              onChange={(e) => setToleranceTime(Number(e.target.value))}
              className="w-16 bg-white border border-slate-300 rounded-xl px-2 py-1 text-center font-black text-slate-800 text-xs outline-none focus:border-indigo-500"
            />
            <span className="text-[10px] font-bold text-slate-400 uppercase">Secs</span>
          </div>

          <button
            onClick={() => setIsSandboxOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-5 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95 uppercase tracking-wider"
          >
            <span>🤖</span> Launch Hardware Sandbox
          </button>
          
          <select 
            value={activeFarmId} 
            onChange={(e) => setActiveFarmId(e.target.value)}
            className="bg-slate-50 border-none rounded-2xl px-6 py-3 font-black text-slate-700 outline-none cursor-pointer min-w-[240px] shadow-inner text-xs uppercase tracking-wider"
          >
            {farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
          </select>
        </div>
      </div>

      {/* 2. MAIN LAYOUT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        
        {/* CONTROLS OVERRIDES */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm flex flex-col justify-between min-h-[35vh]">
          <div className="mb-6">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Two-Way Telemetry</span>
            <h3 className="text-xl font-black text-slate-800 mt-1 italic">Active Command Link</h3>
          </div>
          
          <div className="space-y-6">
            {/* --- ROBOT POWER (drives the demo telemetry loop) --- */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Robot Power</span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${isBotMoving ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {isBotMoving ? '● ON' : '○ OFF'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => sendCommand('CMD_START_CYCLE')}
                  disabled={isBotMoving}
                  className={`py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 ${
                    isBotMoving
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  ⏻ Power On
                </button>
                <button
                  onClick={() => sendCommand('CMD_DOCK')}
                  disabled={!isBotMoving}
                  className={`py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 ${
                    !isBotMoving
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  ⏻ Power Off
                </button>
              </div>
            </div>

            {/* --- DIRECTION --- */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Direction</span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${direction === 'FWD' ? 'text-sky-500' : 'text-amber-500'}`}>
                  {direction === 'FWD' ? 'Forward →' : '← Reverse'}
                </span>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setBotDirection('REV')}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${direction === 'REV' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}
                >
                  ◀ Reverse
                </button>
                <button
                  onClick={() => setBotDirection('FWD')}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${direction === 'FWD' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-400'}`}
                >
                  Forward ▶
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Operation Mode</span>
                <span className={`text-[10px] font-black uppercase tracking-widest ${controlMode === 'AUTO' ? 'text-emerald-500' : 'text-amber-500'}`}>{controlMode}</span>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => sendCommand('SET_MODE', 'AUTO')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${controlMode === 'AUTO' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>AUTO</button>
                <button onClick={() => sendCommand('SET_MODE', 'MANUAL')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${controlMode === 'MANUAL' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}>MANUAL</button>
              </div>
            </div>

            <div className={`transition-opacity ${controlMode === 'AUTO' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Motor Override</span>
                <span className="text-xs font-black text-slate-800">{targetRpm}%</span>
              </div>
              <input type="range" min="0" max="100" value={targetRpm} onChange={(e) => setTargetRpm(e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900" />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
              <button onClick={() => sendCommand('CMD_START_CYCLE')} className="bg-slate-900 hover:bg-black text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">Start Cycle</button>
              <button onClick={() => sendCommand('CMD_DOCK')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95">Return to Dock</button>
            </div>
          </div>
        </div>

        {/* SCADA STRESS TEST PANEL */}
        <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl flex flex-col justify-between">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">SCADA Lab</span>
              <h3 className="text-xl font-black text-white mt-1 italic">Stress Test</h3>
            </div>
            <button onClick={() => triggerBackendFault(activeFarmId, null)} className="bg-emerald-500 hover:bg-emerald-400 text-white text-[9px] font-black py-2 px-4 rounded-xl uppercase tracking-widest">Reset Sensors</button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {Array.from({length: 12}, (_, i) => i + 1).map(num => (
              <button key={num} onClick={() => triggerBackendFault(activeFarmId, num)} className="bg-slate-800 hover:bg-red-600 border border-slate-700 rounded-2xl flex flex-col items-center justify-center group transition-all p-2 aspect-square" title={FAULT_METADATA[num].desc}>
                <span className="text-slate-500 group-hover:text-white text-[11px] font-black italic">F{num}</span>
                <span className="text-white text-[8px] font-black text-center leading-tight group-hover:hidden uppercase opacity-70 mt-1">{FAULT_METADATA[num].name.split(' ')[0]}</span>
                <span className="hidden group-hover:block text-white text-[9px] font-black animate-pulse">INJECT</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* 3. FULL WIDTH SYSTEM CONSOLE */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 flex flex-col h-[45vh] shadow-sm mt-2">
        <div className="mb-4 flex-shrink-0 flex justify-between items-center">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Console Output</span>
            <h3 className="text-xl font-black text-slate-800 mt-1 italic">Live Stream</h3>
          </div>
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
              <span className="text-4xl mb-2">📡</span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 text-center">
                Awaiting Telemetry...
              </p>
            </div>
          ) : (
            notifications.map((notif, idx) => (
              <div key={notif.id || idx} className={`p-4 rounded-2xl text-[10px] font-bold border transition-all ${
                notif.type === 'error' ? 'bg-red-50 border-red-100 text-red-700 shadow-sm' : 
                notif.type === 'info' ? 'bg-sky-50 border-sky-100 text-sky-700 font-black' : 
                'bg-slate-950 border-slate-800 text-emerald-400 font-mono tracking-tight'
              }`}>
                <div className="flex justify-between mb-1 opacity-60">
                  <span className="uppercase tracking-widest text-[9px]">{notif.type === 'info' ? 'System Override' : notif.type === 'error' ? 'Fault Alert' : 'Packet Trace'}</span>
                  <span>{new Date(notif.id || Date.now()).toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="leading-relaxed text-xs">{notif.message}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- FLOATING COMPLEMENTARY WIDGET --- */}
      {isSandboxOpen && (
        <div className="fixed right-6 bottom-6 z-50 p-1 animate-in slide-in-from-bottom-6 pointer-events-none">
          <div className="bg-white border-4 border-slate-900 p-6 rounded-[2.5rem] w-[420px] shadow-2xl relative pointer-events-auto">
            
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Hardware Sandbox</span>
                <h3 className="text-lg font-black text-slate-800 italic">Two-Way Telemetry Rig</h3>
              </div>
              <button 
                onClick={() => { executeHardwareLoop(false); setIsSandboxOpen(false); }}
                className="bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 h-8 w-8 rounded-full flex items-center justify-center font-black text-sm transition-all"
              >
                ✕
              </button>
            </div>

            {/* TWO-WAY DATA INDICATORS */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4 items-center text-center">
              <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
                <span className="text-sm">💻</span>
                <p className="text-[8px] font-black text-slate-700 uppercase">Dashboard</p>
              </div>

              <div className="flex flex-col gap-1 justify-center items-center h-full">
                <div className="w-full flex items-center justify-between text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 relative overflow-hidden">
                  <span className={`${txPulse ? 'text-indigo-600 animate-bounce' : ''}`}>TX ➔</span>
                  <span className="text-[7px] truncate max-w-[50px]">{lastTxCommand}</span>
                </div>
                <div className={`w-full flex items-center justify-between text-[8px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${rxPulse ? 'bg-emerald-500 text-white animate-pulse' : isBotMoving ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-200 text-slate-400'}`}>
                  <span>RX </span>
                  <span className="text-[7px]">{isBotMoving ? 'LIVE' : 'IDLE'}</span>
                </div>
              </div>

              <div className={`p-2 rounded-lg border ${isBotMoving ? 'bg-slate-900 text-white' : 'bg-white'}`}>
                <span>🤖</span>
                <p className="text-[8px] font-black uppercase text-slate-700">Bot Node</p>
              </div>
            </div>

            {/* MINI VISUAL PANEL TRACK */}
            <div className="mb-4 bg-slate-950 rounded-2xl p-4 relative overflow-hidden h-28 flex flex-col justify-between shadow-inner border border-slate-800">
              <div className="absolute inset-x-2 top-8 bottom-8 grid grid-cols-4 gap-1 opacity-25">
                <div className="bg-sky-600 rounded"></div>
                <div className="bg-sky-600 rounded"></div>
                <div className="bg-sky-600 rounded"></div>
                <div className="bg-sky-600 rounded"></div>
              </div>

              <div 
                className="absolute top-5 bottom-5 w-8 bg-gradient-to-b from-amber-400 to-amber-500 rounded-lg shadow-xl flex items-center justify-center border border-white transition-all duration-700 ease-out"
                style={{ left: `calc(${botPosition}% - ${botPosition * 0.32}px + 0.5rem)` }}
              >
                <div className={`w-1 h-6 bg-slate-900 rounded-full ${isBotMoving ? 'animate-spin' : ''}`}></div>
              </div>

              <div className="z-10 flex justify-between items-center">
                <span className="text-[8px] font-mono text-slate-500 font-bold">TRACK A1</span>
                <span className={`text-[7px] font-mono font-black px-1.5 py-0.5 rounded ${isBotMoving ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
                  {isBotMoving ? 'STREAM_ON' : 'STBY'}
                </span>
              </div>

              <div className="z-10 flex justify-between items-end text-left">
                <div>
                  <p className="text-[8px] font-mono text-slate-500">Vector</p>
                  <p className="text-xs font-mono font-black text-white">{botPosition}%</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-mono text-slate-500">Motor</p>
                  <p className="text-xs font-mono font-black text-amber-400">{isBotMoving ? `${targetRpm}%` : '0%'}</p>
                </div>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex gap-3">
              <button 
                onClick={() => executeHardwareLoop(true)}
                disabled={isBotMoving}
                className={`flex-1 font-black text-[10px] uppercase tracking-wider py-3 rounded-xl transition-all shadow-md ${isBotMoving ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
              >
                Go (Simulate Bot)
              </button>
              <button 
                onClick={() => executeHardwareLoop(false)}
                disabled={!isBotMoving}
                className={`flex-1 font-black text-[10px] uppercase tracking-wider py-3 rounded-xl transition-all shadow-md ${!isBotMoving ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`}
              >
                Stop
              </button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
};

export default FarmControls;