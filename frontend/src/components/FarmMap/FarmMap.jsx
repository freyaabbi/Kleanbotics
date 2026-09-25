import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Static Coordinate Lookup for Kleanbotics Cities (Binary Sync)
const CITY_COORDS = {
  "Delhi": [28.6139, 77.2090],
  "Mumbai": [19.0760, 72.8777],
  "Bangalore": [12.9716, 77.5946],
  "Chennai": [13.0827, 80.2707],
  "Hyderabad": [17.3850, 78.4867],
  "Default": [20.5937, 78.9629] // Center of India
};

const FarmMap = ({ botStatus, setCurrentView, setActiveFarmId }) => {
  const [loadingId, setLoadingId] = useState(null);
  const [weatherData, setWeatherData] = useState({});

  // 🌟 DYNAMIC EXTRACTION: Mapping binary telemetry to Map Pins
  const farms = Object.keys(botStatus || {}).map(id => {
    const packet = botStatus[id];
    // Use actual packet/telemetry coordinates if available, otherwise fallback to static city coordinate lookup
    const lat = packet.lat || (packet.location && packet.location.lat) || (CITY_COORDS[packet.city] || CITY_COORDS["Default"])[0];
    const lng = packet.lng || (packet.location && packet.location.lng) || (CITY_COORDS[packet.city] || CITY_COORDS["Default"])[1];
    
    let status = 'active';
    if (packet.status === 'OFFLINE') {
      status = 'offline';
    } else if (packet.status === 'FAULT' || packet.error_code !== 0) {
      status = 'maintenance';
    } else if (parseFloat(packet.ac_power_kw || 0) === 0) {
      status = 'inactive_night';
    }
    
    return {
      id: id,
      device_id: packet.device_id,
      city: packet.city || "Unknown",
      lat: lat,
      lng: lng,
      power: packet.ac_power_kw || ((packet.voltage_solar_panel * packet.running_current) / 1000).toFixed(2),
      status: status
    };
  });

  const fetchLiveWeather = async (farm) => {
    if (!farm.lat || !farm.lng) {
      alert(`❌ Cannot fetch weather: Coordinates are invalid (${farm.lat}, ${farm.lng})`);
      return;
    }
    setLoadingId(farm.id);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${farm.lat}&longitude=${farm.lng}&current_weather=true`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      const current = data.current_weather;
      if (!current) {
        throw new Error("current_weather missing in weather API response");
      }
      
      setWeatherData(prev => ({
        ...prev,
        [farm.id]: {
          temp: current.temperature,
          wind: current.windspeed,
          recommendation: current.temperature > 40 ? "🟡 WARNING: HEAT" : "🟢 GO (SAFE)",
          recStyle: current.temperature > 40 ? "bg-yellow-100 text-yellow-800" : "bg-emerald-100 text-emerald-800"
        }
      }));
    } catch (err) {
      console.error("Weather fetch failed:", err);
      alert(`❌ Weather fetch failed: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface rounded-[2.5rem] shadow-xl border border-line overflow-hidden font-sans">

      {/* Header */}
      <div className="bg-surface border-b border-line px-8 py-5 flex justify-between items-center text-ink relative z-10">
        <div>
          <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
            <span className="text-accent">●</span> Fleet Operations Map
          </h3>
          <p className="text-[11px] text-muted font-bold uppercase tracking-[.08em] mt-0.5">Real-time Geospatial Telemetry</p>
        </div>
        <div className="bg-sunk text-muted px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-[.08em] border border-line">
          {farms.filter(f => f.status !== 'offline').length} / {farms.length} Sites Online
        </div>
      </div>
      
      <div className="flex-1 w-full relative z-0 min-h-[500px]">
        <MapContainer 
          center={[20.59, 78.96]} 
          zoom={3} 
          style={{ height: '100%', width: '100%' }}
          className="rounded-b-3xl"
        >
          {/* CARTO Positron (light_all) raster basemap. The {r} token serves
              crisp @2x retina tiles on high-DPI screens. The key is a
              client-side basemap key (safe to ship in the frontend). */}
          <TileLayer
            url="https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=cb1_3h4u_1_9cc8e9d01e9e708b374c1586"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            maxZoom={20}
          />
          
          {farms.map(farm => {
            // Determine marker colors and animation based on status
            let outerClass = '';
            let innerClass = '';
            
            if (farm.status === 'active') {
              outerClass = 'bg-emerald-500/20 animate-ping';
              innerClass = 'bg-emerald-500';
            } else if (farm.status === 'offline' || farm.status === 'inactive_night') {
              outerClass = 'hidden'; // No glow/ping for offline/night
              innerClass = 'bg-slate-400';
            } else {
              outerClass = 'bg-red-500/20'; // Maintenance/Fault has static glow
              innerClass = 'bg-red-500 animate-pulse';
            }

            const customMarker = L.divIcon({
              className: 'custom-marker',
              html: `<div class="relative flex items-center justify-center">
                       <div class="absolute w-8 h-8 rounded-full ${outerClass}"></div>
                       <div class="w-4 h-4 rounded-full border-2 border-white shadow-xl ${innerClass}"></div>
                     </div>`,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });

            return (
              <Marker key={farm.id} position={[farm.lat, farm.lng]} icon={customMarker}>
                <Popup className="custom-popup">
                  <div className="w-64 p-1">
                    <div className="bg-sunk border border-line text-ink p-4 rounded-2xl mb-3 relative">
                      <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Device ID: {farm.device_id}</p>
                      <h3 className="font-bold text-xl tracking-tight">{farm.city} Hub</h3>
                      <span className={`absolute top-4 right-4 text-[9px] font-black px-2.5 py-0.5 rounded-full ${
                        farm.status === 'active' ? 'bg-soft text-accent' :
                        farm.status === 'maintenance' ? 'bg-danger-soft text-danger' :
                        farm.status === 'inactive_night' ? 'bg-white text-muted border border-line' :
                        'bg-white text-muted border border-line'
                      }`}>
                        {farm.status === 'active' ? 'Active' :
                         farm.status === 'maintenance' ? 'Maint' :
                         farm.status === 'inactive_night' ? 'Night' :
                         'Offline'}
                      </span>
                    </div>
                    
                    <div className="px-2 space-y-4 mb-3">
                      <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status Details</span>
                        <span className={`font-bold text-xs uppercase ${
                          farm.status === 'active' ? 'text-emerald-500' :
                          farm.status === 'maintenance' ? 'text-red-500' :
                          farm.status === 'inactive_night' ? 'text-slate-500' :
                          'text-slate-400'
                        }`}>
                          {farm.status === 'active' ? '🟢 Active Generating' :
                           farm.status === 'maintenance' ? '🔴 Under Maintenance' :
                           farm.status === 'inactive_night' ? '🌙 Inactive (Night)' :
                           '⚪ Offline (No Signal)'}
                        </span>
                      </div>

                      <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Output</span>
                        <span className="font-black text-slate-800 text-lg">{farm.power} <small className="text-[10px] text-slate-400">kW</small></span>
                      </div>

                      <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">GPS Coordinates</span>
                        <span className="font-bold text-slate-700 text-xs">{Number(farm.lat).toFixed(4)}, {Number(farm.lng).toFixed(4)}</span>
                      </div>

                      {weatherData[farm.id] && (
                        <div className={`p-3 rounded-xl border ${weatherData[farm.id].recStyle} transition-all`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-black text-xs">{weatherData[farm.id].temp}°C</span>
                            <span className="text-[9px] font-bold opacity-70">{weatherData[farm.id].wind} km/h</span>
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-center">{weatherData[farm.id].recommendation}</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-1">
                      <button 
                        onClick={() => fetchLiveWeather(farm)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-[10px] uppercase tracking-widest transition-all"
                      >
                        {loadingId === farm.id ? '...' : 'Weather'}
                      </button>
                      <button 
                        onClick={() => {
                          setActiveFarmId(farm.id);
                          setCurrentView('controls');
                        }}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 transition-all"
                      >
                        Monitor
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default FarmMap;