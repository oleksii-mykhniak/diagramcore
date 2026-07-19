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

/** An instance-level edge style override (PLAN3.md step 11.9) — mirrors
 * `edgeStyle.ts`'s `EdgeStyleOverride`. Keyed by `edgeLinkKey` in the
 * `edgeStyles`/`edgeLabelOffsets` maps below, since links have no
 * explicit id in the format. */
export interface LayoutEdgeStyle {
  markerStart?: 'none' | 'arrow' | 'open-arrow';
  markerEnd?: 'none' | 'arrow' | 'open-arrow';
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  strokeWidth?: number;
  color?: string;
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
      /** Instance-level node style overrides (PLAN3.md step 11.8) — only
       * nodes the user actually styled get an entry. */
      styles?: Record<string, LayoutStyle>;
      /** Instance-level edge style overrides (PLAN3.md step 11.9) — only
       * edges the user actually styled get an entry. */
      edgeStyles?: Record<string, LayoutEdgeStyle>;
      /** Edge label drag offsets, relative to the edge's own midpoint
       * (PLAN3.md step 11.9) — only labels the user actually dragged
       * get an entry. */
      edgeLabelOffsets?: Record<string, LayoutPosition>;
      /** Edge link-keys whose label is individually hidden (PLAN3.md
       * step 11.9), independent of the global "Connection labels"
       * show/hide-all view setting. */
      hiddenEdgeLabels?: string[];
    };
  };
  /** Diagram style preset (PLAN.md step 10.12) — top-level, not per-view,
   * since it's how the whole diagram is drawn rather than a layout
   * detail; omitted (defaulting to 'clean') when never changed. */
  renderStyle?: RenderStyle;
}

export const DEFAULT_VIEW = 'default';

export interface BuildLayoutFileInput {
  positions: Record<string, LayoutPosition>;
  notePositions?: Record<string, LayoutPosition>;
  renderStyle?: RenderStyle;
  sizes?: Record<string, LayoutSize>;
  styles?: Record<string, LayoutStyle>;
  edgeStyles?: Record<string, LayoutEdgeStyle>;
  edgeLabelOffsets?: Record<string, LayoutPosition>;
  hiddenEdgeLabels?: string[];
}

export function buildLayoutFile(input: BuildLayoutFileInput): LayoutFile {
  const { positions, notePositions, renderStyle, sizes, styles, edgeStyles, edgeLabelOffsets, hiddenEdgeLabels } = input;
  return {
    views: {
      [DEFAULT_VIEW]: {
        positions,
        ...(notePositions ? { notePositions } : {}),
        ...(sizes && Object.keys(sizes).length > 0 ? { sizes } : {}),
        ...(styles && Object.keys(styles).length > 0 ? { styles } : {}),
        ...(edgeStyles && Object.keys(edgeStyles).length > 0 ? { edgeStyles } : {}),
        ...(edgeLabelOffsets && Object.keys(edgeLabelOffsets).length > 0 ? { edgeLabelOffsets } : {}),
        ...(hiddenEdgeLabels && hiddenEdgeLabels.length > 0 ? { hiddenEdgeLabels } : {}),
      },
    },
    ...(renderStyle && renderStyle !== 'clean' ? { renderStyle } : {}),
  };
}

/** The subset of `DiagramLevel` (`hooks/useDiagramStack.ts`) needed to
 * build a `LayoutFile` — a structural (not imported) type, since
 * `layoutFile.ts` shouldn't depend on the hooks layer. Every "produce a
 * layout file from the current level" call site (`onSave`,
 * `onExportLayout`, `onShare`) goes through `buildLayoutFileFromLevel`
 * instead of repeating this field-by-field mapping. */
export interface LayoutFileSource {
  positions: Record<string, LayoutPosition>;
  notePositions: Record<string, LayoutPosition>;
  renderStyle: RenderStyle;
  sizes: Record<string, { width: number; height: number }>;
  styles: Record<string, LayoutStyle>;
  edgeStyles: Record<string, LayoutEdgeStyle>;
  edgeLabelOffsets: Record<string, LayoutPosition>;
  hiddenEdgeLabels: Set<string>;
}

export function buildLayoutFileFromLevel(level: LayoutFileSource): LayoutFile {
  return buildLayoutFile({
    positions: level.positions,
    notePositions: level.notePositions,
    renderStyle: level.renderStyle,
    sizes: toLayoutSizes(level.sizes),
    styles: level.styles,
    edgeStyles: level.edgeStyles,
    edgeLabelOffsets: level.edgeLabelOffsets,
    hiddenEdgeLabels: Array.from(level.hiddenEdgeLabels),
  });
}

/** Deterministic JSON serialization (object keys sorted at every level)
 * of a `LayoutFileSource` — PLAN4.md step 12.3's dirty-state snapshot
 * needs to compare "layout at last save/open" against "layout right
 * now" by value, and two structurally-identical layouts built through
 * different edit paths (e.g. spreading `styles` in a different order)
 * must still compare equal — plain `JSON.stringify` doesn't guarantee
 * that, since it preserves each object's own key insertion order. */
export function layoutSnapshotOf(level: LayoutFileSource): string {
  return JSON.stringify(buildLayoutFileFromLevel(level), (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (value as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return value;
  });
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
