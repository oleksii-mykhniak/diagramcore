/** Single shape registry (PLAN.md step 10.6): the canvas (`rfNodeTypes.tsx`)
 * and SVG export (`svgExport.ts`) both draw a node's outline through
 * `renderSvgInner` — so "what a storage node looks like" is defined in
 * exactly one place, and canvas/export can never drift apart. */
import { sketchEllipse, sketchPath, sketchPolygon, sketchRect } from './sketch';

export type RenderStyle = 'clean' | 'sketch';

export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Diagram style preset (PLAN.md step 10.12) — 'clean' (default) draws
   * the crisp vector outline below; 'sketch' roughens the same geometry
   * via roughjs (see `./sketch.ts`) so canvas and export stay identical
   * under either preset. */
  renderStyle?: RenderStyle;
}

export interface ShapeSpec {
  name: string;
  /** Inner SVG markup (no wrapping `<svg>`/`<g transform>`) for a shape
   * sized to (w, h), starting at (0, 0). */
  renderSvgInner(w: number, h: number, style: ShapeStyle): string;
}

function rectShape(rx: number, dashArray?: string): ShapeSpec['renderSvgInner'] {
  return (w, h, s) => {
    if (s.renderStyle === 'sketch') return sketchRect(0.5, 0.5, w - 1, h - 1, s, dashArray);
    return `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${rx}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dashArray ? ` stroke-dasharray="${dashArray}"` : ''} />`;
  };
}

const ellipseInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  if (s.renderStyle === 'sketch') return sketchEllipse(w / 2, h / 2, w - 2, h - 2, s);
  return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 1}" ry="${h / 2 - 1}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" />`;
};

const storageInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const rx = w / 2 - 1;
  const ry = Math.min(10, h / 4);
  const top = ry;
  const bottom = h - ry - 1;
  const bodyPath = `M1,${top} A${rx},${ry} 0 0 1 ${w - 1},${top} L${w - 1},${bottom} A${rx},${ry} 0 0 1 1,${bottom} Z`;
  if (s.renderStyle === 'sketch') {
    return sketchPath(bodyPath, s) + sketchEllipse(w / 2, top, rx * 2, ry * 2, s);
  }
  return (
    `<path d="${bodyPath}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" />` +
    `<ellipse cx="${w / 2}" cy="${top}" rx="${rx}" ry="${ry}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" />`
  );
};

const diamondInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const points: [number, number][] = [
    [w / 2, 1],
    [w - 1, h / 2],
    [w / 2, h - 1],
    [1, h / 2],
  ];
  if (s.renderStyle === 'sketch') return sketchPolygon(points, s);
  return `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" />`;
};

const parallelogramInner: ShapeSpec['renderSvgInner'] = (w, h, s) => {
  const skew = w * 0.18;
  const points: [number, number][] = [
    [skew, 1],
    [w - 1, 1],
    [w - 1 - skew, h - 1],
    [1, h - 1],
  ];
  if (s.renderStyle === 'sketch') return sketchPolygon(points, s);
  return `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" />`;
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
  if (s.renderStyle === 'sketch') return sketchPolygon(points, s);
  return `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" />`;
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
  if (s.renderStyle === 'sketch') return sketchPath(path, s);
  return `<path d="${path}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" />`;
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
}

interface DiagramLike {
  diagram: {
    custom_types?: (string | { name: string; shape?: string; color?: string; icon?: string })[];
  };
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
  return { shape: def.shape ? resolveShape(def.shape) : baseShapes.component, color: def.color, icon: def.icon };
}
