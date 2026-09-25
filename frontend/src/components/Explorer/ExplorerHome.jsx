import React, { useEffect, useState } from 'react';
import { navigate } from '../../hooks/useHashRoute';
import Skeleton from '../common/Skeleton';

const API = 'http://localhost:5050';

export default function ExplorerHome() {
  const [farms, setFarms] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/farms`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load farms'))))
      .then((d) => active && setFarms(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50 min-h-full">
      <header>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">Fleet Explorer</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
          Drill down: Farm › Row › Panel · Compare · Maintenance · Replay
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-xs font-bold uppercase tracking-widest">
          {error}
        </div>
      )}

      {!farms && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-3xl" />)}
        </div>
      )}

      {farms && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {farms.map((f) => (
            <button
              key={f.farm_id}
              onClick={() => navigate(`/farms/${f.farm_id}`)}
              className="text-left bg-white rounded-3xl border border-slate-200 shadow-sm p-6 hover:shadow-md hover:border-emerald-300 transition-all group"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Solar Farm</p>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight italic group-hover:text-emerald-600 transition-colors">
                    {f.name}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{f.city}</p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-white font-black">
                  {f.name?.[0] || '?'}
                </div>
              </div>
              <div className="flex items-end justify-between border-t border-slate-100 pt-4">
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Capacity</p>
                  <p className="text-sm font-black text-slate-800">{f.capacity} kW</p>
                </div>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  Explore →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
