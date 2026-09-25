import { useState, useEffect, useCallback } from 'react';

// Navigate to a hierarchy route. Produces real, shareable URLs:
//   #/farms/:id                      -> row grid
//   #/farms/:id/rows/:rowNo          -> panel strip
//   #/panels/:id                     -> single panel detail
export const navigate = (path) => {
  window.location.hash = path;
};

export function parseHash(hash) {
  // Strip any ?query before routing (e.g. #/farms/x/compare?rows=1,2,3).
  const clean = (hash || '').replace(/^#/, '').replace(/^\/+/, '').split('?')[0];
  const parts = clean.split('/').filter(Boolean);

  // #/farms/:id/rows/:rowNo
  if (parts[0] === 'farms' && parts[2] === 'rows' && parts[3]) {
    return { view: 'row', farmId: decodeURIComponent(parts[1]), rowNo: Number(parts[3]) };
  }
  // #/farms/:id/compare | maintenance | replay
  if (parts[0] === 'farms' && parts[1] && ['compare', 'maintenance', 'replay'].includes(parts[2])) {
    return { view: parts[2], farmId: decodeURIComponent(parts[1]) };
  }
  // #/farms/:id
  if (parts[0] === 'farms' && parts[1]) {
    return { view: 'farm', farmId: decodeURIComponent(parts[1]) };
  }
  // #/panels/:id
  if (parts[0] === 'panels' && parts[1]) {
    return { view: 'panel', panelId: decodeURIComponent(parts[1]) };
  }
  return { view: 'home' };
}

export default function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  const onChange = useCallback(() => setRoute(parseHash(window.location.hash)), []);

  useEffect(() => {
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [onChange]);

  return route;
}
