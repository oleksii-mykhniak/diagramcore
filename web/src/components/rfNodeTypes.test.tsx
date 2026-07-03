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
});
