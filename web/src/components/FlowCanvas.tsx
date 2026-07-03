import { useMemo, useRef } from 'react';
import type { DragEvent } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
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

/** dataTransfer MIME type used by the node palette (PLAN.md step 7.2). */
export const DND_NODE_TYPE = 'application/dc-node-type';

interface Props {
  diagram: Diagram;
  layout: DiagramLayout;
  positions: Record<string, LayoutPosition>;
  onNodeDrag?: (id: string, pos: LayoutPosition) => void;
  visitedStepKeys?: Set<string>;
  activeStep?: ActiveStep;
  onNodeDoubleClick?: (node: DiagramNode) => void;
  onNodeClick?: (node: DiagramNode) => void;
  selectedNodeId?: string | null;
  onDropNodeType?: (type: string, position: LayoutPosition) => void;
  onConnectNodes?: (source: string, target: string) => void;
  hoveredLinkIndex?: number | null;
  onEdgeHover?: (index: number | null) => void;
  onEdgeClick?: (index: number) => void;
}

function FlowCanvasInner({
  diagram,
  layout,
  positions,
  onNodeDrag,
  visitedStepKeys,
  activeStep,
  onNodeDoubleClick,
  onNodeClick,
  selectedNodeId,
  onDropNodeType,
  onConnectNodes,
  hoveredLinkIndex,
  onEdgeHover,
  onEdgeClick,
}: Props) {
  const nodeById = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram.nodes]);
  // A single click commits a state update (selection) that recomputes the
  // `nodes` array passed into <ReactFlow>, which can churn the underlying
  // DOM node — if that happens between the two physical clicks of a
  // double-click, the browser stops treating them as one gesture and
  // `dblclick` never fires. Deferring the click side effect past the
  // double-click detection window (and cancelling it if a dblclick
  // arrives first) keeps both gestures working (PLAN.md step 7.2).
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKey = activeStep ? pairKey(activeStep.from, activeStep.to) : null;
  const { screenToFlowPosition } = useReactFlow();

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
            isSelected: selectedNodeId === n.id,
          },
        };
      }),
    [layout.nodes, nodeById, positions, activeStep, activeKey, selectedNodeId],
  );

  const rfEdges = useMemo(
    () =>
      diagram.links.map((l, i) => {
        const key = pairKey(l.from, l.to);
        const isActive = key === activeKey;
        const isVisited = !isActive && (visitedStepKeys?.has(key) ?? false);
        const data: DcEdgeData = {
          label: l.label,
          linkType: l.type,
          isActive,
          isVisited,
          isHovered: hoveredLinkIndex === i,
        };
        return {
          id: `link-${i}-${l.from}-${l.to}`,
          source: l.from,
          target: l.to,
          type: 'dc-edge',
          markerEnd: 'arrow',
          data,
        };
      }),
    [diagram.links, activeKey, visitedStepKeys, hoveredLinkIndex],
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

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!onDropNodeType) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!onDropNodeType) return;
    const type = e.dataTransfer.getData(DND_NODE_TYPE);
    if (!type) return;
    e.preventDefault();
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDropNodeType(type, position);
  };

  return (
    <div
      data-testid="reactflow-canvas"
      style={{ width: '100%', height: 600 }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onNodeDoubleClick={(_, node) => {
          if (clickTimer.current) {
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
          }
          const dcNode = nodeById.get(node.id);
          if (dcNode && onNodeDoubleClick) onNodeDoubleClick(dcNode);
        }}
        onNodeClick={(_, node) => {
          if (clickTimer.current) clearTimeout(clickTimer.current);
          clickTimer.current = setTimeout(() => {
            clickTimer.current = null;
            const dcNode = nodeById.get(node.id);
            if (dcNode && onNodeClick) onNodeClick(dcNode);
          }, 250);
        }}
        onConnect={(connection) => {
          if (onConnectNodes && connection.source && connection.target) {
            onConnectNodes(connection.source, connection.target);
          }
        }}
        onEdgeMouseEnter={(_, edge) => {
          const index = Number(edge.id.split('-')[1]);
          onEdgeHover?.(Number.isNaN(index) ? null : index);
        }}
        onEdgeMouseLeave={() => onEdgeHover?.(null)}
        onEdgeClick={(_, edge) => {
          const index = Number(edge.id.split('-')[1]);
          if (!Number.isNaN(index)) onEdgeClick?.(index);
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
