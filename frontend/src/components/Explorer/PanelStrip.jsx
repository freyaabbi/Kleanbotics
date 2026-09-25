import React, { useEffect, useState } from 'react';
import { navigate } from '../../hooks/useHashRoute';
import Breadcrumb from './Breadcrumb';

const API = 'http://localhost:5050';

const STATUS_STYLE = {
  NORMAL: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  OK: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  DEGRADED: 'bg-amber-50 border-amber-200 text-amber-700',
  MAINTENANCE: 'bg-orange-50 border-orange-200 text-orange-700',
  FAULT: 'bg-red-50 border-red-200 text-red-700',
  OFFLINE: 'bg-slate-100 border-slate-200 text-slate-500',
};

export default function PanelStrip({ farmId, rowNo }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    fetch(`${API}/api/farms/${farmId}/rows/${rowNo}/panels`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load panels'))))
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [farmId, rowNo]);

  const farmName = data?.farm?.name || farmId;
  const rowLabel = data?.row?.label || `Row ${String(rowNo).padStart(2, '0')}`;

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50 min-h-full">
      <Breadcrumb
        crumbs={[
          { label: 'Fleet', to: '/' },
          { label: farmName, to: `/farms/${farmId}` },
          { label: rowLabel },
        ]}
      />

      <header className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">{rowLabel} · Panel Strip</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
          {farmName}{data ? ` · ${data.panels.length} Panels` : ''}
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-xs font-bold uppercase tracking-widest">
          {error}
        </div>
      )}

      {data && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 overflow-x-auto">
          <div className="flex gap-3 min-w-min pb-2">
            {data.panels.map((p) => (
              <button
                key={p.panel_id}
                onClick={() => navigate(`/panels/${p.panel_id}`)}
                title={`${p.label} · ${p.status}`}
                className={`shrink-0 w-24 rounded-2xl border p-3 flex flex-col justify-between h-28 hover:scale-[1.03] hover:shadow-md transition-all ${
                  STATUS_STYLE[p.status] || 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-70">P{String(p.panel_no).padStart(2, '0')}</span>
                  <span className={`h-2 w-2 rounded-full ${p.status === 'FAULT' ? 'bg-red-500 animate-pulse' : p.status === 'DEGRADED' ? 'bg-amber-500' : p.status === 'MAINTENANCE' ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                </div>
                <div>
                  <p className="text-sm font-black">{p.active_power_kw}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest opacity-60">kW</p>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-70">{p.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
