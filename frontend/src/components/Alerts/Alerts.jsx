import React, { useState } from 'react';

const PROTECTION_SENSORS = [
  { id: 'rain', label: 'Rain Sensor', key: 'dbg_rain', threshold: 50, type: 'weather', unit: 'mm' },
  { id: 'position', label: 'Position Alignment', key: 'panel_location', type: 'mech' },
  { id: 'overheat', label: 'Overheat Protection', key: 'temperature', threshold: 65, type: 'safe', unit: '°C' },
  { id: 'overcurrent', label: 'Over-Current Protection', key: 'running_current', threshold: 15, type: 'safe', unit: 'A' },
  { id: 'discharge', label: 'Deep Discharge Protection', key: 'battery_percentage', threshold: 20, isLow: true, type: 'safe', unit: '%' }
];

export default function Alerts({ botStatus }) {
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, TRIGGERED, SAFE
  const [searchQuery, setSearchQuery] = useState('');

  const farmIds = Object.keys(botStatus || {});
  const offlineCount = farmIds.filter(id => botStatus[id]?.status === 'OFFLINE').length;
  const onlineCount = farmIds.length - offlineCount;

  // Extract all active alert statistics
  let totalSensorsTriggered = 0;
  let criticalFaultsCount = 0;
  let healthyHubsCount = 0;
  const allActiveFaults = [];

  const analyzedFarms = farmIds.map(id => {
    const farm = botStatus[id];
    const isOffline = farm.status === 'OFFLINE';
    let triggeredCount = 0;
    
    const sensors = isOffline ? [] : PROTECTION_SENSORS.map(sensor => {
      let isFault = false;
      const val = farm[sensor.key] !== undefined ? farm[sensor.key] : 0;

      if (sensor.id === 'overheat') isFault = val > sensor.threshold;
      if (sensor.id === 'overcurrent') isFault = val > sensor.threshold;
      if (sensor.id === 'discharge') isFault = val < sensor.threshold;
      if (sensor.id === 'rain') isFault = val > sensor.threshold;
      if (sensor.id === 'position' && farm.error_code === 12) isFault = true;

      if (isFault) {
        triggeredCount++;
        totalSensorsTriggered++;
      }

      return { ...sensor, value: val, isFault };
    });

    const hasErrorCode = farm.error_code && farm.error_code !== 0;
    const hasFaultStatus = farm.status === 'FAULT';
    const isCritical = !isOffline && (hasErrorCode || triggeredCount >= 2);

    if (isCritical) {
      criticalFaultsCount++;
    }
    if (!isOffline && triggeredCount === 0 && !hasErrorCode && !hasFaultStatus) {
      healthyHubsCount++;
    }

    // Collect all detailed faults from the simulator's detailed array
    if (farm.faults && Array.isArray(farm.faults)) {
      farm.faults.forEach(f => {
        allActiveFaults.push({
          id: `${id}-${f.code}-${f.timestamp}`,
          hubName: farm.farm_name || `${farm.city} Hub`,
          city: farm.city,
          code: f.code,
          name: f.name || f.message || "Unknown Fault",
          severity: f.severity || "MEDIUM",
          timestamp: f.timestamp || new Date().toISOString()
        });
      });
    } else if (hasErrorCode && !isOffline) {
      // Fallback for flat packets with error code but no faults list
      allActiveFaults.push({
        id: `${id}-err-${farm.error_code}`,
        hubName: farm.farm_name || `${farm.city} Hub`,
        city: farm.city,
        code: `F${farm.error_code}`,
        name: `System Fault Code ${farm.error_code}`,
        severity: farm.error_code === 12 ? 'HIGH' : 'CRITICAL',
        timestamp: new Date().toISOString()
      });
    }

    return {
      id,
      ...farm,
      sensors,
      triggeredCount,
      isCritical,
      hasErrorCode,
      isOffline
    };
  });

  // Filter logic
  const filteredFarms = analyzedFarms.filter(farm => {
    const matchesSearch = farm.farm_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          farm.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          farm.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (filterStatus === 'TRIGGERED') return farm.triggeredCount > 0 || farm.hasErrorCode;
    if (filterStatus === 'SAFE') return farm.triggeredCount === 0 && !farm.hasErrorCode;
    return true;
  });



  return (
    <div className="p-6 md:p-8 space-y-8 pb-20 bg-slate-50 min-h-screen font-sans overflow-y-auto">
      {/* 1. Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight italic flex items-center gap-3">
             <span className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></span> Alert Center
          </h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Detailed Diagnostic Safety Log</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button 
            onClick={() => setFilterStatus('ALL')}
            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${filterStatus === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            ALL HUBS
          </button>
          <button 
            onClick={() => setFilterStatus('TRIGGERED')}
            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${filterStatus === 'TRIGGERED' ? 'bg-red-500 text-white shadow-md shadow-red-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            ACTIVE FAULTS
          </button>
          <button 
            onClick={() => setFilterStatus('SAFE')}
            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${filterStatus === 'SAFE' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            NOMINAL
          </button>
        </div>
      </header>

      {/* 2. Top-Level Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Warnings</span>
          </div>
          <div>
            <span className="text-4xl font-black text-slate-800 tracking-tight">{totalSensorsTriggered}</span>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Sensors Out of Bounds</p>
          </div>
        </div>

        <div className="bg-red-600/90 text-white rounded-3xl p-6 shadow-lg shadow-red-100 flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-red-200 uppercase tracking-widest">Critical Faults</span>
          </div>
          <div>
            <span className="text-4xl font-black tracking-tight">{criticalFaultsCount}</span>
            <p className="text-[10px] font-bold text-red-100 uppercase tracking-wider mt-1">Hubs Requiring Attention</p>
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nominal Sites</span>
            <span className="text-xl text-emerald-400 animate-pulse">●</span>
          </div>
          <div>
            <span className="text-4xl font-black tracking-tight">{healthyHubsCount} / {onlineCount}</span>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Operating Normal (Online)</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between h-36">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Offline Assets</span>
            <span className="text-xl">🔌</span>
          </div>
          <div>
            <span className="text-4xl font-black text-slate-800 tracking-tight">{offlineCount} / {farmIds.length}</span>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Connection Lost</p>
          </div>
        </div>
      </div>

      {/* 3. Main Split Panel: Diagnostic Grid & Live Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left/Middle Column: Individual Hub diagnostics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <input 
              type="text" 
              placeholder="Search hubs by name or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm outline-none w-full shadow-sm placeholder:text-slate-400 font-bold"
            />
          </div>

          {filteredFarms.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-3xl bg-white text-slate-400">
              <p className="font-bold text-xs uppercase tracking-widest">No matching assets found</p>
            </div>
          ) : (
            filteredFarms.map(farm => (
              <div key={farm.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white">
                  <div>
                    <h3 className="font-black text-sm uppercase tracking-wider">{farm.farm_name}</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{farm.city} Hub (ID: {farm.id})</p>
                  </div>
                  <span className={`text-[10px] font-black px-3.5 py-1.5 rounded-full ${
                    farm.isOffline ? 'bg-slate-500/20 text-slate-400' :
                    (farm.triggeredCount === 0 && !farm.hasErrorCode) ? 'bg-emerald-500/20 text-emerald-400' : 
                    'bg-red-500/20 text-red-400 animate-pulse'
                  }`}>
                    {farm.isOffline ? 'OFFLINE' :
                     (farm.triggeredCount === 0 && !farm.hasErrorCode) ? 'ALL NOMINAL' : 
                     `ATTENTION: ${farm.triggeredCount + (farm.hasErrorCode ? 1 : 0)} ALERT(S)`}
                  </span>
                </div>

                <div className="p-6">
                  {farm.isOffline ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 font-bold text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-3">
                      <span className="text-2xl">🔌</span>
                      <span>Telemetry Connection Lost (Device Offline)</span>
                      <span className="text-[10px] font-normal text-slate-400 normal-case">No packet received in the last 30 seconds. Check power status or GSM cellular link.</span>
                    </div>
                  ) : (
                    <>
                      {/* Active Fault List Banner */}
                      {farm.faults && farm.faults.length > 0 && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl space-y-2">
                          <p className="text-[9px] font-black text-red-700 uppercase tracking-widest">Active Fault Detections ({farm.faults.length})</p>
                          {farm.faults.map((f, i) => (
                            <div key={i} className="flex justify-between items-center text-xs font-bold text-red-800">
                              <span>🔴 {f.name || f.message} ({f.code})</span>
                              <span className="text-[9px] px-2 py-0.5 bg-red-100 rounded text-red-700 uppercase font-black">{f.severity}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Grid of Safety Sensors */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {farm.sensors.map(sensor => {
                          const displayVal = sensor.value !== undefined ? sensor.value : '-';
                          const unitStr = sensor.unit ? ` ${sensor.unit}` : '';
                          return (
                            <div 
                              key={sensor.id} 
                              className={`p-4 rounded-2xl border transition-all ${
                                sensor.isFault 
                                  ? 'bg-red-50 border-red-200 text-red-900 shadow-inner' 
                                  : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                              }`}
                            >
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 leading-tight">{sensor.label}</p>
                              <div className="flex justify-between items-center">
                                <span className={`text-xs font-black ${sensor.isFault ? 'text-red-600' : 'text-slate-800'}`}>
                                  {sensor.isFault ? 'TRIGGERED' : 'SAFE'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400">
                                  {displayVal}{unitStr}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mt-3">
                                <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Status</div>
                                <div className={`h-2.5 w-2.5 rounded-full ${sensor.isFault ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Column: Live Event Timeline */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col h-[75vh]">
          <div className="mb-6 flex-shrink-0">
            <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
              Live SCADA Diagnostic Feed
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Chronological system events</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
            {allActiveFaults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center p-6">
                <span className="text-4xl mb-3">🛡️</span>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Fleet status secure. No active alarms.
                </p>
              </div>
            ) : (
              allActiveFaults.map(fault => (
                <div 
                  key={fault.id}
                  className={`p-4 rounded-2xl text-[10px] font-bold border transition-all animate-in slide-in-from-right-3 ${
                    fault.severity === 'CRITICAL' 
                      ? 'bg-red-50 border-red-200 text-red-800' 
                      : fault.severity === 'HIGH'
                        ? 'bg-amber-50 border-amber-200 text-amber-800' 
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                  }`}
                >
                  <div className="flex justify-between mb-1.5 opacity-60">
                    <span className="uppercase tracking-widest font-black">{fault.hubName}</span>
                    <span>{new Date(fault.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded text-white ${
                      fault.severity === 'CRITICAL' ? 'bg-red-500' : fault.severity === 'HIGH' ? 'bg-amber-500' : 'bg-blue-500'
                    }`}>
                      {fault.severity}
                    </span>
                    <span className="font-black text-slate-700 text-xs">Code: {fault.code}</span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed mt-1 text-slate-800">{fault.name}</p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}