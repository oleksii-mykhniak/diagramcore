import { describe, expect, it } from 'vitest';
import { resolveNodeStyle, resolveShape, shapeRegistry } from './shapes';

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

  it('lineStyle overrides the shape’s own dash pattern (e.g. external’s built-in dashed outline)', () => {
    const solidExternal = shapeRegistry.external.renderSvgInner(160, 60, { ...style, lineStyle: 'solid' });
    expect(solidExternal).not.toContain('stroke-dasharray');

    const dottedService = shapeRegistry.service.renderSvgInner(160, 60, { ...style, lineStyle: 'dotted' });
    expect(dottedService).toContain('stroke-dasharray="2,3"');
  });

  it('rounded toggles a rect shape’s corner radius', () => {
    const square = shapeRegistry.component.renderSvgInner(160, 60, { ...style, rounded: false });
    expect(square).toContain('rx="0"');
    const rounded = shapeRegistry.component.renderSvgInner(160, 60, { ...style, rounded: true });
    expect(rounded).toMatch(/rx="\d+"/);
    expect(rounded).not.toContain('rx="0"');
  });

  it('sketch mode still uses the overridden fill/stroke/strokeWidth', () => {
    const overridden = shapeRegistry.service.renderSvgInner(160, 60, {
      fill: '#ff00ff',
      stroke: '#00ffff',
      strokeWidth: 4,
      renderStyle: 'sketch',
    });
    expect(overridden).toContain('#ff00ff');
    expect(overridden).toContain('#00ffff');
    expect(overridden).toContain('stroke-width="4"');
  });
});

describe('resolveNodeStyle', () => {
  const diagram = {
    diagram: {
      custom_types: [{ name: 'cache', shape: 'hexagon', color: '#f5a623', stroke: '#8a5a00', strokeWidth: 2, lineStyle: 'dashed' as const, rounded: true }],
    },
  };

  it('falls back to the type-level (custom_types) style with no instance override', () => {
    const resolved = resolveNodeStyle(diagram, 'cache');
    expect(resolved.fill).toBe('#f5a623');
    expect(resolved.stroke).toBe('#8a5a00');
    expect(resolved.strokeWidth).toBe(2);
    expect(resolved.lineStyle).toBe('dashed');
    expect(resolved.rounded).toBe(true);
  });

  it('an instance override wins over the type-level style, field by field', () => {
    const resolved = resolveNodeStyle(diagram, 'cache', { fill: '#000000', rounded: false });
    expect(resolved.fill).toBe('#000000');
    expect(resolved.rounded).toBe(false);
    // Fields not present in the instance override still fall through to
    // the type-level style.
    expect(resolved.stroke).toBe('#8a5a00');
    expect(resolved.lineStyle).toBe('dashed');
  });

  it('a base-six type has no type-level style tier, so an instance override is the only source', () => {
    const resolved = resolveNodeStyle(diagram, 'service', { stroke: '#123456' });
    expect(resolved.fill).toBeUndefined();
    expect(resolved.stroke).toBe('#123456');
  });

  it('resolves the instance text override with no type-level tier (PLAN4.md step 12.5)', () => {
    const noText = resolveNodeStyle(diagram, 'service');
    expect(noText.text).toBeUndefined();

    const resolved = resolveNodeStyle(diagram, 'service', {
      text: { fontSize: 20, bold: true, italic: true, color: '#ff00ff', align: 'left' },
    });
    expect(resolved.text).toEqual({ fontSize: 20, bold: true, italic: true, color: '#ff00ff', align: 'left' });
  });
});
