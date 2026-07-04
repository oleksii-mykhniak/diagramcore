import { describe, expect, it } from 'vitest';
import { renderDiagramSVGString } from './svgExport';
import type { Diagram } from './types';
import type { DiagramLayout } from './layout';

const diagram: Diagram = {
  diagram: { title: 'Test' },
  nodes: [
    { id: 'A', type: 'actor', label: 'Alpha' },
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
});
