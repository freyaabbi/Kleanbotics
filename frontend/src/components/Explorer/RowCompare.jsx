import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import Breadcrumb from './Breadcrumb';

const API = 'http://localhost:5050';
const COLORS = ['#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ef4444'];
const MAX = 5;

export default function RowCompare({ farmId }) {
  const [rows, setRows] = useState(null);        // all rows for the farm
  const [farmName, setFarmName] = useState(farmId);
  const [selected, setSelected] = useState([]);  // row_no[]
  const [series, setSeries] = useState(null);
  const [keys, setKeys] = useState([]);          // [{row_no,key}]
  const [error, setError] = useState(null);

  // Load the farm's rows. Pre-select from a ?rows= deep-link if present,
  // otherwise default to the first three.
  useEffect(() => {
    let active = true;
    const qs = window.location.hash.split('?')[1] || '';
    const deepLinked = new URLSearchParams(qs).get('rows');
    fetch(`${API}/api/farms/${farmId}/rows`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load rows'))))
      .then((d) => {
        if (!active) return;
        setRows(d.rows);
        setFarmName(d.farm?.name || farmId);
        const valid = new Set(d.rows.map((r) => r.row_no));
        const picked = deepLinked
          ? deepLinked.split(',').map(Number).filter((n) => valid.has(n)).slice(0, 5)
          : d.rows.slice(0, 3).map((r) => r.row_no);
        setSelected(picked.length ? picked : d.rows.slice(0, 3).map((r) => r.row_no));
      })
      .catch((e) => active && setError(e.message));
    return () => { active = false; };
  }, [farmId]);

  // Refetch the overlay series whenever the selection changes.
  useEffect(() => {
    if (selected.length === 0) { setSeries([]); setKeys([]); return; }
    let active = true;
    fetch(`${API}/api/farms/${farmId}/rows/compare?rows=${selected.join(',')}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('compare'))))
      .then((d) => { if (active) { setSeries(d.series); setKeys(d.rows); } })
      .catch(() => active && setSeries([]));
    return () => { active = false; };
  }, [farmId, selected]);

  const toggle = (rowNo) => {
    setSelected((prev) => {
      if (prev.includes(rowNo)) return prev.filter((n) => n !== rowNo);
      if (prev.length >= MAX) return prev; // cap at 5
      return [...prev, rowNo].sort((a, b) => a - b);
    });
  };

  const colorFor = (rowNo) => COLORS[selected.indexOf(rowNo) % COLORS.length];

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50 min-h-full">
      <Breadcrumb crumbs={[{ label: 'Fleet', to: '/' }, { label: farmName, to: `/farms/${farmId}` }, { label: 'Compare Rows' }]} />

      <header className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">Row Comparison</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
          {farmName} · Overlay up to {MAX} rows · {selected.length} selected
        </p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-xs font-bold uppercase tracking-widest">{error}</div>
      )}

      {/* Row picker */}
      {rows && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Select rows to overlay</p>
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => {
              const on = selected.includes(r.row_no);
              const atMax = !on && selected.length >= MAX;
              return (
                <button
                  key={r.row_id}
                  onClick={() => toggle(r.row_no)}
                  disabled={atMax}
                  className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${
                    on ? 'text-white border-transparent' : atMax ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                  }`}
                  style={on ? { backgroundColor: colorFor(r.row_no) } : {}}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Overlay chart */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">Active Power · 24h (kW)</h3>
        <div className="h-96">
          {series && series.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3E8EF" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={7} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} />
                <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                {keys.map((k) => (
                  <Line
                    key={k.key}
                    type="monotone"
                    dataKey={k.key}
                    name={`Row ${String(k.row_no).padStart(2, '0')}`}
                    stroke={colorFor(k.row_no)}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-300 text-xs font-black uppercase tracking-widest text-center px-6">
              {selected.length === 0
                ? 'Select at least one row'
                : series === null
                ? 'Loading…'
                : 'No telemetry in this window yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
