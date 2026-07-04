import { useEffect, useState } from 'react';

const DEFAULT_YAML_PANEL_HEIGHT = 240;
const MIN_YAML_PANEL_HEIGHT = 80;
const MAX_YAML_PANEL_HEIGHT = 600;

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** View-menu settings (PLAN.md step 10.5): Grid on/off, Snap to grid, and
 * the YAML panel's open/collapsed state + resized height. Each persisted
 * under its own localStorage key so a page reload restores the same view. */
export function useViewSettings() {
  const [grid, setGrid] = useState(() => readBool('dc.ui.grid', true));
  const [snap, setSnap] = useState(() => readBool('dc.ui.snap', false));
  const [yamlPanelOpen, setYamlPanelOpen] = useState(() => localStorage.getItem('dc.ui.yamlPanel') !== 'collapsed');
  const [yamlPanelHeight, setYamlPanelHeightState] = useState(() =>
    readNumber('dc.ui.yamlPanelHeight', DEFAULT_YAML_PANEL_HEIGHT),
  );

  useEffect(() => localStorage.setItem('dc.ui.grid', String(grid)), [grid]);
  useEffect(() => localStorage.setItem('dc.ui.snap', String(snap)), [snap]);
  useEffect(
    () => localStorage.setItem('dc.ui.yamlPanel', yamlPanelOpen ? 'open' : 'collapsed'),
    [yamlPanelOpen],
  );
  useEffect(
    () => localStorage.setItem('dc.ui.yamlPanelHeight', String(yamlPanelHeight)),
    [yamlPanelHeight],
  );

  const setYamlPanelHeight = (height: number) => {
    setYamlPanelHeightState(Math.min(MAX_YAML_PANEL_HEIGHT, Math.max(MIN_YAML_PANEL_HEIGHT, height)));
  };

  return {
    grid,
    toggleGrid: () => setGrid((g) => !g),
    snap,
    toggleSnap: () => setSnap((s) => !s),
    yamlPanelOpen,
    toggleYamlPanel: () => setYamlPanelOpen((o) => !o),
    yamlPanelHeight,
    setYamlPanelHeight,
  };
}
