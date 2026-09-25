import React, { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:5050';

// Global ⌘K / Ctrl+K palette to jump to any farm / row / panel.
// Opens on the keyboard shortcut or a window 'toggle-palette' event.
export default function CommandPalette({ onJump }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [farms, setFarms] = useState([]);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/farms`).then((r) => r.json()).then(setFarms).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener('keydown', onKey);
    window.addEventListener('toggle-palette', onToggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('toggle-palette', onToggle);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Build the flat command list.
  const items = [];
  const trimmed = q.trim();
  if (/_r\d+_p\d+/i.test(trimmed)) {
    items.push({ label: `Go to panel ${trimmed}`, sub: 'Panel', path: `/panels/${trimmed}` });
  }
  farms.forEach((f) => {
    items.push({ label: f.name, sub: 'Row grid', path: `/farms/${f.farm_id}` });
    items.push({ label: `${f.name} · Maintenance`, sub: 'Queue', path: `/farms/${f.farm_id}/maintenance` });
    items.push({ label: `${f.name} · Compare rows`, sub: 'Compare', path: `/farms/${f.farm_id}/compare` });
    items.push({ label: `${f.name} · Day Replay`, sub: 'Replay', path: `/farms/${f.farm_id}/replay` });
  });

  const filtered = items
    .filter((it) => it.label.toLowerCase().includes(trimmed.toLowerCase()))
    .slice(0, 8);

  const choose = (it) => {
    if (!it) return;
    onJump(it.path);
    setOpen(false);
  };

  const onListKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(filtered[idx]); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-32 bg-slate-900/30 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-surface rounded-2xl border border-line shadow-elev overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={onListKey}
          placeholder="Jump to a farm, row, or panel…"
          className="w-full px-5 py-4 bg-transparent outline-none text-ink font-bold placeholder:text-muted border-b border-line"
        />
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-5 py-6 text-center text-muted text-xs font-bold">No matches</p>
          )}
          {filtered.map((it, i) => (
            <button
              key={i}
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(it)}
              className={`w-full flex items-center justify-between px-5 py-3 text-left transition-colors ${i === idx ? 'bg-soft' : ''}`}
            >
              <span className="text-sm font-bold text-ink">{it.label}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted">{it.sub}</span>
            </button>
          ))}
        </div>
        <div className="px-5 py-2 border-t border-line text-[10px] font-bold text-muted flex gap-4">
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
