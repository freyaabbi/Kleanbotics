import React, { useEffect, useState, useRef } from 'react';
import { navigate } from '../../hooks/useHashRoute';
import Breadcrumb from './Breadcrumb';

const API = 'http://localhost:5050';

const isDown = (s) => s === 'FAULT' || s === 'MAINTENANCE' || s === 'OFFLINE';

export default function DayReplay({ farmId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [frac, setFrac] = useState(1);        // 0..1 scrub position
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setData(null); setError(null); setFrac(1); setPlaying(false);
    fetch(`${API}/api/farms/${farmId}/replay`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load replay'))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [farmId]);

  // Play loop: sweep the day in ~12s, then loop.
  useEffect(() => {
    if (!playing) { clearInterval(timer.current); return; }
    timer.current = setInterval(() => {
      setFrac((f) => (f >= 1 ? 0 : Math.min(1, f + 0.012)));
    }, 80);
    return () => clearInterval(timer.current);
  }, [playing]);

  if (error) {
    return <div className="p-8"><div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-xs font-bold uppercase tracking-widest">{error}</div></div>;
  }
  if (!data) {
    return <div className="p-8 text-slate-400 text-xs font-black uppercase tracking-widest">Loading replay…</div>;
  }

  const start = new Date(data.day_start).getTime();
  const end = new Date(data.day_end).getTime();
  const currentT = start + frac * (end - start);
  const currentLabel = new Date(currentT).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // A panel is "faulted at time T" if it has an appearance time <= T.
  const stateAt = (p) => {
    if (!p.appear_at) return 'ok';
    if (new Date(p.appear_at).getTime() <= currentT) return isDown(p.status) ? 'fault' : 'degraded';
    return 'ok';
  };

  const cells = data.panels.map((p) => ({ ...p, s: stateAt(p) }));
  const activeFaults = cells.filter((c) => c.s === 'fault').length;
  const activeDeg = cells.filter((c) => c.s === 'degraded').length;
  const farmName = data.farm?.name || farmId;

  // Heat scale with colorblind-safe pattern overlay (see index.css).
  const cellColor = { ok: 'heat-ok', degraded: 'heat-warn', fault: 'heat-bad' };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50 min-h-full">
      <Breadcrumb crumbs={[{ label: 'Fleet', to: '/' }, { label: farmName, to: `/farms/${farmId}` }, { label: 'Day Replay' }]} />

      <header className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight italic">Day Replay</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
            {farmName} · {data.rows}×{data.cols} grid · scrub to watch faults appear
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Faults</p>
            <p className="text-2xl font-black text-red-500">{activeFaults}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Degraded</p>
            <p className="text-2xl font-black text-amber-500">{activeDeg}</p>
          </div>
        </div>
      </header>

      {/* Scrubber */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="h-12 w-12 shrink-0 rounded-2xl bg-slate-900 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer shadow"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <div className="flex-1">
            <input
              type="range" min="0" max="1" step="0.001" value={frac}
              onChange={(e) => { setPlaying(false); setFrac(Number(e.target.value)); }}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
              <span>{new Date(start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              <span className="text-emerald-600">▶ {currentLabel}</span>
              <span>{new Date(end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 overflow-x-auto">
        <div className="flex items-center gap-4 mb-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded heat-ok" /> Healthy</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded heat-warn" /> Degraded</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded heat-bad" /> Fault</span>
        </div>
        <div
          className="grid gap-1 min-w-min"
          style={{ gridTemplateColumns: `repeat(${data.cols}, minmax(14px, 1fr))` }}
        >
          {cells
            .slice()
            .sort((a, b) => a.row_no - b.row_no || a.panel_no - b.panel_no)
            .map((c) => (
              <button
                key={c.panel_id}
                onClick={() => navigate(`/panels/${c.panel_id}`)}
                title={`R${c.row_no} P${c.panel_no} · ${c.s === 'ok' ? 'Healthy' : c.status}`}
                className={`aspect-square rounded-[3px] transition-colors duration-300 hover:ring-2 hover:ring-ink ${cellColor[c.s]}`}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
