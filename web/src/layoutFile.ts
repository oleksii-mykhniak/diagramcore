// Mirrors internal/layout (Go) and docs/format.md's <name>.layout.json
// format, so files exported here are readable by `dc render` and vice
// versa.

export interface LayoutPosition {
  x: number;
  y: number;
}

/** A manually-resized node's dimensions (PLAN3.md step 11.4) — mirrors
 * `internal/layout.Size` (Go), keys `w`/`h` to match its JSON tags. */
export interface LayoutSize {
  w: number;
  h: number;
}

export type RenderStyle = 'clean' | 'sketch';

/** An instance-level node style override (PLAN3.md step 11.8) — mirrors
 * `shapes.ts`'s `StyleOverride`, kept as its own small type here (like
 * `LayoutSize`) since `layoutFile.ts` doesn't otherwise depend on
 * `shapes.ts`. */
export interface LayoutStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  rounded?: boolean;
}

export interface LayoutFile {
  views: {
    [view: string]: {
      positions: Record<string, LayoutPosition>;
      /** Note positions (PLAN.md step 10.11) — separate from `positions`
       * since notes aren't diagram nodes. */
      notePositions?: Record<string, LayoutPosition>;
      /** Manually-resized node dimensions (PLAN3.md step 11.4) — only
       * nodes the user actually resized get an entry; everything else
       * keeps the auto-layout default size. */
      sizes?: Record<string, LayoutSize>;
      /** Instance-level style overrides (PLAN3.md step 11.8) — only
       * nodes the user actually styled get an entry. */
      styles?: Record<string, LayoutStyle>;
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
  sizes?: Record<string, LayoutSize>,
  styles?: Record<string, LayoutStyle>,
): LayoutFile {
  return {
    views: {
      [DEFAULT_VIEW]: {
        positions,
        ...(notePositions ? { notePositions } : {}),
        ...(sizes && Object.keys(sizes).length > 0 ? { sizes } : {}),
        ...(styles && Object.keys(styles).length > 0 ? { styles } : {}),
      },
    },
    ...(renderStyle && renderStyle !== 'clean' ? { renderStyle } : {}),
  };
}

/** `DiagramLevel.sizes` (`{width,height}`) <-> `LayoutFile`'s `{w,h}` —
 * the level keeps the verbose, self-documenting shape; the file keeps
 * the terse one `internal/layout.Size` (Go) already committed to. */
export function toLayoutSizes(sizes: Record<string, { width: number; height: number }>): Record<string, LayoutSize> {
  return Object.fromEntries(Object.entries(sizes).map(([id, s]) => [id, { w: s.width, h: s.height }]));
}

export function fromLayoutSizes(sizes?: Record<string, LayoutSize>): Record<string, { width: number; height: number }> {
  return Object.fromEntries(Object.entries(sizes ?? {}).map(([id, s]) => [id, { width: s.w, height: s.h }]));
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
