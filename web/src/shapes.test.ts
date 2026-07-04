import { describe, expect, it } from 'vitest';
import { resolveShape, shapeRegistry } from './shapes';

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];
const style = { fill: '#fff', stroke: '#333', strokeWidth: 1.5 };

describe('shapeRegistry', () => {
  it('each of the 6 base types renders a distinct SVG for the same box', () => {
    const outputs = BASE_TYPES.map((t) => shapeRegistry[t].renderSvgInner(160, 60, style));
    expect(new Set(outputs).size).toBe(BASE_TYPES.length);
  });

  it('storage renders cylinder geometry (a path plus an ellipse cap)', () => {
    const svg = shapeRegistry.storage.renderSvgInner(160, 60, style);
    expect(svg).toContain('<path');
    expect(svg).toContain('<ellipse');
  });

  it('resolveShape falls back to component for an unknown name', () => {
    expect(resolveShape('nonexistent-type')).toBe(shapeRegistry.component);
  });

  it('the additional shapes (hexagon/diamond/ellipse/cloud/parallelogram) are all distinct', () => {
    const extra = ['hexagon', 'diamond', 'ellipse', 'cloud', 'parallelogram'];
    const outputs = extra.map((t) => shapeRegistry[t].renderSvgInner(160, 60, style));
    expect(new Set(outputs).size).toBe(extra.length);
  });

  it('renderStyle: "sketch" draws different (roughened) markup than "clean" for every shape (PLAN.md step 10.12)', () => {
    for (const type of [...BASE_TYPES, 'hexagon', 'diamond', 'cloud', 'parallelogram']) {
      const clean = shapeRegistry[type].renderSvgInner(160, 60, { ...style, renderStyle: 'clean' });
      const sketch = shapeRegistry[type].renderSvgInner(160, 60, { ...style, renderStyle: 'sketch' });
      expect(sketch).not.toBe(clean);
      expect(sketch).toContain('<path');
    }
  });

  it('sketch geometry is deterministic for a fixed seed: same shape/size renders identically twice', () => {
    for (const type of BASE_TYPES) {
      const a = shapeRegistry[type].renderSvgInner(160, 60, { ...style, renderStyle: 'sketch' });
      const b = shapeRegistry[type].renderSvgInner(160, 60, { ...style, renderStyle: 'sketch' });
      expect(a).toBe(b);
    }
  });
});
