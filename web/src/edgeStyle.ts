import type { DiagramLink } from './types';
import type { LineStyle } from './shapes';

/** Stable(ish) key for a link's per-instance styling/label state (PLAN3.md
 * step 11.9) — the format has no explicit link id, so this is derived
 * from its content. Two genuinely identical links (same from/to/type)
 * collide and share state; accepted as a rare, harmless edge case. */
export function edgeLinkKey(link: Pick<DiagramLink, 'from' | 'to' | 'type'>): string {
  return `${link.from}->${link.to}:${link.type}`;
}

export type EdgeMarker = 'none' | 'arrow' | 'open-arrow';

export interface EdgeStyleOverride {
  markerStart?: EdgeMarker;
  markerEnd?: EdgeMarker;
  lineStyle?: LineStyle;
  strokeWidth?: number;
  color?: string;
}

export interface ResolvedEdgeStyle {
  markerStart: EdgeMarker;
  markerEnd: EdgeMarker;
  lineStyle?: LineStyle;
  strokeWidth?: number;
  color?: string;
}

/** Resolves an edge's style: instance override first, then `undefined`
 * for anything unset — callers keep applying their own existing
 * highlight-color/width defaults (active/visited/hovered) on top, same
 * as before this step, so an edge with no override renders exactly as
 * it always has. */
export function resolveEdgeStyle(override?: EdgeStyleOverride): ResolvedEdgeStyle {
  return {
    markerStart: override?.markerStart ?? 'none',
    markerEnd: override?.markerEnd ?? 'arrow',
    lineStyle: override?.lineStyle,
    strokeWidth: override?.strokeWidth,
    color: override?.color,
  };
}

/** Single source of truth for an edge's stroke color precedence
 * (active flow > visited flow > hover > instance color override >
 * default border) — PLAN4.md step 12.2. Used both for the edge's own
 * line (`DcEdge`'s `stroke`) and for its arrowhead marker, so the two
 * never drift out of sync on the canvas (and the CSS custom properties
 * it returns resolve identically to the resolved-theme colors used by
 * `svgExport.ts`). */
export function resolveEdgeColor(opts: {
  isActive?: boolean;
  isVisited?: boolean;
  isHovered?: boolean;
  color?: string;
}): string {
  if (opts.isActive) return 'var(--dc-flow-active)';
  if (opts.isVisited) return 'var(--dc-flow-visited)';
  if (opts.isHovered) return 'var(--dc-accent)';
  return opts.color ?? 'var(--dc-node-border)';
}
