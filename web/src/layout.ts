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
 * that's applied on top of this in a later phase-5 step. */
export async function computeLayout(diagram: Diagram): Promise<DiagramLayout> {
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
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
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
