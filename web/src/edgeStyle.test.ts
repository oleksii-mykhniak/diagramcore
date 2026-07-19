import { describe, expect, it } from 'vitest';
import { edgeLinkKey, resolveEdgeColor, resolveEdgeStyle } from './edgeStyle';

describe('edgeLinkKey', () => {
  it('is stable for the same from/to/type and distinct across type', () => {
    const a = edgeLinkKey({ from: 'A', to: 'B', type: 'request' });
    const b = edgeLinkKey({ from: 'A', to: 'B', type: 'request' });
    const c = edgeLinkKey({ from: 'A', to: 'B', type: 'event' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('resolveEdgeStyle', () => {
  it('defaults to a closed end marker, no start marker, and no line-style/width/color override', () => {
    const resolved = resolveEdgeStyle(undefined);
    expect(resolved).toEqual({ markerStart: 'none', markerEnd: 'arrow', lineStyle: undefined, strokeWidth: undefined, color: undefined });
  });

  it('lets an override replace only the fields it sets', () => {
    const resolved = resolveEdgeStyle({ markerEnd: 'none', color: '#123456' });
    expect(resolved.markerStart).toBe('none');
    expect(resolved.markerEnd).toBe('none');
    expect(resolved.color).toBe('#123456');
    expect(resolved.lineStyle).toBeUndefined();
  });
});

describe('resolveEdgeColor', () => {
  it('prioritizes active flow > visited flow > hover > instance override > default border (PLAN4.md step 12.2)', () => {
    expect(resolveEdgeColor({ isActive: true, isVisited: true, isHovered: true, color: '#123456' })).toBe(
      'var(--dc-flow-active)',
    );
    expect(resolveEdgeColor({ isVisited: true, isHovered: true, color: '#123456' })).toBe('var(--dc-flow-visited)');
    expect(resolveEdgeColor({ isHovered: true, color: '#123456' })).toBe('var(--dc-accent)');
    expect(resolveEdgeColor({ color: '#123456' })).toBe('#123456');
    expect(resolveEdgeColor({})).toBe('var(--dc-node-border)');
  });
});
