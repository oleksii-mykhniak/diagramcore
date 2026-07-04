import ELK from 'elkjs/lib/elk.bundled.js';
import type { Diagram } from './types';

const elk = new ELK();

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 60;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  points: LayoutPoint[];
}

export interface DiagramLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

/** Computes node positions and edge routes for diagram using elkjs
 * (layered/top-down), independent of any manually saved layout.json —
 * that's applied on top of this in a later phase-5 step. `sizes`
 * (PLAN3.md step 11.4) reserves each resized node's actual width/height
 * instead of the base default, so Re-layout doesn't overlap a node that
 * was made bigger than the default. */
export async function computeLayout(
  diagram: Diagram,
  sizes?: Record<string, { width: number; height: number }>,
): Promise<DiagramLayout> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
    },
    children: diagram.nodes.map((n) => ({
      id: n.id,
      width: sizes?.[n.id]?.width ?? NODE_WIDTH,
      height: sizes?.[n.id]?.height ?? NODE_HEIGHT,
    })),
    edges: diagram.links.map((l, i) => ({
      id: `e${i}`,
      sources: [l.from],
      targets: [l.to],
    })),
  };

  const result = await elk.layout(elkGraph);

  const nodes: LayoutNode[] = (result.children ?? []).map((c) => ({
    id: c.id,
    x: c.x ?? 0,
    y: c.y ?? 0,
    width: c.width ?? NODE_WIDTH,
    height: c.height ?? NODE_HEIGHT,
  }));

  const edges: LayoutEdge[] = (result.edges ?? []).map((e, i) => {
    const link = diagram.links[i];
    const section = e.sections?.[0];
    const points: LayoutPoint[] = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [];
    return {
      id: e.id ?? `e${i}`,
      from: link.from,
      to: link.to,
      points,
    };
  });

  return {
    nodes,
    edges,
    width: result.width ?? 0,
    height: result.height ?? 0,
  };
}

/** Half the base node footprint (PLAN3.md step 11.4's minimum resize
 * size) — small enough to be a genuinely different size, not so small
 * the label/handles become unusable. */
export const MIN_NODE_WIDTH = NODE_WIDTH / 2;
export const MIN_NODE_HEIGHT = NODE_HEIGHT / 2;

/** Overrides each node's width/height with its manually-resized size, if
 * any (PLAN3.md step 11.4) — the single place canvas rendering and SVG
 * export both go through, so a resized node never draws two different
 * sizes in the two places. Also grows the overall `width`/`height` (the
 * SVG export viewBox) so a node resized/dragged past the auto-layout's
 * original bounds isn't clipped; positions (top-left) are untouched. */
export function applyNodeSizes(
  layout: DiagramLayout,
  sizes: Record<string, { width: number; height: number }>,
  positions: Record<string, { x: number; y: number }> = {},
): DiagramLayout {
  if (Object.keys(sizes).length === 0) return layout;
  const nodes = layout.nodes.map((n) => {
    const size = sizes[n.id];
    return size ? { ...n, width: size.width, height: size.height } : n;
  });
  const width = Math.max(layout.width, ...nodes.map((n) => (positions[n.id]?.x ?? n.x) + n.width));
  const height = Math.max(layout.height, ...nodes.map((n) => (positions[n.id]?.y ?? n.y) + n.height));
  return { ...layout, nodes, width, height };
}
