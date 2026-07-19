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

  it('draws nodes in default order with no zOrder, and in zOrder-resolved order when given (PLAN4.md step 12.9)', () => {
    const defaultSvg = renderDiagramSVGString(diagram, layout, positions);
    expect(defaultSvg.indexOf('Alpha')).toBeLessThan(defaultSvg.indexOf('Beta'));

    const reordered = renderDiagramSVGString(diagram, layout, positions, {}, { zOrder: ['B', 'A'] });
    expect(reordered.indexOf('Beta')).toBeLessThan(reordered.indexOf('Alpha'));
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

  it('draws a container node as a translucent box with its label, painted before its children (PLAN3.md step 11.6)', () => {
    const nestedDiagram: Diagram = {
      diagram: { title: 'Nested' },
      nodes: [
        { id: 'gcp', type: 'component', label: 'GCP' },
        { id: 'svc', type: 'service', label: 'Svc', parent: 'gcp' },
      ],
      links: [],
    };
    const nestedLayout: DiagramLayout = {
      nodes: [
        { id: 'gcp', x: 0, y: 0, width: 300, height: 200 },
        { id: 'svc', x: 40, y: 60, width: 160, height: 60, parent: 'gcp' },
      ],
      edges: [],
      width: 300,
      height: 200,
    };
    const svg = renderDiagramSVGString(nestedDiagram, nestedLayout, { gcp: { x: 0, y: 0 }, svc: { x: 40, y: 60 } });
    expect(svg).toContain('GCP');
    expect(svg).toContain('Svc');
    expect(svg).toContain('stroke-dasharray="5,3"'); // container's own dashed box
    expect(svg.indexOf('GCP')).toBeLessThan(svg.indexOf('Svc'));
  });

  it('applies an instance style override (PLAN3.md step 11.8) to the matching node only', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions, {}, {}, [], {}, {
      A: { fill: '#ff00ff', stroke: '#00ffff', strokeWidth: 4, lineStyle: 'dashed' },
    });
    expect(svg).toContain('#ff00ff');
    expect(svg).toContain('#00ffff');
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('stroke-dasharray="6,4"');

    // Node B has no override — its own drawn markup doesn't mention the
    // override color at all.
    const bIndex = svg.indexOf('Beta');
    expect(svg.slice(bIndex - 300, bIndex)).not.toContain('#ff00ff');
  });

  it('applies an edge style override (PLAN3.md step 11.9): marker kind/line style/width/color', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions, {}, {
      edgeStyles: { 'A->B:request': { markerStart: 'open-arrow', markerEnd: 'none', lineStyle: 'dotted', strokeWidth: 4, color: '#123456' } },
    });
    expect(svg).not.toContain('marker-end="url(#dc-marker-end-0)"');
    expect(svg).toContain('marker-start="url(#dc-marker-start-0)"');
    expect(svg).toContain('stroke-dasharray="2,3"');
    expect(svg).toContain('stroke="#123456"');
    expect(svg).toContain('stroke-width="4"');
    // Open-arrow marker def is an unfilled chevron, not the closed triangle.
    expect(svg).toContain('fill="none" stroke="#123456"');
  });

  it('draws the default edge (no override) with the same closed-triangle marker as the canvas default (PLAN4.md step 12.2)', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions);
    expect(svg).toContain('marker-end="url(#dc-marker-end-0)"');
    expect(svg).not.toContain('marker-start=');
    // Closed/filled triangle, matching the canvas's MarkerType.ArrowClosed.
    expect(svg).toContain('<path d="M0,0 L10,5 L0,10 z" fill="#333333" />');
  });

  it('the arrowhead marker inherits the active-flow highlight color, not just an instance color override (PLAN4.md step 12.2)', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions, { activeStep: { from: 'A', to: 'B' } });
    expect(svg).toContain('stroke="#e04b4b"');
    expect(svg).toContain('<path d="M0,0 L10,5 L0,10 z" fill="#e04b4b" />');
  });

  it('applies an instance text override (PLAN4.md step 12.5) to a node label: font-size/weight/style/color/align', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions, {}, {}, [], {}, {
      A: { text: { fontSize: 20, bold: true, italic: true, color: '#ff00ff', align: 'left' } },
    });
    const alphaIndex = svg.indexOf('Alpha');
    const textOpenTag = svg.lastIndexOf('<text', alphaIndex);
    const tag = svg.slice(textOpenTag, alphaIndex);
    expect(tag).toContain('font-size="20"');
    expect(tag).toContain('font-weight="bold"');
    expect(tag).toContain('font-style="italic"');
    expect(tag).toContain('fill="#ff00ff"');
    expect(tag).toContain('text-anchor="start"');

    // Node B has no override — default font-size, no bold/italic, default anchor.
    const betaIndex = svg.indexOf('Beta');
    const betaTag = svg.slice(svg.lastIndexOf('<text', betaIndex), betaIndex);
    expect(betaTag).toContain('font-size="13"');
    expect(betaTag).toContain('font-weight="normal"');
    expect(betaTag).toContain('text-anchor="middle"');
  });

  it('applies an instance text override to an edge label: font-size/weight/style/color (PLAN4.md step 12.5)', () => {
    const labeledDiagram: Diagram = { ...diagram, links: [{ from: 'A', to: 'B', type: 'request', label: 'fetches' }] };
    const svg = renderDiagramSVGString(labeledDiagram, layout, positions, {}, {
      edgeStyles: { 'A->B:request': { text: { fontSize: 18, bold: true, color: '#00ff00' } } },
    });
    const labelIndex = svg.indexOf('fetches');
    const tag = svg.slice(svg.lastIndexOf('<text', labelIndex), labelIndex);
    expect(tag).toContain('font-size="18"');
    expect(tag).toContain('font-weight="bold"');
    expect(tag).toContain('fill="#00ff00"');
  });

  it('a hidden connector (PLAN4.md step 12.7) is skipped entirely — no line, marker, or label', () => {
    const labeledDiagram: Diagram = { ...diagram, links: [{ from: 'A', to: 'B', type: 'request', label: 'fetches' }] };
    const svg = renderDiagramSVGString(labeledDiagram, layout, positions, {}, { hiddenEdges: new Set(['A->B:request']) });
    expect(svg).not.toContain('<polyline');
    expect(svg).not.toContain('fetches');
    expect(svg).not.toContain('marker-end');
  });

  it('a visible connector is unaffected when a DIFFERENT edge is hidden', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions, {}, { hiddenEdges: new Set(['X->Y:request']) });
    expect(svg).toContain('<polyline');
  });

  it('a hidden node label (PLAN4.md step 12.7) draws the shape without its text', () => {
    const svg = renderDiagramSVGString(diagram, layout, positions, {}, { hiddenNodeLabels: new Set(['A']) });
    expect(svg).not.toContain('Alpha');
    expect(svg).toContain('Beta');
    expect(svg).toContain('<ellipse'); // Alpha's actor shape still renders
  });

  it('draws the edge label at its offset, respecting global and per-edge visibility (PLAN3.md step 11.9)', () => {
    const labeledDiagram: Diagram = { ...diagram, links: [{ from: 'A', to: 'B', type: 'request', label: 'fetches' }] };

    const shown = renderDiagramSVGString(labeledDiagram, layout, positions);
    expect(shown).toContain('fetches');

    const hiddenGlobally = renderDiagramSVGString(labeledDiagram, layout, positions, {}, { showEdgeLabels: false });
    expect(hiddenGlobally).not.toContain('fetches');

    const hiddenIndividually = renderDiagramSVGString(labeledDiagram, layout, positions, {}, {
      hiddenEdgeLabels: new Set(['A->B:request']),
    });
    expect(hiddenIndividually).not.toContain('fetches');

    const offset = renderDiagramSVGString(labeledDiagram, layout, positions, {}, {
      edgeLabelOffsets: { 'A->B:request': { x: 30, y: 5 } },
    });
    // Edge midpoint is (80,90); with the +30/+5 offset the label lands at (110,95).
    expect(offset).toContain('x="110" y="95"');
  });
});
