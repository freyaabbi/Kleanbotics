import React from 'react';
import useHashRoute, { navigate } from '../../hooks/useHashRoute';
import ExplorerHome from './ExplorerHome';
import RowGrid from './RowGrid';
import PanelStrip from './PanelStrip';
import PanelDetail from './PanelDetail';
import RowCompare from './RowCompare';
import MaintenanceQueue from './MaintenanceQueue';
import DayReplay from './DayReplay';

// Farm-level tab bar (shown on grid / compare / maintenance / replay).
function FarmSubNav({ farmId, active }) {
  const tabs = [
    { key: 'farm', label: 'Row Grid', to: `/farms/${farmId}` },
    { key: 'compare', label: 'Compare Rows', to: `/farms/${farmId}/compare` },
    { key: 'maintenance', label: 'Maintenance Queue', to: `/farms/${farmId}/maintenance` },
    { key: 'replay', label: 'Day Replay', to: `/farms/${farmId}/replay` },
  ];
  return (
    <div className="flex flex-wrap gap-2 px-6 md:px-8 pt-6">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => navigate(t.to)}
          className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
            active === t.key
              ? 'bg-slate-900 text-white shadow'
              : 'bg-white text-slate-500 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function Explorer() {
  const route = useHashRoute();

  // Deep views (row strip / panel detail) render standalone with breadcrumbs.
  if (route.view === 'row') return <PanelStrip farmId={route.farmId} rowNo={route.rowNo} />;
  if (route.view === 'panel') return <PanelDetail panelId={route.panelId} />;

  // Farm-level views share the sub-nav.
  if (['farm', 'compare', 'maintenance', 'replay'].includes(route.view)) {
    return (
      <div className="min-h-full bg-slate-50">
        <FarmSubNav farmId={route.farmId} active={route.view} />
        {route.view === 'farm' && <RowGrid farmId={route.farmId} />}
        {route.view === 'compare' && <RowCompare farmId={route.farmId} />}
        {route.view === 'maintenance' && <MaintenanceQueue farmId={route.farmId} />}
        {route.view === 'replay' && <DayReplay farmId={route.farmId} />}
      </div>
    );
  }

  return <ExplorerHome />;
}
