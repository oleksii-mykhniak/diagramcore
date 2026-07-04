import { useEffect, useMemo, useRef } from 'react';
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
import type { Diagram, DiagramNode, DiagramNoteDef } from '../types';
import { nodeLabel } from '../types';
import type { DiagramLayout } from '../layout';
import type { LayoutPosition } from '../layoutFile';
import { pairKey } from '../flowPlayer';
import { nodeTypes, resolveNodeType } from './rfNodeTypes';
import type { DcNodeData, NoteNodeData } from './rfNodeTypes';
import { nodeVisual } from '../shapes';
import type { RenderStyle } from '../shapes';
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
  /** Bump `focusNonce` (any change) alongside `focusNodeId` to re-trigger
   * the pan/zoom even if the same node is focused twice in a row
   * (PLAN.md step 7.6, Problems panel "click to focus"). */
  focusNodeId?: string | null;
  focusNonce?: number;
  /** View → Grid/Snap to grid (PLAN.md step 10.5), persisted by the caller. */
  showGrid?: boolean;
  snapToGridEnabled?: boolean;
  /** Free-text annotations (PLAN.md step 10.11). */
  notes?: DiagramNoteDef[];
  notePositions?: Record<string, LayoutPosition>;
  onNoteDrag?: (id: string, pos: LayoutPosition) => void;
  onNoteDoubleClick?: (note: DiagramNoteDef) => void;
  onDropNoteType?: (pos: LayoutPosition) => void;
  showDescriptions?: boolean;
  /** View → "Diagram style" (PLAN.md step 10.12), persisted per-diagram
   * in the layout file/share link (unlike grid/snap, which are pure UI
   * prefs) since it changes how the diagram looks, not just the editor
   * chrome. */
  renderStyle?: RenderStyle;
}

/** dataTransfer type value used by the palette's "Text" (note) item. */
export const NOTE_DND_TYPE = 'note';

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
  focusNodeId,
  focusNonce,
  showGrid = true,
  snapToGridEnabled = false,
  notes,
  notePositions,
  onNoteDrag,
  onNoteDoubleClick,
  onDropNoteType,
  showDescriptions = false,
  renderStyle,
}: Props) {
  const nodeById = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram.nodes]);
  const noteById = useMemo(() => new Map((notes ?? []).map((n) => [n.id, n])), [notes]);
  const { fitView, screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    if (!focusNodeId) return;
    void fitView({ nodes: [{ id: focusNodeId }], duration: 300, maxZoom: 1.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNodeId, focusNonce]);

  // A single click commits a state update (selection) that recomputes the
  // `nodes` array passed into <ReactFlow>, which can churn the underlying
  // DOM node — if that happens between the two physical clicks of a
  // double-click, the browser stops treating them as one gesture and
  // `dblclick` never fires. Deferring the click side effect past the
  // double-click detection window (and cancelling it if a dblclick
  // arrives first) keeps both gestures working (PLAN.md step 7.2).
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKey = activeStep ? pairKey(activeStep.from, activeStep.to) : null;

  const rfNodes: Node<DcNodeData>[] = useMemo(
    () =>
      layout.nodes.map((n) => {
        const dcNode = nodeById.get(n.id);
        const pos = positions[n.id] ?? n;
        const type = dcNode?.type ?? 'component';
        const rfType = resolveNodeType(type);
        const visual = rfType === 'custom' ? nodeVisual(diagram, type) : null;
        return {
          id: n.id,
          type: rfType,
          position: { x: pos.x, y: pos.y },
          data: {
            label: dcNode ? nodeLabel(dcNode) : n.id,
            hasDetails: Boolean(dcNode?.details),
            isActive: activeKey !== null && (activeStep?.from === n.id || activeStep?.to === n.id),
            isVisited: false,
            isSelected: selectedNodeId === n.id,
            description: dcNode?.description,
            showDescription: showDescriptions,
            renderStyle,
            ...(visual ? { customType: type, shape: visual.shape.name, color: visual.color, icon: visual.icon } : {}),
          },
        };
      }),
    [layout.nodes, nodeById, positions, activeStep, activeKey, selectedNodeId, diagram, showDescriptions, renderStyle],
  );

  const rfNoteNodes: Node<NoteNodeData>[] = useMemo(
    () =>
      (notes ?? []).map((note) => ({
        id: note.id,
        type: 'note',
        position: notePositions?.[note.id] ?? { x: 0, y: 0 },
        data: { text: note.text },
      })),
    [notes, notePositions],
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
          renderStyle,
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
    [diagram.links, activeKey, visitedStepKeys, hoveredLinkIndex, renderStyle],
  );

  const noteIds = useMemo(() => new Set((notes ?? []).map((n) => n.id)), [notes]);
  const allNodes = useMemo(() => [...rfNodes, ...rfNoteNodes] as Node[], [rfNodes, rfNoteNodes]);

  const handleNodesChange = (changes: NodeChange<Node>[]) => {
    const next = applyNodeChanges(changes, allNodes);
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        if (noteIds.has(change.id)) onNoteDrag?.(change.id, change.position);
        else onNodeDrag?.(change.id, change.position);
      }
    }
    void next;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!onDropNodeType && !onDropNoteType) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    const type = e.dataTransfer.getData(DND_NODE_TYPE);
    if (!type) return;
    e.preventDefault();
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (type === NOTE_DND_TYPE) {
      onDropNoteType?.(position);
      return;
    }
    onDropNodeType?.(type, position);
  };

  return (
    <div
      data-testid="reactflow-canvas"
      data-render-style={renderStyle ?? 'clean'}
      style={{ width: '100%', height: '100%' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={allNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onNodeDoubleClick={(_, node) => {
          if (clickTimer.current) {
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
          }
          if (noteIds.has(node.id)) {
            const note = noteById.get(node.id);
            if (note && onNoteDoubleClick) onNoteDoubleClick(note);
            return;
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
        snapToGrid={snapToGridEnabled}
        snapGrid={[10, 10]}
      >
        {showGrid && <Background />}
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
