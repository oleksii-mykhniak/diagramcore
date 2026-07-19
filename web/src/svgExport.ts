import type { Diagram, DiagramLink, DiagramNoteDef } from './types';
import { nodeLabel } from './types';
import type { DiagramLayout, LayoutEdge, LayoutPoint } from './layout';
import type { LayoutEdgeStyle, LayoutPosition, LayoutStyle } from './layoutFile';
import { pairKey } from './flowPlayer';
import { edgeLinkKey, resolveEdgeStyle } from './edgeStyle';
import type { EdgeStyleOverride } from './edgeStyle';
import { renderContainerSvgInner, resolveNodeStyle } from './shapes';
import type { RenderStyle } from './shapes';
import { sketchLineD } from './sketch';
import { resolveDrawOrder } from './zOrder';

export interface FrameHighlight {
  activeStep?: { from: string; to: string };
  visitedStepKeys?: Set<string>;
}

export interface RenderOptions {
  /** Draws the same dotted background pattern the canvas shows when
   * View → Grid is on (PLAN.md step 10.9's "include grid" export option). */
  includeGrid?: boolean;
  /** Draws each node's `description` as a second, muted line under its
   * label — mirrors View → "Show descriptions" on the canvas (PLAN.md
   * step 10.11's "include descriptions" export option). */
  includeDescriptions?: boolean;
  /** Diagram style preset (PLAN.md step 10.12) — drawn identically to
   * whichever preset the canvas currently shows, via the same shape
   * registry/roughjs wrapper (`./shapes.ts`, `./sketch.ts`). */
  renderStyle?: RenderStyle;
  /** Instance-level edge style overrides (PLAN3.md step 11.9), keyed by
   * `edgeStyle.ts`'s `edgeLinkKey`. */
  edgeStyles?: Record<string, LayoutEdgeStyle>;
  /** Edge label drag offsets relative to the edge's own midpoint
   * (PLAN3.md step 11.9), keyed by link-key. */
  edgeLabelOffsets?: Record<string, LayoutPosition>;
  /** Link-keys whose label is individually hidden (PLAN3.md step 11.9). */
  hiddenEdgeLabels?: Set<string>;
  /** Link-keys whose whole connector is hidden (PLAN4.md step 12.7) —
   * skipped entirely, same as the canvas (Core view, step 12.8, doesn't
   * apply here: export always shows the normal, non-Core-view look). */
  hiddenEdges?: Set<string>;
  /** Node ids whose text label is hidden (PLAN4.md step 12.7) — the
   * shape still renders. */
  hiddenNodeLabels?: Set<string>;
  /** Node ids bottom-to-top (PLAN4.md step 12.9) — same resolve
   * (`resolveZOrder`) the canvas uses for RF `zIndex`, so draw order
   * never disagrees between the two. */
  zOrder?: string[];
  /** Custom node images (PLAN4.md step 12.10), keyed by the SAME
   * relative path `styles[id].image` holds, resolved to a data URL —
   * inlined as a self-contained `<image>` element (never a path, so
   * the exported SVG/PNG never depends on any external file). A node
   * whose `image` path has no entry here (not resolvable in this
   * session) draws its normal shape instead — never a crash. */
  images?: Record<string, string>;
  /** View → "Connection labels" show/hide-all (PLAN3.md step 11.9) —
   * defaults to showing every label with a non-empty `label`, same as
   * before this step. `dc context`/AI export never see this: they read
   * only `model.Diagram` (Go) / `Diagram` (web), never the layout file. */
  showEdgeLabels?: boolean;
}

export interface ThemeColors {
  nodeFill: string;
  nodeExternalFill: string;
  nodeBorder: string;
  flowActive: string;
  flowVisited: string;
  text: string;
}

/** Static fallback for environments without a live `theme.css` cascade
 * (vitest/jsdom) — same values as `:root[data-theme='light']` in
 * `theme.css`; keep the two in sync. */
const FALLBACK_THEME_COLORS: ThemeColors = {
  nodeFill: '#ffffff',
  nodeExternalFill: '#f5f5f5',
  nodeBorder: '#333333',
  flowActive: '#e04b4b',
  flowVisited: '#e08a4b',
  text: '#1a1a1e',
};

/** Reads the current theme's colors from computed CSS custom properties
 * (PLAN.md step 10.6), so the exported SVG always matches whichever
 * theme is active on screen — falls back to light-theme static values
 * when `getComputedStyle` can't see a real stylesheet (test environment). */
export function resolveThemeColors(): ThemeColors {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return FALLBACK_THEME_COLORS;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    nodeFill: read('--dc-node-fill', FALLBACK_THEME_COLORS.nodeFill),
    nodeExternalFill: read('--dc-node-external-fill', FALLBACK_THEME_COLORS.nodeExternalFill),
    nodeBorder: read('--dc-node-border', FALLBACK_THEME_COLORS.nodeBorder),
    flowActive: read('--dc-flow-active', FALLBACK_THEME_COLORS.flowActive),
    flowVisited: read('--dc-flow-visited', FALLBACK_THEME_COLORS.flowVisited),
    text: read('--dc-text', FALLBACK_THEME_COLORS.text),
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pointsToPath(points: LayoutPoint[], reversed: boolean): string {
  const ordered = reversed ? [...points].reverse() : points;
  return ordered.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function edgeForStep(edges: LayoutEdge[], step: { from: string; to: string }): LayoutEdge | undefined {
  const key = pairKey(step.from, step.to);
  return edges.find((e) => pairKey(e.from, e.to) === key);
}

/** SVG `<marker>` def for one end of one edge (PLAN3.md step 11.9) — a
 * closed/filled triangle for `'arrow'` (the pre-11.9 default look,
 * preserved exactly), an open unfilled chevron for `'open-arrow'`.
 * `'none'` never calls this (callers skip both the def and the
 * `marker-start`/`marker-end` attribute entirely). */
function markerDef(id: string, kind: 'arrow' | 'open-arrow', color: string): string {
  if (kind === 'arrow') {
    return `<marker id="${id}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${color}" /></marker>`;
  }
  return `<marker id="${id}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="none" stroke="${color}" stroke-width="1.5" /></marker>`;
}

/** The point exactly (or, for an even count, midway between the two
 * points) at the middle of an edge's routed polyline — the export
 * equivalent of the canvas's `getSmoothStepPath` midpoint, used as the
 * label's un-dragged anchor. */
function edgeMidpoint(points: LayoutPoint[]): LayoutPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  const mid = (points.length - 1) / 2;
  const lo = points[Math.floor(mid)];
  const hi = points[Math.ceil(mid)];
  return { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
}

function renderEdgeLabelSvg(
  points: LayoutPoint[],
  offset: LayoutPosition | undefined,
  label: string,
  color: string,
  text?: EdgeStyleOverride['text'],
): string {
  const mid = edgeMidpoint(points);
  const x = mid.x + (offset?.x ?? 0);
  const y = mid.y + (offset?.y ?? 0);
  // Same resolve as the canvas (PLAN4.md step 12.5) — `align` doesn't
  // apply to an edge label (no meaningful axis), so it's never read here.
  const fontSize = text?.fontSize ?? 12;
  const fontWeight = text?.bold ? 'bold' : 'normal';
  const fontStyle = text?.italic ? 'italic' : 'normal';
  const fill = text?.color ?? color;
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" font-family="system-ui, sans-serif" fill="${fill}">${esc(label)}</text>`;
}

/** Renders diagram + layout + positions to a standalone SVG string, with
 * the same visual rules as the on-screen canvas (active/visited flow
 * steps, details markers) — used for PNG export, where we need a
 * self-contained SVG document rather than a live DOM node. */
export function renderDiagramSVGString(
  diagram: Diagram,
  layout: DiagramLayout,
  positions: Record<string, LayoutPosition>,
  highlight: FrameHighlight = {},
  options: RenderOptions = {},
  notes: DiagramNoteDef[] = [],
  notePositions: Record<string, LayoutPosition> = {},
  styles: Record<string, LayoutStyle> = {},
): string {
  const labelById = new Map(diagram.nodes.map((n) => [n.id, nodeLabel(n)]));
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const activeKey = highlight.activeStep ? pairKey(highlight.activeStep.from, highlight.activeStep.to) : null;
  const theme = resolveThemeColors();

  const gridPatternDef = options.includeGrid
    ? `<pattern id="dc-grid" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${theme.nodeBorder}" opacity="0.35" /></pattern>`
    : '';
  const gridRect = options.includeGrid
    ? `<rect width="${layout.width}" height="${layout.height}" fill="url(#dc-grid)" />`
    : '';

  const hiddenEdgeLabels = options.hiddenEdgeLabels ?? new Set<string>();
  const hiddenEdges = options.hiddenEdges ?? new Set<string>();
  const hiddenNodeLabels = options.hiddenNodeLabels ?? new Set<string>();
  const showEdgeLabels = options.showEdgeLabels ?? true;

  let markerDefsSvg = '';
  const edgesSvg = layout.edges
    .filter((e) => {
      const link: DiagramLink | undefined = diagram.links[Number((e.id ?? '').slice(1))];
      return !link || !hiddenEdges.has(edgeLinkKey(link));
    })
    .map((e, edgeSlot) => {
      const key = pairKey(e.from, e.to);
      const isActive = key === activeKey;
      const isVisited = !isActive && (highlight.visitedStepKeys?.has(key) ?? false);
      const link: DiagramLink | undefined = diagram.links[Number((e.id ?? '').slice(1))];
      const override = link ? options.edgeStyles?.[edgeLinkKey(link)] : undefined;
      const resolved = resolveEdgeStyle(override);

      const stroke = isActive ? theme.flowActive : isVisited ? theme.flowVisited : (resolved.color ?? theme.nodeBorder);
      const width = isActive ? 3 : isVisited ? 2 : (resolved.strokeWidth ?? 1.5);
      const dash = resolved.lineStyle === 'dashed' ? '6,4' : resolved.lineStyle === 'dotted' ? '2,3' : undefined;
      const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';

      const markerEndId = `dc-marker-end-${edgeSlot}`;
      const markerStartId = `dc-marker-start-${edgeSlot}`;
      if (resolved.markerEnd !== 'none') markerDefsSvg += markerDef(markerEndId, resolved.markerEnd, stroke);
      if (resolved.markerStart !== 'none') markerDefsSvg += markerDef(markerStartId, resolved.markerStart, stroke);
      const markerEndAttr = resolved.markerEnd !== 'none' ? ` marker-end="url(#${markerEndId})"` : '';
      const markerStartAttr = resolved.markerStart !== 'none' ? ` marker-start="url(#${markerStartId})"` : '';

      let pathSvg: string;
      if (options.renderStyle === 'sketch') {
        const d = sketchLineD(e.points.map((p) => [p.x, p.y]));
        pathSvg = `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"${dashAttr}${markerEndAttr}${markerStartAttr} />`;
      } else {
        const points = e.points.map((p) => `${p.x},${p.y}`).join(' ');
        pathSvg = `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${width}"${dashAttr}${markerEndAttr}${markerStartAttr} />`;
      }

      const label = link?.label;
      const labelKey = link ? edgeLinkKey(link) : null;
      const labelSvg =
        label && showEdgeLabels && (!labelKey || !hiddenEdgeLabels.has(labelKey))
          ? renderEdgeLabelSvg(e.points, labelKey ? options.edgeLabelOffsets?.[labelKey] : undefined, label, theme.text, resolved.text)
          : '';

      return pathSvg + labelSvg;
    })
    .join('');

  let markerSvg = '';
  if (highlight.activeStep) {
    const activeEdge = edgeForStep(layout.edges, highlight.activeStep);
    if (activeEdge) {
      const reversed = activeEdge.from !== highlight.activeStep.from;
      markerSvg = `<circle r="5" fill="${theme.flowActive}"><animateMotion dur="1.2s" repeatCount="indefinite" path="${pointsToPath(activeEdge.points, reversed)}" /></circle>`;
    }
  }

  // Container ids (PLAN3.md step 11.6): any node referenced by another
  // node's resolved `parent`, drawn via `renderContainerSvgInner`
  // instead of its own dc-type shape — same function the canvas's
  // `ContainerNode` uses, so a container never looks different between
  // the two.
  const containerIds = new Set(layout.nodes.map((n) => n.parent).filter((p): p is string => Boolean(p)));

  // Draw order (PLAN4.md step 12.9): `layout.nodes` is already
  // parent-before-child (see `layout.ts`'s `collectNodes`), which alone
  // keeps every container behind its children; `resolveDrawOrder` layers
  // `zOrder` on top, reordering only within each level's siblings, same
  // resolve the canvas uses for its `zIndex`.
  const layoutNodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const orderedNodes = resolveDrawOrder(layout.nodes, options.zOrder ?? []).map((id) => layoutNodeById.get(id)!);

  const nodesSvg = orderedNodes
    .map((n) => {
      const pos = positions[n.id] ?? n;
      const dcNode = nodeById.get(n.id);
      if (containerIds.has(n.id)) {
        const label = labelById.get(n.id) ?? n.id;
        return `<g transform="translate(${pos.x},${pos.y})">${renderContainerSvgInner(n.width, n.height, label, { stroke: theme.nodeBorder })}</g>`;
      }
      const hasDetails = Boolean(dcNode?.details);
      const label = esc(labelById.get(n.id) ?? n.id) + (hasDetails ? ' ⊞' : '');
      const resolved = resolveNodeStyle(diagram, dcNode?.type ?? 'component', styles[n.id]);
      const shape = resolved.shape;
      const fill = resolved.fill ?? (dcNode?.type === 'external' ? theme.nodeExternalFill : theme.nodeFill);
      const inner = hasDetails
        ? `<rect x="3" y="3" width="${n.width - 6}" height="${n.height - 6}" rx="4" fill="none" stroke="${theme.nodeBorder}" stroke-width="1" />`
        : '';
      const description = options.includeDescriptions ? dcNode?.description : undefined;
      const labelY = description ? n.height / 2 - 7 : n.height / 2;
      const descriptionSvg = description
        ? `<text x="${n.width / 2}" y="${n.height / 2 + 9}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-family="system-ui, sans-serif" fill="${theme.text}" opacity="0.65">${esc(description)}</text>`
        : '';
      // Instance text style (PLAN4.md step 12.5) — same resolve as the
      // canvas (`resolveNodeStyle`'s `text`), so font-size/weight/style/
      // color/align never render differently between the two. `align`
      // moves both the anchor and the x coordinate so the text still
      // sits inside the node's padding instead of clipping at the edge.
      const textPad = 8;
      const align = resolved.text?.align ?? 'center';
      const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
      const textX = align === 'left' ? textPad : align === 'right' ? n.width - textPad : n.width / 2;
      const fontSize = resolved.text?.fontSize ?? 13;
      const fontWeight = resolved.text?.bold ? 'bold' : 'normal';
      const fontStyle = resolved.text?.italic ? 'italic' : 'normal';
      const textFill = resolved.text?.color ?? theme.text;
      // "Hide label" (PLAN4.md step 12.7) — shape only, no text.
      const hideLabel = hiddenNodeLabels.has(n.id);
      // Custom image (PLAN4.md step 12.10) — same "draws instead of the
      // shape, label as a caption underneath" layout as the canvas
      // (`rfNodeTypes.tsx`'s `NodeShell`). `options.images` already
      // holds a data URL (never a bare path), so the export stays
      // self-contained.
      const imageDataUrl = resolved.image ? options.images?.[resolved.image] : undefined;
      const captionHeight = hideLabel ? 0 : 18;
      const imageSvg = imageDataUrl
        ? `<image href="${imageDataUrl}" x="0" y="0" width="${n.width}" height="${n.height - captionHeight}" preserveAspectRatio="xMidYMid meet" />`
        : '';
      const imageLabelSvg =
        imageDataUrl && !hideLabel
          ? `<text x="${n.width / 2}" y="${n.height - captionHeight / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" font-family="system-ui, sans-serif" fill="${textFill}">${label}</text>`
          : '';
      const labelSvg = hideLabel
        ? ''
        : `<text x="${textX}" y="${labelY}" text-anchor="${textAnchor}" dominant-baseline="middle" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" font-family="system-ui, sans-serif" fill="${textFill}">${label}</text>`;
      if (imageDataUrl) {
        return `<g transform="translate(${pos.x},${pos.y})">${imageSvg}${imageLabelSvg}</g>`;
      }
      return (
        `<g transform="translate(${pos.x},${pos.y})">` +
        shape.renderSvgInner(n.width, n.height, {
          fill,
          stroke: resolved.stroke ?? theme.nodeBorder,
          strokeWidth: hasDetails ? 3 : (resolved.strokeWidth ?? 1.5),
          renderStyle: options.renderStyle,
          lineStyle: resolved.lineStyle,
          rounded: resolved.rounded,
        }) +
        inner +
        labelSvg +
        descriptionSvg +
        `</g>`
      );
    })
    .join('');

  const notesSvg = notes
    .map((note) => {
      const pos = notePositions[note.id] ?? { x: 0, y: 0 };
      const lines = note.text.split('\n');
      const tspans = lines
        .map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 16}">${esc(line)}</tspan>`)
        .join('');
      return `<text x="${pos.x}" y="${pos.y + 12}" font-size="13" font-family="system-ui, sans-serif" fill="${theme.text}">${tspans}</text>`;
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">` +
    `<defs>${markerDefsSvg}${gridPatternDef}</defs>` +
    gridRect +
    edgesSvg +
    markerSvg +
    nodesSvg +
    notesSvg +
    `</svg>`
  );
}

export type RasterBackground = 'transparent' | 'white' | 'theme';

export interface RasterOptions {
  scale?: number;
  background?: RasterBackground;
  mime?: 'image/png' | 'image/jpeg';
  quality?: number;
}

/** Rasterizes an SVG string to a Blob via an offscreen `<canvas>`
 * (PLAN.md step 10.9 — generalized from the PNG-only `svgStringToPngBlob`
 * to also support JPG, a scale multiplier, and a configurable
 * background). `viewBox` is left untouched — only the canvas pixel size
 * changes, so `scale: 2` doubles the decoded image's width/height. JPEG
 * has no alpha channel, so a `'transparent'` background falls back to
 * white for it. */
export async function svgStringToRasterBlob(
  svgString: string,
  width: number,
  height: number,
  options: RasterOptions = {},
): Promise<Blob> {
  const scale = options.scale ?? 1;
  const mime = options.mime ?? 'image/png';
  let background = options.background ?? 'white';
  if (mime === 'image/jpeg' && background === 'transparent') background = 'white';

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('failed to rasterize SVG for image export'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2D context unavailable');
    if (background !== 'transparent') {
      ctx.fillStyle = background === 'theme' ? resolveThemeColors().nodeFill : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, options.quality ?? 0.92),
    );
    if (!blob) throw new Error('canvas.toBlob produced no image data');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}


export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
