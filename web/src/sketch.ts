/** Hand-drawn ("sketch") rendering (PLAN.md step 10.12): thin wrapper
 * around roughjs's headless generator — `toPaths`/`opsToPath` return SVG
 * path data without touching the DOM, so the exact same code produces
 * the on-canvas markup (via `dangerouslySetInnerHTML`, like the clean
 * shapes already do) and the exported SVG string. Every draw call pins
 * `seed` to a fixed constant so geometry is deterministic — required for
 * stable snapshot/unit tests and so a diagram doesn't visibly "reroll"
 * its hand-drawn wobble on every re-render. */
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';

const generator = rough.generator();

const SKETCH_SEED = 12345;
const SKETCH_ROUGHNESS = 1.6;

export interface SketchFillStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

function fillOptions(style: SketchFillStyle, extra?: Options): Options {
  return {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    fill: style.fill,
    fillStyle: 'solid',
    roughness: SKETCH_ROUGHNESS,
    seed: SKETCH_SEED,
    ...extra,
  };
}

function drawableToSvg(drawable: ReturnType<typeof generator.path>): string {
  return generator
    .toPaths(drawable)
    .map((p) => `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill ?? 'none'}" />`)
    .join('');
}

/** A filled+stroked shape whose outline is an arbitrary SVG path `d`
 * string — reused for the shapes whose clean geometry already is a path
 * (storage's body, the cloud blob) instead of re-deriving rough-specific
 * geometry for each. */
export function sketchPath(d: string, style: SketchFillStyle, dashArray?: string): string {
  return drawableToSvg(
    generator.path(d, fillOptions(style, dashArray ? { strokeLineDash: dashArray.split(',').map(Number) } : undefined)),
  );
}

export function sketchRect(x: number, y: number, w: number, h: number, style: SketchFillStyle, dashArray?: string): string {
  return drawableToSvg(
    generator.rectangle(
      x,
      y,
      w,
      h,
      fillOptions(style, dashArray ? { strokeLineDash: dashArray.split(',').map(Number) } : undefined),
    ),
  );
}

export function sketchEllipse(cx: number, cy: number, w: number, h: number, style: SketchFillStyle): string {
  return drawableToSvg(generator.ellipse(cx, cy, w, h, fillOptions(style)));
}

export function sketchPolygon(points: [number, number][], style: SketchFillStyle): string {
  return drawableToSvg(generator.polygon(points, fillOptions(style)));
}

/** Stroke-only wobbled line for edges/note underlines — deliberately
 * single-stroke (`disableMultiStroke`) so the result is one path `d`
 * string, matching what a single `<path>`/`marker-end` expects (React
 * Flow's `BaseEdge`, and the export's arrow marker). */
export function sketchLineD(points: [number, number][]): string {
  const drawable = generator.linearPath(points, {
    stroke: '#000',
    strokeWidth: 1,
    roughness: SKETCH_ROUGHNESS,
    seed: SKETCH_SEED,
    disableMultiStroke: true,
    simplification: 0.5,
  });
  const opSet = drawable.sets[0];
  return opSet ? generator.opsToPath(opSet) : '';
}

/** Same wobble as `sketchLineD`, but takes an already-built path `d`
 * string (e.g. React Flow's `getSmoothStepPath` output) instead of raw
 * points — used for canvas edges, which React Flow paths rather than
 * gives us points for. */
export function sketchEdgeD(d: string): string {
  const drawable = generator.path(d, {
    stroke: '#000',
    strokeWidth: 1,
    roughness: SKETCH_ROUGHNESS,
    seed: SKETCH_SEED,
    disableMultiStroke: true,
    simplification: 0.5,
  });
  const opSet = drawable.sets[0];
  return opSet ? generator.opsToPath(opSet) : d;
}
