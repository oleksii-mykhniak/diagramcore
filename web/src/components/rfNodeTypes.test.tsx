import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  ActorNode,
  ComponentNode,
  ExternalNode,
  QueueNode,
  ServiceNode,
  StorageNode,
} from './rfNodeTypes';
import { resolveShape } from '../shapes';
import { NODE_WIDTH, NODE_HEIGHT } from '../layout';
import { renderDiagramSVGString } from '../svgExport';
import type { Diagram } from '../types';
import type { DiagramLayout } from '../layout';

const baseData = { label: 'X', hasDetails: false, isActive: false, isVisited: false };
const baseProps = {
  id: 'n1',
  data: baseData,
  selected: false,
  type: 'x',
  dragging: false,
  zIndex: 0,
  isConnectable: true,
  xPos: 0,
  yPos: 0,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
} as unknown as NodeProps;

const components = {
  actor: ActorNode,
  service: ServiceNode,
  storage: StorageNode,
  queue: QueueNode,
  external: ExternalNode,
  component: ComponentNode,
};

describe('rf node types', () => {
  it('each of the 6 base types renders a distinct data-node-type and CSS class', () => {
    const seen = new Set<string>();
    for (const [type, Component] of Object.entries(components)) {
      const { container } = render(
        <ReactFlowProvider>
          <Component {...baseProps} />
        </ReactFlowProvider>,
      );
      const el = container.querySelector(`[data-node-type="${type}"]`);
      expect(el).not.toBeNull();
      expect(el?.className).toContain(`rf-node--${type}`);
      seen.add(el?.className ?? '');
    }
    expect(seen.size).toBe(Object.keys(components).length);
  });

  it('canvas and export draw the same geometry for each base type through the shared shape registry', () => {
    // Normalizes both color attributes (canvas uses var(--...), export
    // uses resolved hex) and jsdom's self-closing-tag serialization
    // (`<ellipse .../>` round-trips through innerHTML as `<ellipse ...></ellipse>`).
    const stripColors = (svg: string) =>
      svg
        .replace(/(?:fill|stroke)="[^"]*"/g, '')
        .replace(/<(\w+)([^>]*)><\/\1>/g, '<$1$2/>')
        .replace(/\s+\/>/g, '/>')
        .replace(/\s+/g, ' ');

    for (const [type, Component] of Object.entries(components)) {
      const { container } = render(
        <ReactFlowProvider>
          <Component {...baseProps} />
        </ReactFlowProvider>,
      );
      const canvasSvg = container.querySelector(`[data-node-type="${type}"] svg`)?.innerHTML ?? '';

      const diagram: Diagram = {
        diagram: { title: 'T' },
        nodes: [{ id: 'N', type, label: 'X' }],
        links: [],
      };
      const layout: DiagramLayout = {
        nodes: [{ id: 'N', x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT }],
        edges: [],
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
      const exportSvg = renderDiagramSVGString(diagram, layout, { N: { x: 0, y: 0 } });
      const exportShapeSvg = resolveShape(type).renderSvgInner(NODE_WIDTH, NODE_HEIGHT, {
        fill: '#x',
        stroke: '#x',
        strokeWidth: 1.5,
      });
      expect(stripColors(exportSvg)).toContain(stripColors(exportShapeSvg));
      expect(stripColors(canvasSvg)).toBe(stripColors(exportShapeSvg));
    }
  });
});
