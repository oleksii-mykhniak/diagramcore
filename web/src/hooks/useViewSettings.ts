import { useEffect, useState } from 'react';

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

/** View-menu settings (PLAN.md step 10.5): Grid on/off and Snap to grid.
 * Each persisted under its own localStorage key so a page reload restores
 * the same view. (The YAML panel's own open/collapsed state moved to
 * PLAN3.md step 11.2 — it's now a RightDock tab, controlled by the
 * dock's own collapse toggle rather than a separate setting here.) */
export function useViewSettings() {
  const [grid, setGrid] = useState(() => readBool('dc.ui.grid', true));
  const [snap, setSnap] = useState(() => readBool('dc.ui.snap', false));
  const [showDescriptions, setShowDescriptions] = useState(() => readBool('dc.ui.showDescriptions', false));

  useEffect(() => localStorage.setItem('dc.ui.grid', String(grid)), [grid]);
  useEffect(() => localStorage.setItem('dc.ui.snap', String(snap)), [snap]);
  useEffect(() => localStorage.setItem('dc.ui.showDescriptions', String(showDescriptions)), [showDescriptions]);

  return {
    grid,
    toggleGrid: () => setGrid((g) => !g),
    snap,
    toggleSnap: () => setSnap((s) => !s),
    showDescriptions,
    toggleShowDescriptions: () => setShowDescriptions((d) => !d),
  };
}
