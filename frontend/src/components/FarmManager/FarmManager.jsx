import React, { useState, useEffect } from 'react';
import { useConnection } from '../../hooks/useLiveData';

// LIVE/SIM chip + real hardware-connection dot (polls Blynk every 15s).
function LiveBadge({ farm }) {
  const isLive = farm.data_source === 'LIVE' || farm.has_blynk || farm.ts_channel_id;
  const { data } = useConnection(isLive ? farm.farm_id : null);
  if (!isLive) {
    return <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">SIM</span>;
  }
  const online = data?.connected;
  return (
    <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
      LIVE{data ? (online ? ' · Online' : ' · Offline') : ''}
    </span>
  );
}

const FarmManager = ({ onFarmChange }) => {
  const [newFarm, setNewFarm] = useState({
    farm_id: '',
    name: '',
    city: '',
    capacity: '',
    lat: '',
    lng: '',
    ts_channel_id: '',
    ts_read_key: '',
    blynk_token: ''
  });
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoInfo, setGeoInfo] = useState('');

  useEffect(() => {
    loadFarms();
  }, []);

  // City / place name -> coordinates (free, no API key).
  const geocode = async (q) => {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
      const d = await r.json();
      const g = d.results?.[0];
      if (!g) return null;
      return { lat: g.latitude, lng: g.longitude, label: [g.name, g.admin1, g.country].filter(Boolean).join(', ') };
    } catch {
      return null;
    }
  };

  const autoLocate = async () => {
    if (!newFarm.city.trim()) return alert('Enter a city / place first, then auto-locate.');
    setLocating(true);
    setGeoInfo('');
    const g = await geocode(newFarm.city.trim());
    setLocating(false);
    if (!g) return alert(`❌ Couldn't find "${newFarm.city}" on the map. Try a nearby city or enter lat/lng manually.`);
    setNewFarm((prev) => ({ ...prev, lat: g.lat.toFixed(4), lng: g.lng.toFixed(4) }));
    setGeoInfo(`📍 ${g.label}`);
  };

  const loadFarms = async () => {
    try {
      const res = await fetch('http://localhost:5050/api/farms');
      const farmList = await res.json();
      setFarms(farmList);
    } catch (error) {
      console.error('Failed to load farms:', error);
    }
  };

  const addFarm = async () => {
    let { farm_id, name, city, capacity, lat, lng, ts_channel_id, ts_read_key, blynk_token } = newFarm;
    if (!farm_id || !name || !city || !capacity) {
      return alert("❌ Please fill in Farm ID, Name, City and Capacity");
    }

    // Alphanumeric check for ID
    if (!/^[a-z0-9_-]+$/i.test(farm_id)) {
      return alert("❌ Farm ID must be alphanumeric and can only contain underscores or dashes (e.g. delhi_east)");
    }

    // Auto-locate from the city if coordinates weren't provided.
    if (!lat || !lng) {
      const g = await geocode(city.trim());
      if (!g) {
        return alert(`❌ Couldn't place "${city}" on the map. Click "Auto-locate" or enter latitude/longitude manually.`);
      }
      lat = g.lat;
      lng = g.lng;
    }

    setLoading(true);
    try {
      const res = await fetch('http://localhost:5050/api/farms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farm_id,
          name,
          city,
          capacity: Number(capacity),
          lat: Number(lat),
          lng: Number(lng),
          ts_channel_id,
          ts_read_key,
          blynk_token
        })
      });
      const result = await res.json();
      if (result.success) {
        setNewFarm({
          farm_id: '',
          name: '',
          city: '',
          capacity: '',
          lat: '',
          lng: '',
          ts_channel_id: '',
          ts_read_key: '',
          blynk_token: ''
        });
        loadFarms();
      } else {
        alert(`❌ Error: ${result.error || 'Failed to add farm'}`);
      }
    } catch (error) {
      alert('❌ Failed to add farm');
    }
    setLoading(false);
  };

  const deleteFarm = async (farmId) => {
    if (!window.confirm(`⚠️ Decommission unit '${farmId}'? This will permanently delete its metadata and historical packets.`)) return;
    try {
      const res = await fetch(`http://localhost:5050/api/farms/${farmId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        loadFarms();
      } else {
        alert(`❌ Error: ${result.error || 'Failed to delete farm'}`);
      }
    } catch (error) {
      alert('❌ Failed to delete farm');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 bg-slate-50 min-h-screen font-sans">
      
      {/* Header Section */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">Fleet Deployment Control</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Register & Decommission Kleanbotics Telemetry Nodes</p>
        </div>
        <div className="bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100">
           <span className="text-emerald-600 font-black text-xs uppercase tracking-tighter">{farms.length} Active Nodes</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Registration Form */}
        <div className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 h-fit space-y-6">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Deploy New SCADA Hub</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Farm ID (Unique Key)</label>
              <input 
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="e.g. delhi_east" 
                value={newFarm.farm_id}
                onChange={e => setNewFarm({...newFarm, farm_id: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Farm Name</label>
              <input 
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="e.g. Delhi East Plant" 
                value={newFarm.name}
                onChange={e => setNewFarm({...newFarm, name: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">City / Place Location</label>
              <div className="flex gap-2 mt-1">
                <input
                  className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="e.g. Chennai, Tamil Nadu"
                  value={newFarm.city}
                  onChange={e => { setNewFarm({ ...newFarm, city: e.target.value }); setGeoInfo(''); }}
                />
                <button
                  type="button"
                  onClick={autoLocate}
                  disabled={locating}
                  className="shrink-0 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50 cursor-pointer"
                  title="Find coordinates from the city name"
                >
                  {locating ? '…' : '📍 Locate'}
                </button>
              </div>
              {geoInfo && <p className="text-[10px] font-bold text-emerald-600 mt-1.5 ml-1">{geoInfo}</p>}
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Capacity (kW)</label>
              <input 
                type="number"
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="e.g. 250" 
                value={newFarm.capacity}
                onChange={e => setNewFarm({...newFarm, capacity: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Latitude</label>
                <input 
                  type="number"
                  step="0.0001"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="28.6139" 
                  value={newFarm.lat}
                  onChange={e => setNewFarm({...newFarm, lat: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Longitude</label>
                <input 
                  type="number"
                  step="0.0001"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="77.2090" 
                  value={newFarm.lng}
                  onChange={e => setNewFarm({...newFarm, lng: e.target.value})}
                />
              </div>
            </div>

            {/* Live integration (optional) — enables LIVE data via ThingSpeak/Blynk */}
            <div className="pt-4 mt-2 border-t border-slate-100 space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Integration <span className="text-slate-300 normal-case font-bold">(optional — leave blank for SIM)</span></p>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">ThingSpeak Channel ID</label>
                <input
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="e.g. 2145678"
                  value={newFarm.ts_channel_id}
                  onChange={e => setNewFarm({ ...newFarm, ts_channel_id: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">ThingSpeak Read Key <span className="text-slate-300 normal-case">(private channels)</span></label>
                <input
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="XXXXXXXXXXXXXXXX"
                  value={newFarm.ts_read_key}
                  onChange={e => setNewFarm({ ...newFarm, ts_read_key: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Blynk Device Token <span className="text-slate-300 normal-case">(control)</span></label>
                <input
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  placeholder="Blynk auth token"
                  value={newFarm.blynk_token}
                  onChange={e => setNewFarm({ ...newFarm, blynk_token: e.target.value })}
                />
              </div>
              <p className="text-[9px] font-medium text-slate-400 leading-relaxed">🔒 Keys are stored server-side and never sent to the browser. A channel id or token flips this node to <span className="font-black text-emerald-600">LIVE</span>.</p>
            </div>
          </div>

          <button
            onClick={addFarm}
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 mt-4 cursor-pointer"
          >
            {loading ? 'Deploying...' : 'Deploy Node'}
          </button>
        </div>

        {/* Active Nodes List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Active Telemetry Sites</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {farms.map(farm => (
              <div key={farm.farm_id} className="bg-white p-6 rounded-3xl border border-slate-200 flex justify-between items-center group hover:border-emerald-300 transition-all shadow-sm">
                <div className="flex items-center gap-4">
                   <div className="h-12 w-12 bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-emerald-400 font-black text-[10px] italic p-1 truncate max-w-[64px]">
                      <span className="text-[8px] text-slate-500 font-bold uppercase not-italic">ID</span>
                      <span className="truncate w-full text-center">{farm.farm_id}</span>
                   </div>
                   <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">{farm.city || 'Unknown Location'}</p>
                        <LiveBadge farm={farm} />
                      </div>
                      <h4 className="text-base font-black text-slate-800 tracking-tight">{farm.name || farm.city}</h4>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                        Capacity: <span className="text-emerald-600 font-black">{farm.capacity || 0} kW</span>
                      </p>
                      <p className="text-[9px] font-medium text-slate-400">
                        GPS: {farm.lat?.toFixed(4)}, {farm.lng?.toFixed(4)}
                      </p>
                   </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {onFarmChange && (
                    <button 
                      onClick={() => onFarmChange(farm.farm_id)}
                      className="bg-slate-50 hover:bg-emerald-500 hover:text-white text-slate-600 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer border border-slate-100 hover:border-emerald-500"
                    >
                      Control
                    </button>
                  )}
                  <button 
                    onClick={() => deleteFarm(farm.farm_id)}
                    className="flex items-center justify-center p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                    title="Decommission Node"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            
            {farms.length === 0 && (
              <div className="col-span-full bg-slate-100/50 border border-dashed border-slate-300 rounded-[2rem] p-12 text-center">
                <span className="text-4xl">🌱</span>
                <h4 className="text-sm font-bold text-slate-600 mt-3">No custom farms deployed</h4>
                <p className="text-xs text-slate-400 mt-1">Register a new hub to spin up a dynamic telemetry simulation.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default FarmManager;