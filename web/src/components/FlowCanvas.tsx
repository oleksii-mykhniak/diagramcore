import { useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
} from '@xyflow/react';
import type { Node, NodeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Diagram, DiagramNode } from '../types';
import { nodeLabel } from '../types';
import type { DiagramLayout } from '../layout';
import type { LayoutPosition } from '../layoutFile';
import { pairKey } from '../flowPlayer';
import { nodeTypes, resolveNodeType } from './rfNodeTypes';
import type { DcNodeData } from './rfNodeTypes';
import { edgeTypes } from './rfEdgeTypes';
import type { DcEdgeData } from './rfEdgeTypes';

export interface ActiveStep {
  from: string;
  to: string;
}

interface Props {
  diagram: Diagram;
  layout: DiagramLayout;
  positions: Record<string, LayoutPosition>;
  onNodeDrag?: (id: string, pos: LayoutPosition) => void;
  visitedStepKeys?: Set<string>;
  activeStep?: ActiveStep;
  onNodeDoubleClick?: (node: DiagramNode) => void;
}

function FlowCanvasInner({ diagram, layout, positions, onNodeDrag, visitedStepKeys, activeStep, onNodeDoubleClick }: Props) {
  const nodeById = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram.nodes]);
  const activeKey = activeStep ? pairKey(activeStep.from, activeStep.to) : null;

  const rfNodes: Node<DcNodeData>[] = useMemo(
    () =>
      layout.nodes.map((n) => {
        const dcNode = nodeById.get(n.id);
        const pos = positions[n.id] ?? n;
        return {
          id: n.id,
          type: resolveNodeType(dcNode?.type ?? 'component'),
          position: { x: pos.x, y: pos.y },
          data: {
            label: dcNode ? nodeLabel(dcNode) : n.id,
            hasDetails: Boolean(dcNode?.details),
            isActive: activeKey !== null && (activeStep?.from === n.id || activeStep?.to === n.id),
            isVisited: false,
          },
        };
      }),
    [layout.nodes, nodeById, positions, activeStep, activeKey],
  );

  const rfEdges = useMemo(
    () =>
      diagram.links.map((l, i) => {
        const key = pairKey(l.from, l.to);
        const isActive = key === activeKey;
        const isVisited = !isActive && (visitedStepKeys?.has(key) ?? false);
        const data: DcEdgeData = { label: l.label, linkType: l.type, isActive, isVisited };
        return {
          id: `link-${i}-${l.from}-${l.to}`,
          source: l.from,
          target: l.to,
          type: 'dc-edge',
          markerEnd: 'arrow',
          data,
        };
      }),
    [diagram.links, activeKey, visitedStepKeys],
  );

  const handleNodesChange = (changes: NodeChange<Node<DcNodeData>>[]) => {
    if (!onNodeDrag) return;
    const next = applyNodeChanges(changes, rfNodes);
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        onNodeDrag(change.id, change.position);
      }
    }
    void next;
  };

  return (
    <div data-testid="reactflow-canvas" style={{ width: '100%', height: 600 }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onNodeDoubleClick={(_, node) => {
          const dcNode = nodeById.get(node.id);
          if (dcNode && onNodeDoubleClick) onNodeDoubleClick(dcNode);
        }}
        fitView
      >
        <Background />
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
