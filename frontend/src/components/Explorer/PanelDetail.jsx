import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { navigate } from '../../hooks/useHashRoute';
import Breadcrumb from './Breadcrumb';
import { useToast } from '../common/Toast';
import Skeleton from '../common/Skeleton';

const API = 'http://localhost:5050';

const STATUS_BADGE = {
  OK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NORMAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DEGRADED: 'bg-amber-50 text-amber-700 border-amber-200',
  MAINTENANCE: 'bg-orange-50 text-orange-700 border-orange-200',
  FAULT: 'bg-red-50 text-red-700 border-red-200',
  OFFLINE: 'bg-slate-100 text-slate-500 border-slate-200',
};

const SEV_COLOR = {
  CRITICAL: 'text-red-600 bg-red-50 border-red-200',
  HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
  MEDIUM: 'text-amber-600 bg-amber-50 border-amber-200',
  LOW: 'text-slate-600 bg-slate-50 border-slate-200',
};

const METRICS = [
  { key: 'power_kw', label: 'Power', unit: 'kW', color: '#10b981' },
  { key: 'voltage_v', label: 'Voltage', unit: 'V', color: '#06b6d4' },
  { key: 'current_a', label: 'Current', unit: 'A', color: '#f59e0b' },
  { key: 'temperature_c', label: 'Temp', unit: '°C', color: '#ef4444' },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { hour12: false }) : '—');

function StatCard({ label, value, unit, accent }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-black text-slate-800 mt-1" style={{ color: accent }}>
        {value}
        <span className="text-sm text-slate-400 font-bold ml-1">{unit}</span>
      </p>
    </div>
  );
}

export default function PanelDetail({ panelId }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [metric, setMetric] = useState('power_kw');
  const [busy, setBusy] = useState('');
  const push = useToast();

  const loadDetail = useCallback(() => {
    fetch(`${API}/api/panels/${panelId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Panel not found'))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [panelId]);

  const loadHistory = useCallback(() => {
    fetch(`${API}/api/panels/${panelId}/history`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('history'))))
      .then((d) => setHistory(d.series))
      .catch(() => setHistory([]));
  }, [panelId]);

  useEffect(() => {
    setData(null); setHistory(null); setError(null);
    loadDetail(); loadHistory();
    // Live refresh of telemetry every 5s.
    const iv = setInterval(loadDetail, 5000);
    return () => clearInterval(iv);
  }, [panelId, loadDetail, loadHistory]);

  const runAction = async (action) => {
    setBusy(action);
    try {
      const r = await fetch(`${API}/api/panels/${panelId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error('Action failed');
      push(action === 'CLEAN' ? 'Cleaning logged for panel' : 'Panel replaced', 'success');
      loadDetail(); loadHistory();
    } catch (e) {
      push(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-xs font-bold uppercase tracking-widest">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6 md:p-8 space-y-6 bg-page min-h-full">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-20 rounded-3xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-3xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-80 rounded-3xl" />
          <Skeleton className="h-80 rounded-3xl" />
        </div>
      </div>
    );
  }

  const { panel, farm, row, telemetry, alerts } = data;
  const activeMetric = METRICS.find((m) => m.key === metric);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-page min-h-full relative">
      <Breadcrumb
        crumbs={[
          { label: 'Fleet', to: '/' },
          { label: farm?.name || panel.farm_id, to: `/farms/${panel.farm_id}` },
          { label: row?.label || `Row ${panel.row_no}`, to: `/farms/${panel.farm_id}/rows/${panel.row_no}` },
          { label: panel.label || panel.panel_id },
        ]}
      />

      {/* Header */}
      <header className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">{panel.label} · {farm?.name}</h2>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_BADGE[panel.status] || STATUS_BADGE.OFFLINE}`}>
              {panel.status}
            </span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 font-mono">{panel.panel_id}</p>
        </div>
        <div className="flex gap-3">
          <button
            disabled={busy}
            onClick={() => runAction('CLEAN')}
            className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow"
          >
            {busy === 'CLEAN' ? 'Working…' : '🧽 Clean Panel'}
          </button>
          <button
            disabled={busy}
            onClick={() => { if (window.confirm('Replace this panel? This resets its install date and clears faults.')) runAction('REPLACE'); }}
            className="px-5 py-3 rounded-2xl bg-slate-900 hover:bg-black disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow"
          >
            {busy === 'REPLACE' ? 'Working…' : '🔧 Replace'}
          </button>
        </div>
      </header>

      {/* Live V / I / T / P */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Live Power" value={telemetry.power_kw} unit="kW" accent="#10b981" />
        <StatCard label="Voltage" value={telemetry.voltage_v} unit="V" accent="#06b6d4" />
        <StatCard label="Current" value={telemetry.current_a} unit="A" accent="#f59e0b" />
        <StatCard label="Cell Temp" value={telemetry.temperature_c} unit="°C" accent="#ef4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 24h sparkline */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">24-Hour Trend</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Synthesized from farm telemetry</p>
            </div>
            <div className="flex gap-1.5">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                    metric === m.key ? 'text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                  style={metric === m.key ? { backgroundColor: m.color } : {}}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {history && history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={7} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} />
                  <Tooltip
                    contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v) => [`${v} ${activeMetric.unit}`, activeMetric.label]}
                  />
                  <Area type="monotone" dataKey={metric} stroke={activeMetric.color} strokeWidth={2} fill="url(#grad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-300 text-xs font-black uppercase tracking-widest">
                {history ? 'No data' : 'Loading chart…'}
              </div>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Asset Details</h3>
          {[
            ['Serial No.', panel.serial],
            ['Wattage', `${panel.wattage} Wp`],
            ['Install Date', fmtDate(panel.installed_at)],
            ['Last Cleaned', fmtDate(panel.last_clean_at)],
            ['Tilt / Azimuth', `${panel.tilt_deg}° / ${panel.azimuth_deg}°`],
            ['Row', row?.label || `Row ${panel.row_no}`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center border-b border-slate-50 pb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{k}</span>
              <span className="text-xs font-bold text-slate-700 font-mono">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fault history */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">
          Fault History <span className="text-slate-300">({alerts?.length || 0})</span>
        </h3>
        {alerts && alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${SEV_COLOR[a.severity] || SEV_COLOR.LOW}`}>
                  {a.severity || 'LOW'}
                </span>
                <span className="text-xs font-black text-slate-700">{a.code}</span>
                <span className="text-xs font-bold text-slate-500">{a.name}</span>
                <span className="ml-auto text-[10px] font-mono text-slate-400">{fmtDateTime(a.timestamp)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-emerald-500 text-xs font-black uppercase tracking-widest">
            ✓ No faults on record — panel healthy
          </div>
        )}
      </div>
    </div>
  );
}
