// Mirrors internal/layout (Go) and docs/format.md's <name>.layout.json
// format, so files exported here are readable by `dc render` and vice
// versa.

export interface LayoutPosition {
  x: number;
  y: number;
}

export type RenderStyle = 'clean' | 'sketch';

export interface LayoutFile {
  views: {
    [view: string]: {
      positions: Record<string, LayoutPosition>;
      /** Note positions (PLAN.md step 10.11) — separate from `positions`
       * since notes aren't diagram nodes. */
      notePositions?: Record<string, LayoutPosition>;
    };
  };
  /** Diagram style preset (PLAN.md step 10.12) — top-level, not per-view,
   * since it's how the whole diagram is drawn rather than a layout
   * detail; omitted (defaulting to 'clean') when never changed. */
  renderStyle?: RenderStyle;
}

export const DEFAULT_VIEW = 'default';

export function buildLayoutFile(
  positions: Record<string, LayoutPosition>,
  notePositions?: Record<string, LayoutPosition>,
  renderStyle?: RenderStyle,
): LayoutFile {
  return {
    views: {
      [DEFAULT_VIEW]: notePositions ? { positions, notePositions } : { positions },
    },
    ...(renderStyle && renderStyle !== 'clean' ? { renderStyle } : {}),
  };
}

export function parseLayoutFile(text: string): LayoutFile {
  const parsed = JSON.parse(text) as Partial<LayoutFile>;
  if (!parsed.views || typeof parsed.views !== 'object') {
    throw new Error('Invalid layout file: missing "views"');
  }
  return parsed as LayoutFile;
}

/** <name>.dc.yaml -> <name>.layout.json, matching internal/layout.PathFor. */
export function layoutFileName(diagramFileName: string): string {
  if (diagramFileName.endsWith('.dc.yaml')) {
    return diagramFileName.slice(0, -'.dc.yaml'.length) + '.layout.json';
  }
  return diagramFileName + '.layout.json';
}

export function downloadLayoutFile(fileName: string, file: LayoutFile) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Revoke on the next tick so the browser has time to start the download
  // before the blob URL is invalidated.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
