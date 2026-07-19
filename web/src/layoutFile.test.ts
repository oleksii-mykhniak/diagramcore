import { describe, expect, it } from 'vitest';
import { layoutSnapshotOf } from './layoutFile';
import type { LayoutFileSource } from './layoutFile';

function baseSource(): LayoutFileSource {
  return {
    positions: { A: { x: 0, y: 0 }, B: { x: 100, y: 0 } },
    notePositions: {},
    renderStyle: 'clean',
    sizes: {},
    styles: {},
    edgeStyles: {},
    edgeLabelOffsets: {},
    hiddenEdgeLabels: new Set<string>(),
  };
}

describe('layoutSnapshotOf', () => {
  it('is equal for structurally identical layouts built through different key-insertion orders (PLAN4.md step 12.3)', () => {
    const a = baseSource();
    a.styles = { A: { fill: '#fff', stroke: '#000' } };

    const b = baseSource();
    // Same content, keys inserted in the opposite order.
    b.styles = { A: { stroke: '#000', fill: '#fff' } };

    expect(layoutSnapshotOf(a)).toBe(layoutSnapshotOf(b));
  });

  it('differs when a position actually changes (dirty-state detection)', () => {
    const a = baseSource();
    const b = baseSource();
    b.positions = { ...b.positions, A: { x: 5, y: 5 } };

    expect(layoutSnapshotOf(a)).not.toBe(layoutSnapshotOf(b));
  });

  it('differs when a node is hidden/style-overridden even though positions are unchanged', () => {
    const a = baseSource();
    const b = baseSource();
    b.styles = { A: { fill: '#ff0000' } };

    expect(layoutSnapshotOf(a)).not.toBe(layoutSnapshotOf(b));
  });
});
