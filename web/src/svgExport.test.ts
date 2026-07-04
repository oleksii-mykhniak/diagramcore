import { describe, expect, it } from 'vitest';
import { renderDiagramSVGString } from './svgExport';
import type { Diagram } from './types';
import type { DiagramLayout } from './layout';

const diagram: Diagram = {
  diagram: { title: 'Test' },
  nodes: [
    { id: 'A', type: 'actor', label: 'Alpha', description: 'The alpha node' },
    { id: 'B', type: 'service', label: 'Beta', details: './beta-detail.dc.yaml' },
  ],
  links: [{ from: 'A', to: 'B', type: 'request' }],
};

const layout: DiagramLayout = {
  nodes: [
    { id: 'A', x: 0, y: 0, width: 160, height: 60 },
    { id: 'B', x: 0, y: 120, width: 160, height: 60 },
  ],
  edges: [{ id: 'e0', from: 'A', to: 'B', points: [{ x: 80, y: 60 }, { x: 80, y: 120 }] }],
  width: 200,
  height: 200,
};

const positions = { A: { x: 0, y: 0 }, B: { x: 0, y: 120 } };

describe('renderDiagramSVGString', () => {
  it('renders both node labels and the edge', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Alpha');
    expect(svg).toContain('Beta');
    expect(svg).toContain('<polyline');
  });

  it('marks nodes with a details reference and not others', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions);
    const betaIndex = svg.indexOf('Beta');
    const alphaIndex = svg.indexOf('Alpha');
    expect(svg.slice(betaIndex, betaIndex + 10)).toContain('⊞');
    expect(svg.slice(alphaIndex, alphaIndex + 10)).not.toContain('⊞');
  });

  it('includes an animateMotion marker only when a highlighted active step is given', () => {
    const withoutHighlight = renderDiagramSVGString(diagram, layout, positions);
    expect(withoutHighlight).not.toContain('animateMotion');

    const withHighlight = renderDiagramSVGString(diagram, layout, positions, {
      activeStep: { from: 'A', to: 'B' },
    });
    expect(withHighlight).toContain('animateMotion');
  });

  it('includes a grid pattern only when requested (PLAN.md step 10.9)', () => {
    const withoutGrid = renderDiagramSVGString(diagram, layout, positions, {}, { includeGrid: false });
    expect(withoutGrid).not.toContain('<pattern');

    const withGrid = renderDiagramSVGString(diagram, layout, positions, {}, { includeGrid: true });
    expect(withGrid).toContain('<pattern');
    expect(withGrid).toContain('url(#dc-grid)');
  });

  it('draws notes at their position, and node descriptions only when requested (PLAN.md step 10.11)', () => {
    const withoutDescriptions = renderDiagramSVGString(diagram, layout, positions, {}, { includeDescriptions: false });
    expect(withoutDescriptions).not.toContain('The alpha node');

    const withDescriptions = renderDiagramSVGString(diagram, layout, positions, {}, { includeDescriptions: true });
    expect(withDescriptions).toContain('The alpha node');

    const withNotes = renderDiagramSVGString(diagram, layout, positions, {}, {}, [{ id: 'note1', text: 'Trigger refresh' }], {
      note1: { x: 20, y: 30 },
    });
    expect(withNotes).toContain('Trigger refresh');
    expect(withNotes).toContain('x="20"');
  });

  it('draws sketch-style nodes and edges as roughened paths, distinct from clean output (PLAN.md step 10.12)', () => {
    const clean = renderDiagramSVGString(diagram, layout, positions, {}, { renderStyle: 'clean' });
    const sketch = renderDiagramSVGString(diagram, layout, positions, {}, { renderStyle: 'sketch' });
    expect(sketch).not.toBe(clean);
    expect(clean).toContain('<polyline');
    expect(sketch).not.toContain('<polyline');
    expect(sketch).toContain('<path');

    const sketchAgain = renderDiagramSVGString(diagram, layout, positions, {}, { renderStyle: 'sketch' });
    expect(sketchAgain).toBe(sketch);
  });
});
