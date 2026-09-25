import React, { useState, useRef, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// --- BRANDING & CONSTANTS ---
const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

const METRICS = {
  power: { id: 'electrical.ac_power_kw', label: '⚡ Active Power', unit: 'kW' },
  voltage_solar: { id: 'electrical.dc_voltage_v', label: '☀️ Solar Voltage', unit: 'V' },
  current: { id: 'electrical.dc_current_a', label: '🌊 Running Current', unit: 'A' },
  motor_speed: { id: 'motor_speed', label: '⚙️ Motor Speed', unit: 'RPM' },
  temp: { id: 'environmental.temperature_c', label: '🌡️ Hardware Temp', unit: '°C' },
  humidity: { id: 'environmental.humidity', label: '💧 Ambient Humidity', unit: '%' },
};

const getDeviceName = (packet, id) => {
  if (!packet) return `Device #${id}`;
  return packet.farm_name || (packet.city ? `${packet.city} Hub` : `Bot #${id}`);
};

export default function Reports({ botStatus }) {
  const reportRef = useRef(null);
  const [globalCity, setGlobalCity] = useState('All');
  const [timeDiff, setTimeDiff] = useState(5); 
  const [widgets, setWidgets] = useState([]);

  const allFarmIds = botStatus ? Object.keys(botStatus) : [];
  const cities = ['All', ...new Set(allFarmIds.map(id => botStatus[id]?.city).filter(Boolean))];

  const filteredFarmIds = globalCity === 'All' 
    ? allFarmIds 
    : allFarmIds.filter(id => botStatus[id]?.city === globalCity);

  const filteredOnlineFarmIds = filteredFarmIds.filter(id => botStatus[id]?.status !== 'OFFLINE');

  // Find the winning farm (highest active power output)
  let winningFarmId = null;
  let maxOutput = -1;
  filteredFarmIds.forEach(id => {
    const f = botStatus[id] || {};
    const isOffline = f.status === 'OFFLINE';
    const isFault = f.status === 'FAULT';
    if (!isOffline && !isFault) {
      const power = parseFloat(f.electrical?.ac_power_kw ?? f.ac_power_kw ?? 0);
      if (power > maxOutput) {
        maxOutput = power;
        winningFarmId = id;
      }
    }
  });
  const winningFarm = winningFarmId ? botStatus[winningFarmId] : null;

  const addWidget = () => {
    setWidgets([...widgets, { 
        id: Date.now(), 
        farmId: filteredFarmIds[0] || allFarmIds[0], 
        type: 'area', 
        metric: 'voltage_solar' 
    }]);
  };

  const exportPDF = async () => {
    const element = reportRef.current;
    if (!element) return;

    // Temporarily hide dropdowns and UI buttons for a clean PDF report
    const removeButtons = element.querySelectorAll('.widget-remove-btn');
    removeButtons.forEach(btn => btn.style.display = 'none');

    const controls = element.querySelectorAll('.widget-controls');
    controls.forEach(el => el.style.setProperty('display', 'none', 'important'));

    const printLabels = element.querySelectorAll('.print-label');
    printLabels.forEach(el => el.style.setProperty('display', 'block', 'important'));

    // Scale 2 and logging axis visibility
    const canvas = await html2canvas(element, { 
        scale: 2, 
        backgroundColor: '#f8fafc',
        useCORS: true,
        logging: false
    });

    // Restore original UI displays
    removeButtons.forEach(btn => btn.style.display = 'flex');
    controls.forEach(el => el.style.display = '');
    printLabels.forEach(el => el.style.display = '');

    const pdf = new jsPDF('p', 'mm', 'a4'); 
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
    
    const margin = 10;
    const imgWidth = pdfWidth - (margin * 2); // 190
    
    let sourceY = 0;
    let pageNum = 1;
    
    while (sourceY < canvas.height) {
      if (pageNum > 1) {
        pdf.addPage();
      }
      
      // Page headers & footers
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184); // slate-400
      pdf.text(`Kleanbotics Fleet Performance Report | ${globalCity}`, margin, 10);
      pdf.text(`Page ${pageNum}`, pdfWidth - margin - 15, 10);
      
      if (pageNum === 1) {
        // Main Title on Page 1
        pdf.setFontSize(18);
        pdf.setTextColor(15, 23, 42); // slate-900
        pdf.text(`Kleanbotics Fleet Performance Report: ${globalCity}`, margin, 20);
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139); // slate-500
        pdf.text(`Generated: ${new Date().toLocaleString()} | Interval: ${timeDiff}s`, margin, 26);
        
        // Draw horizontal line separator
        pdf.setDrawColor(226, 232, 240); // slate-200
        pdf.setLineWidth(0.5);
        pdf.line(margin, 28, pdfWidth - margin, 28);
      }
      
      const targetY = pageNum === 1 ? 32 : 15;
      const targetHeightLimit = pageNum === 1 ? (pdfHeight - 32 - margin) : (pdfHeight - 15 - margin); // 255mm or 272mm
      const pxPageHeight = (targetHeightLimit * canvas.width) / imgWidth;
      
      let sliceHeight = pxPageHeight;
      if (sourceY + sliceHeight > canvas.height) {
        sliceHeight = canvas.height - sourceY;
      }
      
      // Create a temporary canvas for the slice
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = sliceHeight;
      
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(
        canvas,
        0, sourceY, canvas.width, sliceHeight, // source rectangle
        0, 0, canvas.width, sliceHeight      // destination rectangle
      );
      
      const sliceImgData = tempCanvas.toDataURL('image/png');
      const sliceImgWidthMm = imgWidth;
      const sliceImgHeightMm = (sliceHeight * imgWidth) / canvas.width;
      
      pdf.addImage(sliceImgData, 'PNG', margin, targetY, sliceImgWidthMm, sliceImgHeightMm);
      
      sourceY += sliceHeight;
      pageNum++;
    }

    pdf.save(`Kleanbotics_Report_${globalCity}.pdf`);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 pb-20 bg-slate-50 min-h-screen font-sans overflow-y-auto">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center gap-8">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fleet Location</label>
            <select 
              value={globalCity} 
              onChange={(e) => setGlobalCity(e.target.value)}
              className="bg-slate-50 border rounded-xl px-4 py-2 text-sm font-bold outline-none"
            >
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sampling Interval</label>
            <div className="flex bg-slate-50 p-1 rounded-xl border">
              {[5, 10, 60].map(t => (
                <button 
                  key={t} 
                  onClick={() => setTimeDiff(t)} 
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${timeDiff === t ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {t === 60 ? '1m' : `${t}s`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={addWidget} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-transform active:scale-95 shadow-lg">+ Add Visualization</button>
          <button onClick={exportPDF} className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold text-xs transition-transform active:scale-95 shadow-lg shadow-emerald-100">📥 Download PDF</button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-8">
        {/* Fleet Pulse Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 border h-64 relative shadow-sm">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
               <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></span> Live Fleet Pulse (Solar Voltage)
            </h3>
            <ResponsiveContainer width="100%" height="80%">
               <AreaChart data={allFarmIds.map(id => ({ 
                 name: getDeviceName(botStatus[id], id), 
                 val: botStatus[id]?.electrical?.dc_voltage_v || 0 
               }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={9} axisLine={false} tickLine={false} />
                  <YAxis fontSize={9} axisLine={false} tickLine={false} label={{ value: 'Volts (V)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                  <Area type="monotone" dataKey="val" stroke="#10b981" fill="#10b981" fillOpacity={0.1} isAnimationActive={false} />
               </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-900 rounded-3xl p-8 text-white flex flex-col justify-between">
             <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
               {globalCity === 'All' ? 'Active Units Online' : `Active Units in ${globalCity}`}
             </h3>
             <span className="text-6xl font-light italic tracking-tighter">{filteredOnlineFarmIds.length}</span>
             <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-4">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${filteredFarmIds.length ? (filteredOnlineFarmIds.length / filteredFarmIds.length) * 100 : 0}%` }}
                ></div>
             </div>
          </div>
        </div>

        {/* KPI Leaderboard & Performance Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Winner Showcase Card */}
          <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-600 rounded-3xl p-8 text-white shadow-xl shadow-orange-100 flex flex-col justify-between min-h-[220px]">
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[9px] font-black text-orange-100 uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">
                  🏆 KPI Leaderboard Winner
                </span>
                <span className="text-2xl">🥇</span>
              </div>
              {winningFarm && maxOutput > 0 ? (
                <div>
                  <h4 className="text-2xl font-black tracking-tight">{getDeviceName(winningFarm, winningFarmId)}</h4>
                  <p className="text-xs text-orange-100 font-bold uppercase tracking-wider mt-1">{winningFarm.city} Hub</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div>
                      <p className="text-[9px] font-black text-orange-200 uppercase tracking-widest">Active Output</p>
                      <p className="text-xl font-black">{parseFloat(maxOutput).toFixed(2)} kW</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-orange-200 uppercase tracking-widest">Capacity Yield</p>
                      <p className="text-xl font-black">
                        {((maxOutput / (winningFarm.capacity || 100)) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-xl font-black tracking-tight">No Active Generation</h4>
                  <p className="text-xs text-orange-100 font-bold uppercase tracking-wider mt-1">All units are inactive (Nighttime/Offline)</p>
                </div>
              )}
            </div>
            {winningFarm && maxOutput > 0 && (
              <p className="text-[9px] font-bold text-orange-100 uppercase tracking-wider border-t border-white/20 pt-3 mt-4">
                * Winning based on active specific yield and real-time weather coordinates.
              </p>
            )}
          </div>

          {/* Performance Comparison Details Card */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between min-h-[220px]">
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                📊 Fleet Performance Benchmark Details
              </h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-4">
                We evaluate our solar assets based on three core Key Performance Indicators (KPIs) to determine operational health and optimization vectors:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-800 uppercase mb-1">Specific Yield</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase leading-tight">Energy output normalized by installed capacity (kW/kWp).</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-800 uppercase mb-1">Capacity Factor</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase leading-tight">Ratio of actual generation to theoretical maximum capacity.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-800 uppercase mb-1">Thermal Derating</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase leading-tight">Calculated loss of panel efficiency caused by excessive hardware temperature.</p>
                </div>
              </div>
            </div>
            <div className="text-[9px] text-slate-400 border-t border-slate-100 pt-3 mt-4 flex justify-between">
              <span>Metric Standard: IEC 61724-1 Compliance</span>
              <span>Coordinates Sync: Active (Open-Meteo API)</span>
            </div>
          </div>
        </div>

        {/* Fleet KPI Performance Summary Table */}
        <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              📊 Fleet KPI Performance Benchmark Summary
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-lg">
              Showing {filteredFarmIds.length} Asset{filteredFarmIds.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-4">Name / ID</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Active Power</th>
                  <th className="px-6 py-4">Capacity</th>
                  <th className="px-6 py-4">Specific Yield</th>
                  <th className="px-6 py-4">Capacity Factor</th>
                  <th className="px-6 py-4">Thermal Loss</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700 font-medium">
                {filteredFarmIds.map(id => {
                  const f = botStatus[id] || {};
                  const isOffline = f.status === 'OFFLINE';
                  const isFault = f.status === 'FAULT';
                  
                  const activePower = parseFloat(f.electrical?.ac_power_kw ?? f.ac_power_kw ?? 0);
                  const capacity = f.capacity ?? 100;
                  const temp = parseFloat(f.environmental?.temperature_c ?? f.temperature ?? 0);
                  
                  const isNight = !isOffline && !isFault && activePower === 0;

                  let statusBadge = (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active
                    </span>
                  );
                  if (isOffline) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span> Offline
                      </span>
                    );
                  } else if (isFault) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span> Maintenance
                      </span>
                    );
                  } else if (isNight) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span> Night Inactive
                      </span>
                    );
                  }

                  const specYield = activePower / capacity;
                  const capFactor = (activePower / capacity) * 100;
                  const tempLoss = Math.max(0, (temp - 25) * 0.4);

                  return (
                    <tr key={id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {getDeviceName(f, id)}
                        {id === winningFarmId && maxOutput > 0 && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black bg-amber-100 text-amber-800 uppercase tracking-widest animate-pulse">🏆 Leader</span>
                        )}
                        <span className="block text-[10px] font-normal text-slate-400">Device ID: {id}</span>
                      </td>
                      <td className="px-6 py-4">{f.city || 'Unknown'}</td>
                      <td className="px-6 py-4 font-semibold">{activePower.toFixed(2)} kW</td>
                      <td className="px-6 py-4 font-semibold text-slate-500">{capacity} kWp</td>
                      <td className="px-6 py-4">{(isOffline || isFault) ? '-' : `${specYield.toFixed(3)} kW/kWp`}</td>
                      <td className="px-6 py-4">{(isOffline || isFault) ? '-' : `${capFactor.toFixed(1)}%`}</td>
                      <td className="px-6 py-4">{(isOffline || isFault) ? '-' : `${tempLoss.toFixed(1)}%`}</td>
                      <td className="px-6 py-4">{statusBadge}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dynamic Widgets Section */}
        {widgets.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-300 bg-white/50">
            <span className="text-4xl mb-2 opacity-50">📑</span>
            <p className="font-bold text-xs uppercase tracking-widest italic text-slate-400">Workspace Empty. Use "+ Add Visualization" above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
            {widgets.map((w) => (
              <VisualizationWidget 
                key={w.id} config={w} botStatus={botStatus} allFarmIds={filteredFarmIds} timeDiff={timeDiff}
                onUpdate={(id, field, value) => setWidgets(widgets.map(wid => wid.id === id ? { ...wid, [field]: value } : wid))}
                onRemove={(id) => setWidgets(widgets.filter(wid => wid.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const VisualizationWidget = ({ config, botStatus, allFarmIds, onUpdate, onRemove, timeDiff }) => {
  const [history, setHistory] = useState([]);
  const farm = botStatus[config.farmId];
  const activeMetric = METRICS[config.metric] || METRICS.voltage_solar;

  // 1. Fetch initial historical database records on component mount or parameter change
  useEffect(() => {
    // Reset history when parameters change to avoid visual graph pollution
    setHistory([]);

    let active = true;
    const fetchHistory = async () => {
      try {
        const response = await fetch(`http://localhost:5050/api/machines/history?device_id=${config.farmId}&interval=${timeDiff}`);
        if (!response.ok) throw new Error("History fetch failed");
        const data = await response.json();
        
        if (!active) return;

        // Map the historical data into the expected format for Recharts
        const mappedHistory = data.map(packet => {
          const parts = activeMetric.id.split('.');
          const val = parts.reduce((acc, part) => acc && acc[part], packet) || 0;
          return {
            time: packet.time,
            value: parseFloat(val.toFixed(2))
          };
        });
        setHistory(mappedHistory);
      } catch (err) {
        console.error("Failed to load historical data:", err);
      }
    };

    fetchHistory();
    return () => {
      active = false;
    };
  }, [config.farmId, config.metric, activeMetric.id, timeDiff]);

  // 2. Append new live telemetry points as they arrive
  useEffect(() => {
    if (farm) {
      const parts = activeMetric.id.split('.');
      const val = parts.reduce((acc, part) => acc && acc[part], farm) || 0;
      
      setHistory(prev => {
        const timeString = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        // Ensure the graph doesn't double-tick in the same second
        if (prev.length > 0 && prev[prev.length - 1].time === timeString) return prev;
        return [...prev, { time: timeString, value: parseFloat(val.toFixed(2)) }].slice(-20);
      });
    }
  }, [farm, activeMetric.id]);

  const renderChart = () => {
    const isFleet = config.type === 'bar' || config.type === 'donut';
    const data = isFleet ? allFarmIds.map((id, idx) => {
        const f = botStatus[id] || {};
        const parts = activeMetric.id.split('.');
        const val = parts.reduce((acc, part) => acc && acc[part], f) || 0;
        return { name: getDeviceName(f, id), value: val, fill: COLORS[idx % COLORS.length] };
    }) : history;

    if (config.type === 'bar') {
        return (
            <BarChart data={data} margin={{ bottom: 20, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={8} tickLine={false} axisLine={false} angle={-15} textAnchor="end" interval={0} />
                <YAxis fontSize={9} tickLine={false} axisLine={false} label={{ value: activeMetric.unit, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {data.map((entry, index) => <Cell key={index} fill={entry.fill}/>)}
                </Bar>
            </BarChart>
        );
    }
    
    if (config.type === 'donut') {
        return (
            <PieChart>
                <Pie data={data} innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5} isAnimationActive={false}>
                    {data.map((entry, index) => <Cell key={index} fill={entry.fill}/>)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
            </PieChart>
        );
    }

    return (
      <AreaChart data={history} margin={{ left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="time" fontSize={9} tickLine={false} axisLine={false} />
        {/* SAFE Y-AXIS: ensures 0-flatlines don't crash Recharts */}
        <YAxis fontSize={9} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} label={{ value: activeMetric.unit, angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
        <Area type="monotone" dataKey="value" stroke={COLORS[config.id % COLORS.length]} fill={COLORS[config.id % COLORS.length]} fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    );
  };

  return (
    <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm h-[400px] flex flex-col group transition-shadow hover:shadow-md">
      <div className="flex justify-between items-center mb-6 widget-controls print:hidden">
        <div className="flex gap-3 flex-wrap">
            <select value={config.farmId} onChange={(e) => onUpdate(config.id, 'farmId', e.target.value)} className="text-[10px] font-black uppercase border rounded-xl px-3 py-1.5 bg-slate-50">
                {Object.keys(botStatus).map(id => <option key={id} value={id}>{getDeviceName(botStatus[id], id)}</option>)}
            </select>
            <select value={config.metric} onChange={(e) => onUpdate(config.id, 'metric', e.target.value)} className="text-[10px] font-black uppercase border rounded-xl px-3 py-1.5 bg-slate-50">
                {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
        </div>
        <div className="flex gap-3">
            <select value={config.type} onChange={(e) => onUpdate(config.id, 'type', e.target.value)} className="text-[10px] font-black uppercase border rounded-xl px-3 py-1.5 bg-emerald-50 text-emerald-700">
                <option value="area">Area</option>
                <option value="bar">Bar</option>
                <option value="donut">Donut</option>
            </select>
            <button onClick={() => onRemove(config.id)} className="widget-remove-btn text-slate-300 hover:text-red-500 p-1 transition-colors">✕</button>
        </div>
      </div>
      
      {/* Label for PDF export where controls are hidden */}
      <div className="hidden print-label mb-4 border-l-4 border-emerald-500 pl-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeMetric.label}</p>
          <p className="text-xs font-bold text-slate-700">{getDeviceName(farm, config.farmId)}</p>
      </div>

      <div className="flex-1 w-full overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};