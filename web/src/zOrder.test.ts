import { describe, expect, it } from 'vitest';
import { applyZOrderOp, resolveDrawOrder, resolveZOrder } from './zOrder';

describe('resolveZOrder', () => {
  it('returns the default order verbatim when zOrder is empty', () => {
    expect(resolveZOrder(['A', 'B', 'C'], [])).toEqual(['A', 'B', 'C']);
  });

  it('groups explicit ids into a contiguous block at the first one\'s default position, leaving others in place', () => {
    // Default: A B C D. Explicit: D before B (i.e. D under B).
    expect(resolveZOrder(['A', 'B', 'C', 'D'], ['D', 'B'])).toEqual(['A', 'D', 'B', 'C']);
  });

  it('ignores ids in zOrder that no longer exist in the diagram (stale entries)', () => {
    expect(resolveZOrder(['A', 'B'], ['A', 'Ghost', 'B'])).toEqual(['A', 'B']);
  });

  it('a node added since zOrder was last saved renders in its own default slot', () => {
    // zOrder only knows about A and C; B is new.
    expect(resolveZOrder(['A', 'B', 'C'], ['C', 'A'])).toEqual(['C', 'A', 'B']);
  });
});

describe('resolveDrawOrder', () => {
  it('a container always draws immediately before its own children, regardless of zOrder (PLAN3.md step 11.6 invariant)', () => {
    const nodes = [
      { id: 'gcp', parent: undefined },
      { id: 'svc', parent: 'gcp' },
      { id: 'other' },
    ];
    // Reordering "other" above "gcp" at the top level still can't pull
    // "svc" out from directly after its parent "gcp" — svc isn't gcp's
    // sibling, so it's untouched by a top-level zOrder entry for it.
    const order = resolveDrawOrder(nodes, ['other', 'gcp']);
    expect(order.indexOf('gcp')).toBeLessThan(order.indexOf('svc'));
    expect(order).toEqual(['other', 'gcp', 'svc']);
  });

  it('reorders top-level siblings by zOrder, unaffected by nested children', () => {
    const nodes = [
      { id: 'A' },
      { id: 'gcp' },
      { id: 'svc', parent: 'gcp' },
      { id: 'B' },
    ];
    expect(resolveDrawOrder(nodes, ['B', 'A'])).toEqual(['B', 'A', 'gcp', 'svc']);
  });
});

describe('applyZOrderOp', () => {
  const order = ['A', 'B', 'C', 'D'];

  it('front moves the selection to the very top, preserving its relative order', () => {
    expect(applyZOrderOp(order, [], ['B'], 'front')).toEqual(['A', 'C', 'D', 'B']);
    expect(applyZOrderOp(order, [], ['B', 'C'], 'front')).toEqual(['A', 'D', 'B', 'C']);
  });

  it('back moves the selection to the very bottom, preserving its relative order', () => {
    expect(applyZOrderOp(order, [], ['C'], 'back')).toEqual(['C', 'A', 'B', 'D']);
    expect(applyZOrderOp(order, [], ['B', 'C'], 'back')).toEqual(['B', 'C', 'A', 'D']);
  });

  it('forward swaps the selection with its single next unselected neighbor', () => {
    expect(applyZOrderOp(order, [], ['B'], 'forward')).toEqual(['A', 'C', 'B', 'D']);
  });

  it('backward swaps the selection with its single previous unselected neighbor', () => {
    expect(applyZOrderOp(order, [], ['C'], 'backward')).toEqual(['A', 'C', 'B', 'D']);
  });

  it('forward/backward move a multi-selection as one unit', () => {
    expect(applyZOrderOp(order, [], ['B', 'C'], 'forward')).toEqual(['A', 'D', 'B', 'C']);
    expect(applyZOrderOp(order, [], ['B', 'C'], 'backward')).toEqual(['B', 'C', 'A', 'D']);
  });

  it('forward/backward at the boundary is a no-op', () => {
    expect(applyZOrderOp(order, [], ['A'], 'backward')).toEqual(order);
    expect(applyZOrderOp(order, [], ['D'], 'forward')).toEqual(order);
  });
});
