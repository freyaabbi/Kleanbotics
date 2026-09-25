import React from 'react';
import { navigate } from '../../hooks/useHashRoute';

// Fleet › Delhi North › Row 04 › Panel 12
export default function Breadcrumb({ crumbs }) {
  return (
    <nav className="flex items-center flex-wrap gap-1 text-xs font-black uppercase tracking-widest">
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300 mx-1">›</span>}
            {isLast || !c.to ? (
              <span className={isLast ? 'text-slate-800' : 'text-slate-400'}>{c.label}</span>
            ) : (
              <button
                onClick={() => navigate(c.to)}
                className="text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
              >
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
