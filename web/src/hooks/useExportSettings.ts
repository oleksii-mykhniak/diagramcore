import { useEffect, useState } from 'react';
import type { RasterBackground } from '../svgExport';

export type ExportFormat = 'png' | 'jpg' | 'svg';

export interface ExportSettings {
  format: ExportFormat;
  scale: 1 | 2 | 4;
  background: RasterBackground;
  includeGrid: boolean;
}

const STORAGE_KEY = 'dc.ui.exportSettings';

const DEFAULTS: ExportSettings = {
  format: 'png',
  scale: 1,
  background: 'white',
  includeGrid: false,
};

function read(): ExportSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

/** Export dialog settings (PLAN.md step 10.9), persisted so the dialog
 * (and "Export flow steps (zip)", which reuses the same settings)
 * remembers the last choice across reloads. */
export function useExportSettings() {
  const [settings, setSettings] = useState<ExportSettings>(read);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const update = (patch: Partial<ExportSettings>) => setSettings((s) => ({ ...s, ...patch }));

  return { settings, update };
}
