import { useState } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactFlowProps } from '@xyflow/react';
import { FlowCanvas } from './FlowCanvas';
import { NODE_WIDTH, NODE_HEIGHT } from '../layout';
import type { Diagram } from '../types';
import type { DiagramLayout } from '../layout';

// Captures the props FlowCanvas hands to <ReactFlow>, so the test can drive
// `onNodesChange`/`onNodeDragStop` directly instead of trying to simulate a
// real pointer-drag gesture through jsdom (React Flow's own drag handling
// needs measured DOM layout that jsdom doesn't provide). This exercises the
// exact wiring PLAN3.md step 11.1 is about: per-move changes must stay
// internal, only a drag-stop event may reach the caller.
let captured: ReactFlowProps | null = null;

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: (props: ReactFlowProps) => {
      captured = props;
      return <div data-testid="mock-reactflow" />;
    },
  };
});

const diagram: Diagram = {
  diagram: { title: 'T' },
  nodes: [
    { id: 'A', type: 'service' },
    { id: 'B', type: 'service' },
  ],
  links: [],
};

const layout: DiagramLayout = {
  nodes: [
    { id: 'A', x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT },
    { id: 'B', x: 300, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT },
  ],
  edges: [],
  width: 500,
  height: 200,
};

const renderCountRef = { count: 0 };

/** Wraps FlowCanvas the way `App`/`EditorWorkspace` do: owning `positions`
 * in parent state and only updating it from the drag-stop commit callback. */
function ParentProbe({ onRenderCountChange }: { onRenderCountChange: (n: number) => void }) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({
    A: { x: 0, y: 0 },
    B: { x: 300, y: 0 },
  });
  renderCountRef.count += 1;
  onRenderCountChange(renderCountRef.count);
  return (
    <FlowCanvas
      diagram={diagram}
      layout={layout}
      positions={positions}
      onNodeDragStop={(id, pos) => setPositions((p) => ({ ...p, [id]: pos }))}
    />
  );
}

describe('FlowCanvas drag performance (PLAN3.md step 11.1)', () => {
  it('per-move position changes stay internal to React Flow; only drag-stop commits to the caller', async () => {
    renderCountRef.count = 0;
    let renders = 0;
    render(<ParentProbe onRenderCountChange={(n) => (renders = n)} />);
    await waitFor(() => expect(captured).not.toBeNull());

    const rendersAfterMount = renders;

    // Simulate several in-flight drag moves (as React Flow's own
    // onNodesChange would report while dragging=true).
    act(() => {
      for (const [x, y] of [
        [10, 10],
        [20, 15],
        [30, 25],
      ]) {
        captured!.onNodesChange?.([
          { id: 'A', type: 'position', position: { x, y }, dragging: true },
        ]);
      }
    });
    // In-flight moves must not have triggered a parent re-render — they're
    // absorbed by React Flow's own internal node state.
    expect(renders).toBe(rendersAfterMount);

    // Drag release: React Flow calls onNodeDragStop once.
    act(() => {
      captured!.onNodeDragStop?.(
        new MouseEvent('pointerup') as unknown as never,
        { id: 'A', position: { x: 30, y: 25 } } as never,
        [] as never,
      );
    });

    await waitFor(() => expect(renders).toBe(rendersAfterMount + 1));
  });
});
