import { describe, expect, it } from 'vitest';
import { nodeVisual } from './shapes';
import { renderDiagramSVGString } from './svgExport';
import type { Diagram } from './types';
import type { DiagramLayout } from './layout';

const diagramWithCache: Diagram = {
  diagram: { title: 'T', custom_types: [{ name: 'cache', shape: 'hexagon', color: '#f5a623' }] },
  nodes: [{ id: 'A', type: 'cache', label: 'Cache' }],
  links: [],
};

describe('nodeVisual (PLAN.md step 10.8)', () => {
  it('a custom type with a shape+color override resolves to that shape and color', () => {
    const visual = nodeVisual(diagramWithCache, 'cache');
    expect(visual.shape.name).toBe('hexagon');
    expect(visual.color).toBe('#f5a623');
  });

  it('a custom type without a style falls back to component, no color override', () => {
    const diagram: Diagram = {
      diagram: { title: 'T', custom_types: ['plain'] },
      nodes: [{ id: 'A', type: 'plain' }],
      links: [],
    };
    const visual = nodeVisual(diagram, 'plain');
    expect(visual.shape.name).toBe('component');
    expect(visual.color).toBeUndefined();
  });

  it('the exported SVG draws the custom type with its overridden shape geometry', () => {
    const layout: DiagramLayout = {
      nodes: [{ id: 'A', x: 0, y: 0, width: 160, height: 60 }],
      edges: [],
      width: 160,
      height: 60,
    };
    const svg = renderDiagramSVGString(diagramWithCache, layout, { A: { x: 0, y: 0 } });
    expect(svg).toContain('<polygon'); // hexagon shape
    expect(svg).toContain('#f5a623');
  });
});
