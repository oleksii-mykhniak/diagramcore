import { describe, expect, it } from 'vitest';
import { applyNodeSizes, computeLayout, NODE_WIDTH } from './layout';
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
