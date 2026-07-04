/** Single shape registry (PLAN.md step 10.6): the canvas (`rfNodeTypes.tsx`)
 * and SVG export (`svgExport.ts`) both draw a node's outline through
 * `renderSvgInner` — so "what a storage node looks like" is defined in
 * exactly one place, and canvas/export can never drift apart. */
import { sketchEllipse, sketchPath, sketchPolygon, sketchRect } from './sketch';

export type RenderStyle = 'clean' | 'sketch';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Diagram style preset (PLAN.md step 10.12) — 'clean' (default) draws
   * the crisp vector outline below; 'sketch' roughens the same geometry
   * via roughjs (see `./sketch.ts`) so canvas and export stay identical
   * under either preset. */
  renderStyle?: RenderStyle;
  /** Instance/type-level style overrides (PLAN3.md step 11.8) — when
   * set, replaces whatever dash pattern/corner radius the shape itself
   * would otherwise draw. Only `rectShape`-based shapes honor `rounded`
   * (the others have no meaningful "corner" to round). */
  lineStyle?: LineStyle;
  rounded?: boolean;
}

/** `lineStyle` -> SVG `stroke-dasharray`, or `fallback` (the shape's own
 * built-in dash pattern, if any) when unset — so an instance/type
 * override always wins over a shape's default (e.g. `external`'s
 * built-in dashed outline), but leaving it unset preserves that default. */
function resolveDashArray(lineStyle: LineStyle | undefined, fallback?: string): string | undefined {
  switch (lineStyle) {
    case 'solid':
      return undefined;
    case 'dashed':
      return '6,4';
    case 'dotted':
      return '2,3';
    default:
      return fallback;
  }
}

export interface ShapeSpec {
  name: string;
  /** Inner SVG markup (no wrapping `<svg>`/`<g transform>`) for a shape
   * sized to (w, h), starting at (0, 0). */
  renderSvgInner(w: number, h: number, style: ShapeStyle): string;
}

function rectShape(rx: number, dashArray?: string): ShapeSpec['renderSvgInner'] {
  return (w, h, s) => {
    const effectiveRx = s.rounded === undefined ? rx : s.rounded ? Math.max(rx, 8) : 0;
    const effectiveDash = resolveDashArray(s.lineStyle, dashArray);
    if (s.renderStyle === 'sketch') return sketchRect(0.5, 0.5, w - 1, h - 1, s, effectiveDash);
    return `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${effectiveRx}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${effectiveDash ? ` stroke-dasharray="${effectiveDash}"` : ''} />`;
  };
}

const ellipseInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const dash = resolveDashArray(s.lineStyle);
  if (s.renderStyle === 'sketch') return sketchEllipse(w / 2, h / 2, w - 2, h - 2, s);
  return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 1}" ry="${h / 2 - 1}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
};

const storageInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const rx = w / 2 - 1;
  const ry = Math.min(10, h / 4);
  const top = ry;
  const bottom = h - ry - 1;
  const bodyPath = `M1,${top} A${rx},${ry} 0 0 1 ${w - 1},${top} L${w - 1},${bottom} A${rx},${ry} 0 0 1 1,${bottom} Z`;
  const dash = resolveDashArray(s.lineStyle);
  if (s.renderStyle === 'sketch') {
    return sketchPath(bodyPath, s, dash) + sketchEllipse(w / 2, top, rx * 2, ry * 2, s);
  }
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
  return (
    `<path d="${bodyPath}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dashAttr} />` +
    `<ellipse cx="${w / 2}" cy="${top}" rx="${rx}" ry="${ry}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dashAttr} />`
  );
};

const diamondInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const points: [number, number][] = [
    [w / 2, 1],
    [w - 1, h / 2],
    [w / 2, h - 1],
    [1, h / 2],
  ];
  const dash = resolveDashArray(s.lineStyle);
  if (s.renderStyle === 'sketch') return sketchPolygon(points, s);
  return `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
};

const parallelogramInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const skew = w * 0.18;
  const points: [number, number][] = [
    [skew, 1],
    [w - 1, 1],
    [w - 1 - skew, h - 1],
    [1, h - 1],
  ];
  const dash = resolveDashArray(s.lineStyle);
  if (s.renderStyle === 'sketch') return sketchPolygon(points, s);
  return `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
};

const hexagonInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const cut = Math.min(w * 0.15, 24);
  const points: [number, number][] = [
    [cut, 1],
    [w - cut, 1],
    [w - 1, h / 2],
    [w - cut, h - 1],
    [cut, h - 1],
    [1, h / 2],
  ];
  const dash = resolveDashArray(s.lineStyle);
  if (s.renderStyle === 'sketch') return sketchPolygon(points, s);
  return `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
};

const cloudInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  // A rounded-blob approximation via a smooth closed cubic-bezier path —
  // not a pixel-perfect cloud, just visually distinct from every other shape.
  const path =
    `M${w * 0.25},${h * 0.75} ` +
    `C${w * 0.05},${h * 0.75} ${w * 0.02},${h * 0.4} ${w * 0.22},${h * 0.35} ` +
    `C${w * 0.22},${h * 0.1} ${w * 0.55},${h * 0.05} ${w * 0.62},${h * 0.28} ` +
    `C${w * 0.85},${h * 0.18} ${w * 0.98},${h * 0.42} ${w * 0.82},${h * 0.58} ` +
    `C${w * 0.98},${h * 0.68} ${w * 0.9},${h * 0.92} ${w * 0.68},${h * 0.9} ` +
    `C${w * 0.6},${h * 1.05} ${w * 0.3},${h * 1.02} ${w * 0.25},${h * 0.75} Z`;
  const dash = resolveDashArray(s.lineStyle);
  if (s.renderStyle === 'sketch') return sketchPath(path, s, dash);
  return `<path d="${path}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`;
};

const baseShapes: Record<string, ShapeSpec> = {
  actor: { name: 'actor', renderSvgInner: ellipseInner },
  service: { name: 'service', renderSvgInner: rectShape(6) },
  storage: { name: 'storage', renderSvgInner: storageInner },
  queue: { name: 'queue', renderSvgInner: rectShape(0, '6,4') },
  external: { name: 'external', renderSvgInner: rectShape(6, '1.5,3') },
  component: { name: 'component', renderSvgInner: rectShape(2) },
};

const extraShapes: Record<string, ShapeSpec> = {
  hexagon: { name: 'hexagon', renderSvgInner: hexagonInner },
  diamond: { name: 'diamond', renderSvgInner: diamondInner },
  ellipse: { name: 'ellipse', renderSvgInner: ellipseInner },
  cloud: { name: 'cloud', renderSvgInner: cloudInner },
  parallelogram: { name: 'parallelogram', renderSvgInner: parallelogramInner },
};

export const shapeRegistry: Record<string, ShapeSpec> = { ...baseShapes, ...extraShapes };

/** Falls back to `component` for any name not in the registry (custom
 * types without an explicit `shape`, or an unrecognized one — PLAN.md
 * step 10.8 fixes this NOT being an error). */
export function resolveShape(name: string): ShapeSpec {
  return shapeRegistry[name] ?? baseShapes.component;
}

export interface NodeVisual {
  shape: ShapeSpec;
  color?: string;
  icon?: string;
  /** Type-level style extensions (PLAN3.md step 11.5/11.8) — from
   * `custom_types`, one tier below an instance override. */
  stroke?: string;
  strokeWidth?: number;
  lineStyle?: LineStyle;
  rounded?: boolean;
}

interface CustomTypeLike {
  name: string;
  shape?: string;
  color?: string;
  icon?: string;
  stroke?: string;
  strokeWidth?: number;
  lineStyle?: LineStyle;
  rounded?: boolean;
}

interface DiagramLike {
  diagram: {
    custom_types?: (string | CustomTypeLike)[];
  };
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Draws a container node — a node with `parent:` children (PLAN3.md
 * step 11.6): a dashed, translucent-fill box with its label in a header
 * strip at the top-left, distinct from every leaf shape above. Canvas
 * (`ContainerNode` in `rfNodeTypes.tsx`) and SVG export both call this
 * one function, so a container never draws differently in the two
 * places. */
export function renderContainerSvgInner(
  w: number,
  h: number,
  label: string,
  style: { stroke: string; strokeWidth?: number },
): string {
  const strokeWidth = style.strokeWidth ?? 1.5;
  return (
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="${style.stroke}" fill-opacity="0.06" stroke="${style.stroke}" stroke-width="${strokeWidth}" stroke-dasharray="5,3" />` +
    `<text x="10" y="18" font-size="12" font-weight="600" font-family="system-ui, sans-serif" fill="${style.stroke}">${escapeXmlText(label)}</text>`
  );
}

/** Resolves the shape/color/icon to draw a node of the given type
 * (PLAN.md step 10.8): one of the 6 base types always draws as itself;
 * anything else is looked up in `diagram.custom_types` — a custom type
 * with a `shape` uses it (falling back to `component` for an unknown
 * shape name, not an error), a custom type without a style still falls
 * back to `component` with no color override. */
export function nodeVisual(diagram: DiagramLike, nodeType: string): NodeVisual {
  if (nodeType in baseShapes) return { shape: baseShapes[nodeType] };
  const def = diagram.diagram.custom_types
    ?.map((t) => (typeof t === 'string' ? { name: t } : t))
    .find((t) => t.name === nodeType);
  if (!def) return { shape: baseShapes.component };
  return {
    shape: def.shape ? resolveShape(def.shape) : baseShapes.component,
    color: def.color,
    icon: def.icon,
    stroke: def.stroke,
    strokeWidth: def.strokeWidth,
    lineStyle: def.lineStyle,
    rounded: def.rounded,
  };
}

/** An instance-level style override (PLAN3.md step 11.8) — persisted in
 * the layout file/share link (`layoutFile.ts`'s `LayoutStyle`), not the
 * semantic YAML — so styling a node never touches `rawText`. */
export interface StyleOverride {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  lineStyle?: LineStyle;
  rounded?: boolean;
}

export interface ResolvedNodeStyle {
  shape: ShapeSpec;
  icon?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  lineStyle?: LineStyle;
  rounded?: boolean;
}

/** Resolves a node's final style by priority (PLAN3.md step 11.8):
 * instance override → `custom_types` (type-level) → theme default (the
 * theme tier is left to the caller, same as before this step — callers
 * already fall back to `var(--dc-node-fill)`/`var(--dc-node-border)`
 * when `fill`/`stroke` come back `undefined`). Canvas (`FlowCanvas.tsx`)
 * and SVG export (`svgExport.ts`) both call this one function, so an
 * override can never render differently in the two places. */
export function resolveNodeStyle(diagram: DiagramLike, nodeType: string, instanceOverride?: StyleOverride): ResolvedNodeStyle {
  const visual = nodeVisual(diagram, nodeType);
  return {
    shape: visual.shape,
    icon: visual.icon,
    fill: instanceOverride?.fill ?? visual.color,
    stroke: instanceOverride?.stroke ?? visual.stroke,
    strokeWidth: instanceOverride?.strokeWidth ?? visual.strokeWidth,
    lineStyle: instanceOverride?.lineStyle ?? visual.lineStyle,
    rounded: instanceOverride?.rounded ?? visual.rounded,
  };
}
