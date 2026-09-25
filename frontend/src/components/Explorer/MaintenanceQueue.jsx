import React, { useEffect, useState, useCallback } from 'react';
import { navigate } from '../../hooks/useHashRoute';
import Breadcrumb from './Breadcrumb';
import { useToast } from '../common/Toast';

const API = 'http://localhost:5050';

const STATUS_BADGE = {
  DEGRADED: 'bg-amber-50 text-amber-700 border-amber-200',
  MAINTENANCE: 'bg-orange-50 text-orange-700 border-orange-200',
  FAULT: 'bg-red-50 text-red-700 border-red-200',
  OFFLINE: 'bg-slate-100 text-slate-500 border-slate-200',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—');

function Kpi({ label, value, accent }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-black mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}

export default function MaintenanceQueue({ farmId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const push = useToast();

  const load = useCallback(() => {
    fetch(`${API}/api/farms/${farmId}/maintenance`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load queue'))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [farmId]);

  useEffect(() => { setData(null); setError(null); load(); }, [farmId, load]);

  const resolve = async (panelId, action, e) => {
    e.stopPropagation();
    setBusy(panelId);
    try {
      const r = await fetch(`${API}/api/panels/${panelId}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error('Action failed');
      push(`${action === 'CLEAN' ? 'Cleaned' : 'Replaced'} · ${panelId}`, 'success');
      load();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const farmName = data?.farm?.name || farmId;
  const maxLost = data?.queue?.[0]?.lost_kwh || 1;

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50 min-h-full">
      <Breadcrumb crumbs={[{ label: 'Fleet', to: '/' }, { label: farmName, to: `/farms/${farmId}` }, { label: 'Maintenance Queue' }]} />

      <header>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">Maintenance Queue</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
          {farmName} · Ranked by estimated lost energy
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-xs font-bold uppercase tracking-widest">{error}</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Panels Flagged" value={data.summary.panels_flagged} accent="#0f172a" />
            <Kpi label="Active Faults" value={data.summary.faults} accent="#ef4444" />
            <Kpi label="Degraded (Soiled)" value={data.summary.degraded} accent="#f59e0b" />
            <Kpi label="Est. Lost Energy" value={`${data.summary.total_lost_kwh} kWh`} accent="#10b981" />
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Panel</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-3">Lost Energy</div>
              <div className="col-span-1 text-right">Down</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            {data.queue.length === 0 && (
              <div className="text-center py-12 text-emerald-500 text-xs font-black uppercase tracking-widest">
                ✓ All panels healthy — nothing queued
              </div>
            )}

            {data.queue.map((q, i) => (
              <div
                key={q.panel_id}
                onClick={() => navigate(`/panels/${q.panel_id}`)}
                className="grid grid-cols-12 gap-2 px-6 py-3 items-center border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group"
              >
                <div className="col-span-1 text-sm font-black text-slate-300">{i + 1}</div>
                <div className="col-span-3">
                  <p className="text-xs font-black text-slate-700 group-hover:text-emerald-600 transition-colors">
                    R{String(q.row_no).padStart(2, '0')} · P{String(q.panel_no).padStart(2, '0')}
                  </p>
                  <p className="text-[9px] font-mono text-slate-400">{q.serial}</p>
                </div>
                <div className="col-span-2">
                  <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${STATUS_BADGE[q.status] || STATUS_BADGE.OFFLINE}`}>
                    {q.status}
                  </span>
                </div>
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-red-400 rounded-full" style={{ width: `${Math.max(4, (q.lost_kwh / maxLost) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-black text-slate-700 w-16 text-right">{q.lost_kwh} kWh</span>
                  </div>
                </div>
                <div className="col-span-1 text-right text-[10px] font-bold text-slate-400">{q.days_down}d</div>
                <div className="col-span-2 text-right">
                  <button
                    disabled={busy === q.panel_id}
                    onClick={(e) => resolve(q.panel_id, q.recommended_action, e)}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50 ${
                      q.recommended_action === 'CLEAN' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-900 hover:bg-black text-white'
                    }`}
                  >
                    {busy === q.panel_id ? '…' : q.recommended_action}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
