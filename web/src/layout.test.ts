import { describe, expect, it } from 'vitest';
import { applyNodeSizes, computeLayout, NODE_WIDTH, resolveParents } from './layout';
import type { Diagram } from './types';

const diagram: Diagram = {
  diagram: { title: 'Test' },
  nodes: [
    { id: 'A', type: 'actor' },
    { id: 'B', type: 'service' },
    { id: 'C', type: 'storage' },
  ],
  links: [
    { from: 'A', to: 'B', type: 'request' },
    { from: 'B', to: 'C', type: 'query' },
  ],
};

describe('computeLayout', () => {
  it('positions every node', async () => {
    const layout = await computeLayout(diagram);
    expect(layout.nodes).toHaveLength(3);
    const ids = layout.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['A', 'B', 'C']);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it('routes every link', async () => {
    const layout = await computeLayout(diagram);
    expect(layout.edges).toHaveLength(2);
    const pairs = layout.edges.map((e) => `${e.from}->${e.to}`).sort();
    expect(pairs).toEqual(['A->B', 'B->C']);
    for (const e of layout.edges) {
      expect(e.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('reserves a resized node’s actual footprint instead of the base default (PLAN3.md step 11.4)', async () => {
    const withoutResize = await computeLayout(diagram);
    const bBase = withoutResize.nodes.find((n) => n.id === 'B')!;
    expect(bBase.width).toBe(NODE_WIDTH);

    const resized = await computeLayout(diagram, { B: { width: 600, height: 400 } });
    const bResized = resized.nodes.find((n) => n.id === 'B')!;
    expect(bResized.width).toBe(600);
    expect(bResized.height).toBe(400);
    // A bigger reserved footprint pushes the layout to be at least as wide.
    expect(resized.width).toBeGreaterThanOrEqual(withoutResize.width);
  });
});

describe('computeLayout hierarchical containers (PLAN3.md step 11.6)', () => {
  const nested: Diagram = {
    diagram: { title: 'Nested' },
    nodes: [
      { id: 'gcp', type: 'component' },
      { id: 'k8s', type: 'component', parent: 'gcp' },
      { id: 'ns', type: 'component', parent: 'k8s' },
      { id: 'api', type: 'service', parent: 'ns' },
      { id: 'worker', type: 'service', parent: 'ns' },
      { id: 'client', type: 'actor' },
    ],
    links: [
      { from: 'client', to: 'api', type: 'request' },
      { from: 'api', to: 'worker', type: 'call' },
    ],
  };

  it('places every child strictly inside its container’s absolute bounds', async () => {
    const layout = await computeLayout(nested);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));

    for (const child of ['k8s']) {
      const c = byId.get(child)!;
      const p = byId.get('gcp')!;
      expect(c.x).toBeGreaterThanOrEqual(p.x);
      expect(c.y).toBeGreaterThanOrEqual(p.y);
      expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.width);
      expect(c.y + c.height).toBeLessThanOrEqual(p.y + p.height);
    }
    for (const child of ['api', 'worker']) {
      const c = byId.get(child)!;
      const p = byId.get('ns')!;
      expect(c.x).toBeGreaterThanOrEqual(p.x);
      expect(c.y).toBeGreaterThanOrEqual(p.y);
      expect(c.x + c.width).toBeLessThanOrEqual(p.x + p.width);
      expect(c.y + c.height).toBeLessThanOrEqual(p.y + p.height);
    }
  });

  it('does not overlap siblings inside the same container', async () => {
    const layout = await computeLayout(nested);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const api = byId.get('api')!;
    const worker = byId.get('worker')!;
    const overlapsX = api.x < worker.x + worker.width && worker.x < api.x + api.width;
    const overlapsY = api.y < worker.y + worker.height && worker.y < api.y + api.height;
    expect(overlapsX && overlapsY).toBe(false);
  });

  it('routes an edge crossing a container boundary (client -> api) as absolute points', async () => {
    const layout = await computeLayout(nested);
    const edge = layout.edges.find((e) => e.from === 'client' && e.to === 'api')!;
    expect(edge).toBeDefined();
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
  });

  it('reports each node’s resolved parent', async () => {
    const layout = await computeLayout(nested);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    expect(byId.get('gcp')!.parent).toBeUndefined();
    expect(byId.get('k8s')!.parent).toBe('gcp');
    expect(byId.get('api')!.parent).toBe('ns');
    expect(byId.get('client')!.parent).toBeUndefined();
  });
});

describe('resolveParents', () => {
  it('drops a dangling parent reference', () => {
    const d: Diagram = {
      diagram: { title: 'T' },
      nodes: [{ id: 'A', type: 'component', parent: 'Ghost' }],
      links: [],
    };
    expect(resolveParents(d).has('A')).toBe(false);
  });

  it('drops a self-reference and a 2-node cycle', () => {
    const d: Diagram = {
      diagram: { title: 'T' },
      nodes: [
        { id: 'A', type: 'component', parent: 'A' },
        { id: 'B', type: 'component', parent: 'C' },
        { id: 'C', type: 'component', parent: 'B' },
      ],
      links: [],
    };
    const resolved = resolveParents(d);
    expect(resolved.has('A')).toBe(false);
    expect(resolved.has('B')).toBe(false);
    expect(resolved.has('C')).toBe(false);
  });

  it('keeps a valid multi-level chain', () => {
    const d: Diagram = {
      diagram: { title: 'T' },
      nodes: [
        { id: 'gcp', type: 'component' },
        { id: 'k8s', type: 'component', parent: 'gcp' },
        { id: 'ns', type: 'component', parent: 'k8s' },
      ],
      links: [],
    };
    const resolved = resolveParents(d);
    expect(resolved.get('k8s')).toBe('gcp');
    expect(resolved.get('ns')).toBe('k8s');
  });
});

describe('applyNodeSizes', () => {
  it('overrides only the resized nodes and grows the canvas bounds to fit them', async () => {
    const layout = await computeLayout(diagram);
    const target = layout.nodes[0];
    const withSize = applyNodeSizes(
      layout,
      { [target.id]: { width: 500, height: 300 } },
      { [target.id]: { x: target.x, y: target.y } },
    );
    const resizedNode = withSize.nodes.find((n) => n.id === target.id)!;
    expect(resizedNode.width).toBe(500);
    expect(resizedNode.height).toBe(300);
    expect(withSize.width).toBeGreaterThanOrEqual(target.x + 500);
    expect(withSize.height).toBeGreaterThanOrEqual(target.y + 300);

    const otherNode = withSize.nodes.find((n) => n.id !== target.id)!;
    const originalOther = layout.nodes.find((n) => n.id === otherNode.id)!;
    expect(otherNode.width).toBe(originalOther.width);
  });

  it('is a no-op when there are no manual sizes', async () => {
    const layout = await computeLayout(diagram);
    expect(applyNodeSizes(layout, {})).toBe(layout);
  });
});
