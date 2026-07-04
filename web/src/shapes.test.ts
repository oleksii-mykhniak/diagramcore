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
});
