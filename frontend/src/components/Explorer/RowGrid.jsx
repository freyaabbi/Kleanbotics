import React, { useEffect, useState } from 'react';
import { navigate } from '../../hooks/useHashRoute';
import Breadcrumb from './Breadcrumb';
import Skeleton from '../common/Skeleton';

const API = 'http://localhost:5050';

const STATUS_STYLE = {
  NORMAL: 'bg-accent-fill',
  OK: 'bg-accent-fill',
  DEGRADED: 'bg-warn',
  MAINTENANCE: 'bg-orange-500',
  FAULT: 'bg-danger animate-pulse',
  OFFLINE: 'bg-slate-400',
};

export default function RowGrid({ farmId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]); // shift-click multi-select

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setSelected([]);
    fetch(`${API}/api/farms/${farmId}/rows`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load rows'))))
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [farmId]);

  const farmName = data?.farm?.name || farmId;

  const onCardClick = (e, row) => {
    if (e.shiftKey) {
      // multi-select for comparison (don't navigate)
      setSelected((prev) =>
        prev.includes(row.row_no) ? prev.filter((n) => n !== row.row_no) : [...prev, row.row_no].sort((a, b) => a - b)
      );
    } else {
      navigate(`/farms/${farmId}/rows/${row.row_no}`);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-page min-h-full">
      <Breadcrumb crumbs={[{ label: 'Fleet', to: '/' }, { label: farmName }]} />

      <header className="bg-surface p-6 rounded-3xl border border-line shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-ink tracking-tight italic">{farmName} · Row Grid</h2>
          <p className="text-[11px] font-black text-muted uppercase tracking-[.08em] mt-1">
            {data ? `${data.totals.rows} Rows · ${data.totals.panels} Panels` : 'Loading layout…'}
          </p>
        </div>
        {data && (
          <div className="bg-ink text-surface px-5 py-2.5 rounded-2xl">
            <span className="text-[9px] font-black text-muted uppercase tracking-widest">Active Output</span>
            <p className="text-lg font-black">{data.totals.active_power_kw} <small className="text-[10px] text-muted">kW</small></p>
          </div>
        )}
      </header>

      <p className="text-[11px] font-bold text-muted -mt-2">
        Tip: <span className="text-ink">click</span> a row to open its panels · <span className="text-ink">shift-click</span> to select rows to compare.
      </p>

      {error && (
        <div className="bg-danger-soft border border-danger/30 text-danger rounded-2xl p-6 text-xs font-bold uppercase tracking-widest">
          {error}
        </div>
      )}

      {/* Skeleton loader */}
      {!data && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-3xl" />
          ))}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {data.rows.map((row) => {
            const isSel = selected.includes(row.row_no);
            return (
              <div key={row.row_id} className="relative">
                <button
                  onClick={(e) => onCardClick(e, row)}
                  className={`w-full text-left bg-surface rounded-3xl border shadow-sm p-5 transition-all group ${
                    isSel ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-[9px] font-black text-muted uppercase tracking-widest">Row</p>
                      <h3 className="text-xl font-black text-ink tracking-tight italic group-hover:text-accent transition-colors">
                        {row.label}
                      </h3>
                    </div>
                    <span className={`h-3 w-3 rounded-full ${STATUS_STYLE[row.status] || 'bg-slate-300'}`}></span>
                  </div>

                  <div className="flex justify-between text-[10px] font-bold text-muted uppercase tracking-wider mb-3">
                    <span>{row.panel_count} Panels</span>
                    <span className={row.fault_count > 0 ? 'text-danger' : 'text-accent'}>
                      {row.fault_count > 0 ? `${row.fault_count} Fault(s)` : 'Nominal'}
                    </span>
                  </div>

                  <div className="flex items-end justify-between border-t border-line pt-3">
                    <div>
                      <p className="text-[8px] font-black text-muted uppercase tracking-widest">Output</p>
                      <p className="text-sm font-black text-ink">{row.active_power_kw} kW</p>
                    </div>
                    <span className="text-[9px] font-black text-accent uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                      {isSel ? 'Selected' : 'Open →'}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating compare bar */}
      {selected.length > 0 && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-ink text-surface px-5 py-3 rounded-2xl shadow-elev animate-in slide-in-from-bottom-4">
          <span className="text-xs font-black">{selected.length} row{selected.length > 1 ? 's' : ''} selected</span>
          <button
            onClick={() => setSelected([])}
            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-surface"
          >
            Clear
          </button>
          <button
            disabled={selected.length < 2}
            onClick={() => navigate(`/farms/${farmId}/compare?rows=${selected.join(',')}`)}
            className="text-[10px] font-black uppercase tracking-widest bg-accent-fill text-white px-4 py-2 rounded-xl disabled:opacity-40"
          >
            Compare →
          </button>
        </div>
      )}
    </div>
  );
}
