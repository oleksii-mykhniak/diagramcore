import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { Diagram } from './types';

const elk = new ELK();

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 60;

/** Padding ELK reserves inside a container node (PLAN3.md step 11.6) —
 * generous at the top for the container's title bar (see
 * `ContainerNode` in `rfNodeTypes.tsx`), which draws outside the
 * children's own bounding box. */
const CONTAINER_PADDING = { top: 36, left: 20, right: 20, bottom: 20 };

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The node's resolved container (PLAN3.md step 11.6): same as
   * `DiagramNode.parent`, except a dangling or cyclic reference (which
   * `dc validate` flags as DC011/DC012) is dropped so layout/rendering
   * always sees a consistent tree — never a reference to a container
   * that doesn't actually contain it. */
  parent?: string;
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

/** Resolves each node's *valid* parent id: present in the diagram, not
 * self-referencing, and not part of a cycle (PLAN3.md step 11.6 — mirrors
 * `internal/validate.checkParents`'s DC011/DC012 rules on the web side,
 * but repairs rather than rejects, so a still-invalid draft being edited
 * doesn't crash layout/canvas). A node whose declared parent fails any of
 * these checks is treated as top-level. */
export function resolveParents(diagram: Diagram): Map<string, string> {
  const ids = new Set(diagram.nodes.map((n) => n.id));
  const rawParent = new Map<string, string>();
  for (const n of diagram.nodes) {
    if (n.parent && n.parent !== n.id && ids.has(n.parent)) {
      rawParent.set(n.id, n.parent);
    }
  }
  const resolved = new Map<string, string>();
  for (const n of diagram.nodes) {
    const parent = rawParent.get(n.id);
    if (parent === undefined) continue;
    const seen = new Set<string>([n.id]);
    let cur: string | undefined = parent;
    let cyclic = false;
    while (cur !== undefined) {
      if (seen.has(cur)) {
        cyclic = true;
        break;
      }
      seen.add(cur);
      cur = rawParent.get(cur);
    }
    if (!cyclic) resolved.set(n.id, parent);
  }
  return resolved;
}

/** The root-to-self ancestor chain (self first), ending with the `""`
 * sentinel for "the top-level graph" — used to find the lowest common
 * ancestor container of an edge's two endpoints. */
function ancestorChain(id: string, parentOf: Map<string, string>): string[] {
  const chain = [id];
  let cur = parentOf.get(id);
  while (cur !== undefined) {
    chain.push(cur);
    cur = parentOf.get(cur);
  }
  chain.push('');
  return chain;
}

function lowestCommonAncestor(a: string[], b: string[]): string {
  const bSet = new Set(b);
  for (const id of a) {
    if (bSet.has(id)) return id;
  }
  return '';
}

/** Computes node positions and edge routes for diagram using elkjs
 * (layered/top-down, hierarchical when `parent:` nesting is present —
 * PLAN3.md step 11.6), independent of any manually saved layout.json —
 * that's applied on top of this in a later phase-5 step. `sizes`
 * (PLAN3.md step 11.4) reserves each resized node's actual width/height
 * instead of the base default, so Re-layout doesn't overlap a node that
 * was made bigger than the default; containers always auto-size to fit
 * their children (a manual container resize is a canvas/UI-only clamp,
 * not fed back into auto-layout). All returned `x`/`y` are absolute
 * (canvas) coordinates, for every node regardless of nesting depth —
 * callers (canvas, SVG export) never need to sum ancestor offsets
 * themselves; only `FlowCanvas` converts back to React Flow's
 * parent-relative convention right at the point it builds RF nodes. */
export async function computeLayout(
  diagram: Diagram,
  sizes?: Record<string, { width: number; height: number }>,
): Promise<DiagramLayout> {
  const parentOf = resolveParents(diagram);
  const childrenOf = new Map<string, string[]>();
  const topLevel: string[] = [];
  for (const n of diagram.nodes) {
    const parent = parentOf.get(n.id);
    if (parent !== undefined) {
      const arr = childrenOf.get(parent) ?? [];
      arr.push(n.id);
      childrenOf.set(parent, arr);
    } else {
      topLevel.push(n.id);
    }
  }

  const edgesByContainer = new Map<string, ElkExtendedEdge[]>();
  diagram.links.forEach((l, i) => {
    const container = lowestCommonAncestor(ancestorChain(l.from, parentOf), ancestorChain(l.to, parentOf));
    const arr = edgesByContainer.get(container) ?? [];
    arr.push({ id: `e${i}`, sources: [l.from], targets: [l.to] });
    edgesByContainer.set(container, arr);
  });

  function buildNode(id: string): ElkNode {
    const childIds = childrenOf.get(id) ?? [];
    const isContainer = childIds.length > 0;
    const node: ElkNode = { id };
    if (isContainer) {
      node.children = childIds.map(buildNode);
      node.layoutOptions = {
        'elk.padding': `[top=${CONTAINER_PADDING.top},left=${CONTAINER_PADDING.left},bottom=${CONTAINER_PADDING.bottom},right=${CONTAINER_PADDING.right}]`,
      };
    } else {
      node.width = sizes?.[id]?.width ?? NODE_WIDTH;
      node.height = sizes?.[id]?.height ?? NODE_HEIGHT;
    }
    const edges = edgesByContainer.get(id);
    if (edges) node.edges = edges;
    return node;
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: topLevel.map(buildNode),
    edges: edgesByContainer.get('') ?? [],
  };

  const result = await elk.layout(elkGraph);

  const nodes: LayoutNode[] = [];
  function collectNodes(elkNode: ElkNode, offsetX: number, offsetY: number, parent: string | undefined) {
    for (const child of elkNode.children ?? []) {
      const x = offsetX + (child.x ?? 0);
      const y = offsetY + (child.y ?? 0);
      nodes.push({ id: child.id, x, y, width: child.width ?? NODE_WIDTH, height: child.height ?? NODE_HEIGHT, parent });
      collectNodes(child, x, y, child.id);
    }
  }
  collectNodes(result, 0, 0, undefined);

  const linkById = diagram.links;
  const edges: LayoutEdge[] = [];
  function collectEdges(elkNode: ElkNode, offsetX: number, offsetY: number) {
    for (const e of elkNode.edges ?? []) {
      const link = linkById[Number((e.id ?? '').slice(1))];
      const section = e.sections?.[0];
      const points: LayoutPoint[] = section
        ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({
            x: p.x + offsetX,
            y: p.y + offsetY,
          }))
        : [];
      edges.push({ id: e.id ?? '', from: link.from, to: link.to, points });
    }
    for (const child of elkNode.children ?? []) {
      collectEdges(child, offsetX + (child.x ?? 0), offsetY + (child.y ?? 0));
    }
  }
  collectEdges(result, 0, 0);

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
