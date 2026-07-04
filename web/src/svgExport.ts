import type { Diagram, DiagramNoteDef } from './types';
import { nodeLabel } from './types';
import type { DiagramLayout, LayoutEdge, LayoutPoint } from './layout';
import type { LayoutPosition } from './layoutFile';
import { pairKey } from './flowPlayer';
import { nodeVisual, renderContainerSvgInner } from './shapes';
import type { RenderStyle } from './shapes';
import { sketchLineD } from './sketch';

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

  const edgesSvg = layout.edges
    .map((e) => {
      const key = pairKey(e.from, e.to);
      const isActive = key === activeKey;
      const isVisited = !isActive && (highlight.visitedStepKeys?.has(key) ?? false);
      const stroke = isActive ? theme.flowActive : isVisited ? theme.flowVisited : theme.nodeBorder;
      const width = isActive ? 3 : isVisited ? 2 : 1.5;
      if (options.renderStyle === 'sketch') {
        const d = sketchLineD(e.points.map((p) => [p.x, p.y]));
        return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" marker-end="url(#arrow)" />`;
      }
      const points = e.points.map((p) => `${p.x},${p.y}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${width}" marker-end="url(#arrow)" />`;
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
  // the two. `layout.nodes` is already parent-before-child order (see
  // `layout.ts`'s `collectNodes`), so painting in that order alone
  // already keeps every container behind its children.
  const containerIds = new Set(layout.nodes.map((n) => n.parent).filter((p): p is string => Boolean(p)));

  const nodesSvg = layout.nodes
    .map((n) => {
      const pos = positions[n.id] ?? n;
      const dcNode = nodeById.get(n.id);
      if (containerIds.has(n.id)) {
        const label = labelById.get(n.id) ?? n.id;
        return `<g transform="translate(${pos.x},${pos.y})">${renderContainerSvgInner(n.width, n.height, label, { stroke: theme.nodeBorder })}</g>`;
      }
      const hasDetails = Boolean(dcNode?.details);
      const label = esc(labelById.get(n.id) ?? n.id) + (hasDetails ? ' ⊞' : '');
      const visual = nodeVisual(diagram, dcNode?.type ?? 'component');
      const shape = visual.shape;
      const fill = visual.color ?? (dcNode?.type === 'external' ? theme.nodeExternalFill : theme.nodeFill);
      const inner = hasDetails
        ? `<rect x="3" y="3" width="${n.width - 6}" height="${n.height - 6}" rx="4" fill="none" stroke="${theme.nodeBorder}" stroke-width="1" />`
        : '';
      const description = options.includeDescriptions ? dcNode?.description : undefined;
      const labelY = description ? n.height / 2 - 7 : n.height / 2;
      const descriptionSvg = description
        ? `<text x="${n.width / 2}" y="${n.height / 2 + 9}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-family="system-ui, sans-serif" fill="${theme.text}" opacity="0.65">${esc(description)}</text>`
        : '';
      return (
        `<g transform="translate(${pos.x},${pos.y})">` +
        shape.renderSvgInner(n.width, n.height, {
          fill,
          stroke: theme.nodeBorder,
          strokeWidth: hasDetails ? 3 : 1.5,
          renderStyle: options.renderStyle,
        }) +
        inner +
        `<text x="${n.width / 2}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-family="system-ui, sans-serif" fill="${theme.text}">${label}</text>` +
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
    `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${theme.nodeBorder}" /></marker>${gridPatternDef}</defs>` +
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
