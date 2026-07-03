import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
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
});
