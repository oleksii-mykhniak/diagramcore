import { useEffect, useMemo, useRef } from 'react';
import type { DragEvent } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './FlowCanvas.css';
import type { Diagram, DiagramNode, DiagramNoteDef } from '../types';
import { nodeLabel } from '../types';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH } from '../layout';
import type { DiagramLayout } from '../layout';
import type { LayoutPosition } from '../layoutFile';
import { pairKey } from '../flowPlayer';
import { nodeTypes, resolveNodeType } from './rfNodeTypes';
import type { ContainerNodeData, DcNodeData, NoteNodeData } from './rfNodeTypes';
import { resolveNodeStyle } from '../shapes';
import type { RenderStyle, StyleOverride } from '../shapes';
import { edgeLinkKey, resolveEdgeColor, resolveEdgeStyle } from '../edgeStyle';
import type { EdgeMarker, EdgeStyleOverride } from '../edgeStyle';
import { edgeTypes } from './rfEdgeTypes';
import type { DcEdgeData } from './rfEdgeTypes';

/** Marker as an object (not a bare `MarkerType`) so it carries an
 * explicit `color` — React Flow's default marker otherwise falls back
 * to a fixed CSS var untouched by this edge's own stroke color, so a
 * colored/active/visited/hovered edge would draw its line in one color
 * and its arrowhead in another (PLAN4.md step 12.2). */
function toRfMarker(kind: EdgeMarker, color: string): { type: MarkerType; color: string } | undefined {
  switch (kind) {
    case 'none':
      return undefined;
    case 'arrow':
      return { type: MarkerType.ArrowClosed, color };
    case 'open-arrow':
      return { type: MarkerType.Arrow, color };
  }
}

export interface ActiveStep {
  from: string;
  to: string;
}

/** dataTransfer MIME type used by the node palette (PLAN.md step 7.2). */
export const DND_NODE_TYPE = 'application/dc-node-type';

/** Extra room (PLAN3.md step 11.6) kept between a container's bottom/
 * right edge and its resize floor beyond its children's own bounding
 * box — matches the layout engine's own container padding so a
 * container that hasn't been manually resized doesn't start out
 * exactly at its resize floor. */
const CONTAINER_MARGIN = { right: 20, bottom: 20 };

interface Props {
  diagram: Diagram;
  layout: DiagramLayout;
  positions: Record<string, LayoutPosition>;
  /** Committed once per drag gesture, on release — NOT on every
   * mousemove (PLAN3.md step 11.1). Position changes during the drag
   * live only in React Flow's own internal node state; the document
   * (and thus the rest of the app) only re-renders when the drag ends.
   * `newParent` (PLAN3.md step 11.6) is passed only when the drag ended
   * with the node's container assignment changed: a container id if it
   * now overlaps one, `null` if it was dragged out of its old one —
   * `undefined` means "unchanged, don't touch `parent:`". */
  onNodeDragStop?: (id: string, pos: LayoutPosition, newParent?: string | null) => void;
  /** Manually-resized node dimensions (PLAN3.md step 11.4) — like
   * `positions`, only nodes the user actually resized get an entry. */
  sizes?: Record<string, { width: number; height: number }>;
  /** Committed once per resize gesture, on release (same single-commit
   * pattern as `onNodeDragStop`). `pos` is the node's new absolute
   * position — top/left-handle resizes shift x/y along with the size to
   * keep the opposite edge anchored, and that has to be committed too or
   * the node snaps back to its pre-resize position on the next render
   * (PLAN3.md step 11.4 follow-up fix). */
  onNodeResizeStop?: (id: string, size: { width: number; height: number }, pos: LayoutPosition) => void;
  /** Instance-level style overrides (PLAN3.md step 11.8) — like `sizes`,
   * only nodes the user actually styled get an entry. */
  styles?: Record<string, StyleOverride>;
  visitedStepKeys?: Set<string>;
  activeStep?: ActiveStep;
  onNodeDoubleClick?: (node: DiagramNode) => void;
  onNodeClick?: (node: DiagramNode) => void;
  /** Multi-selection (PLAN3.md step 11.10), driven by React Flow's own
   * rubber-band select — drives the node highlight; a plain single click
   * sets this to a single-id array too (see `useDiagramEditing.ts`). */
  selectedNodeIds?: string[];
  /** Fires on every rubber-band selection change (and on empty-pane
   * click, which clears it) — the caller owns turning this into its
   * own selection state. */
  onSelectionChange?: (ids: string[]) => void;
  /** Group drag (PLAN3.md step 11.10): every dragged node's new absolute
   * position, committed once on release. Container reparenting isn't
   * checked for a group drag (only single-node `onNodeDragStop` does). */
  onGroupDragStop?: (updates: Array<{ id: string; pos: LayoutPosition }>) => void;
  onDropNodeType?: (type: string, position: LayoutPosition) => void;
  onConnectNodes?: (source: string, target: string) => void;
  hoveredLinkIndex?: number | null;
  onEdgeHover?: (index: number | null) => void;
  onEdgeClick?: (index: number) => void;
  /** Instance-level edge style overrides (PLAN3.md step 11.9), keyed by
   * `edgeStyle.ts`'s `edgeLinkKey`. */
  edgeStyles?: Record<string, EdgeStyleOverride>;
  /** Edge label drag offsets relative to the edge's own midpoint
   * (PLAN3.md step 11.9), keyed by link-key. */
  edgeLabelOffsets?: Record<string, LayoutPosition>;
  /** Link-keys whose label is individually hidden (PLAN3.md step 11.9). */
  hiddenEdgeLabels?: Set<string>;
  /** View → "Connection labels" show/hide-all (PLAN3.md step 11.9). */
  showEdgeLabels?: boolean;
  /** Committed once per label-drag gesture, on release. */
  onEdgeLabelDragStop?: (linkIndex: number, offset: LayoutPosition) => void;
  onEdgeLabelDoubleClick?: (linkIndex: number) => void;
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
  onNodeDragStop,
  sizes,
  onNodeResizeStop,
  styles,
  visitedStepKeys,
  activeStep,
  onNodeDoubleClick,
  onNodeClick,
  selectedNodeIds,
  onSelectionChange,
  onGroupDragStop,
  onDropNodeType,
  onConnectNodes,
  hoveredLinkIndex,
  onEdgeHover,
  onEdgeClick,
  edgeStyles,
  edgeLabelOffsets,
  hiddenEdgeLabels,
  showEdgeLabels = true,
  onEdgeLabelDragStop,
  onEdgeLabelDoubleClick,
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

  /** Container geometry (PLAN3.md step 11.6): every node's absolute
   * position/size (manual override merged over the auto-layout
   * default), which container ids exist (any node referenced by another
   * node's resolved `parent`), and each container's children — shared
   * between building RF nodes (below) and the drag-stop reparent check
   * (`handleNodeDragStop`). */
  const geometry = useMemo(() => {
    const containerIds = new Set<string>();
    const childrenOf = new Map<string, string[]>();
    for (const n of layout.nodes) {
      if (n.parent) {
        containerIds.add(n.parent);
        const arr = childrenOf.get(n.parent) ?? [];
        arr.push(n.id);
        childrenOf.set(n.parent, arr);
      }
    }
    const absoluteById = new Map(layout.nodes.map((n) => [n.id, positions[n.id] ?? { x: n.x, y: n.y }]));
    const sizeById = new Map(layout.nodes.map((n) => [n.id, sizes?.[n.id] ?? { width: n.width, height: n.height }]));
    const layoutNodeById = new Map(layout.nodes.map((n) => [n.id, n]));
    return { containerIds, childrenOf, absoluteById, sizeById, layoutNodeById };
  }, [layout.nodes, positions, sizes]);

  const rfNodes: Node<DcNodeData | ContainerNodeData>[] = useMemo(
    () =>
      layout.nodes.map((n) => {
        const dcNode = nodeById.get(n.id);
        const abs = geometry.absoluteById.get(n.id) ?? n;
        const size = geometry.sizeById.get(n.id) ?? { width: n.width, height: n.height };
        const isContainer = geometry.containerIds.has(n.id);
        const type = dcNode?.type ?? 'component';
        const rfType = isContainer ? 'container' : resolveNodeType(type);
        const resolvedStyle = isContainer ? null : resolveNodeStyle(diagram, type, styles?.[n.id]);

        let position = abs;
        if (n.parent) {
          const parentAbs = geometry.absoluteById.get(n.parent) ?? { x: 0, y: 0 };
          position = { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y };
        }

        let minWidth = MIN_NODE_WIDTH;
        let minHeight = MIN_NODE_HEIGHT;
        if (isContainer) {
          for (const childId of geometry.childrenOf.get(n.id) ?? []) {
            const cAbs = geometry.absoluteById.get(childId);
            const cSize = geometry.sizeById.get(childId);
            if (!cAbs || !cSize) continue;
            minWidth = Math.max(minWidth, cAbs.x - abs.x + cSize.width + CONTAINER_MARGIN.right);
            minHeight = Math.max(minHeight, cAbs.y - abs.y + cSize.height + CONTAINER_MARGIN.bottom);
          }
        }

        return {
          id: n.id,
          type: rfType,
          position,
          width: size.width,
          height: size.height,
          // React Flow's own `selected` flag (PLAN3.md step 11.10) is
          // deliberately NOT derived from `selectedNodeId`/`selectedNodeIds`
          // here — this object only gets (re)built (via the `allNodes`
          // memo below) on real external changes (load, undo, relayout,
          // drag-stop), same as `position`. A separate effect further
          // down patches `selected`/`data.isSelected` directly onto the
          // *live* `nodes` state on every selection change instead: doing
          // it here would make `allNodes` (and thus the position-resync
          // effect) depend on selection too, so simply *clicking* a node
          // mid-drag would recompute `allNodes` and reset the in-progress
          // drag position back to its last-committed value.
          selected: false,
          ...(n.parent ? { parentId: n.parent } : {}),
          data: isContainer
            ? {
                label: dcNode ? nodeLabel(dcNode) : n.id,
                isSelected: false,
                minWidth,
                minHeight,
                onResizeEnd: (next: { width: number; height: number; x: number; y: number }) =>
                  onNodeResizeStop?.(
                    n.id,
                    { width: next.width, height: next.height },
                    n.parent
                      ? { x: next.x + (geometry.absoluteById.get(n.parent)?.x ?? 0), y: next.y + (geometry.absoluteById.get(n.parent)?.y ?? 0) }
                      : { x: next.x, y: next.y },
                  ),
              }
            : {
                label: dcNode ? nodeLabel(dcNode) : n.id,
                hasDetails: Boolean(dcNode?.details),
                isActive: activeKey !== null && (activeStep?.from === n.id || activeStep?.to === n.id),
                isVisited: false,
                isSelected: false,
                description: dcNode?.description,
                showDescription: showDescriptions,
                renderStyle,
                onResizeEnd: (next: { width: number; height: number; x: number; y: number }) =>
                  onNodeResizeStop?.(
                    n.id,
                    { width: next.width, height: next.height },
                    n.parent
                      ? { x: next.x + (geometry.absoluteById.get(n.parent)?.x ?? 0), y: next.y + (geometry.absoluteById.get(n.parent)?.y ?? 0) }
                      : { x: next.x, y: next.y },
                  ),
                color: resolvedStyle?.fill,
                strokeColor: resolvedStyle?.stroke,
                strokeWidthOverride: resolvedStyle?.strokeWidth,
                lineStyle: resolvedStyle?.lineStyle,
                rounded: resolvedStyle?.rounded,
                ...(rfType === 'custom' && resolvedStyle
                  ? { customType: type, shape: resolvedStyle.shape.name, icon: resolvedStyle.icon }
                  : {}),
              },
        };
      }),
    [
      layout.nodes,
      nodeById,
      geometry,
      activeStep,
      activeKey,
      diagram,
      showDescriptions,
      renderStyle,
      onNodeResizeStop,
      styles,
    ],
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
        const linkKey = edgeLinkKey(l);
        const resolved = resolveEdgeStyle(edgeStyles?.[linkKey]);
        const hidden = hiddenEdgeLabels?.has(linkKey) ?? false;
        const isHovered = hoveredLinkIndex === i;
        const markerColor = resolveEdgeColor({ isActive, isVisited, isHovered, color: resolved.color });
        const data: DcEdgeData = {
          label: l.label,
          linkType: l.type,
          isActive,
          isVisited,
          isHovered,
          renderStyle,
          color: resolved.color,
          strokeWidthOverride: resolved.strokeWidth,
          lineStyle: resolved.lineStyle,
          labelOffset: edgeLabelOffsets?.[linkKey],
          showLabel: showEdgeLabels && !hidden,
          onLabelDragStop: (offset) => onEdgeLabelDragStop?.(i, offset),
          onLabelDoubleClick: () => onEdgeLabelDoubleClick?.(i),
        };
        return {
          id: `link-${i}-${l.from}-${l.to}`,
          source: l.from,
          target: l.to,
          type: 'dc-edge',
          markerEnd: toRfMarker(resolved.markerEnd, markerColor),
          markerStart: toRfMarker(resolved.markerStart, markerColor),
          // React Flow's own `selected` flag, explicitly unconditional
          // (PLAN3.md step 11.10 doesn't add edge multi-select) — for the
          // same reason node objects now set `selected` too: leaving it
          // `undefined` here lets it drift from whatever RF's internal
          // click/selection tracking last set on this edge, and every
          // external resync (`edges` changes identity every render since
          // this whole array is freshly built) then "corrects" it back,
          // which is itself a selection-change RF reacts to — a loop.
          selected: false,
          data,
        };
      }),
    [
      diagram.links,
      activeKey,
      visitedStepKeys,
      hoveredLinkIndex,
      renderStyle,
      edgeStyles,
      edgeLabelOffsets,
      hiddenEdgeLabels,
      showEdgeLabels,
      onEdgeLabelDragStop,
      onEdgeLabelDoubleClick,
    ],
  );

  const noteIds = useMemo(() => new Set((notes ?? []).map((n) => n.id)), [notes]);
  const allNodes = useMemo(() => [...rfNodes, ...rfNoteNodes] as Node[], [rfNodes, rfNoteNodes]);

  // Positions during an in-progress drag live entirely in React Flow's own
  // node state (`useNodesState`); the parent-owned `positions`/`layout`
  // props (and thus `allNodes`) only change on real external events (load,
  // undo, relayout, or the single commit at drag end below) — never once
  // per mousemove. That keeps this sync effect from firing mid-drag, so a
  // drag no longer forces `App`/`EditorWorkspace` to re-render on every
  // frame (PLAN3.md step 11.1).
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(allNodes);
  useEffect(() => {
    setNodes(allNodes);
  }, [allNodes, setNodes]);

  // Applies `selectedNodeIds` (PLAN3.md step 11.10) onto the *live* `nodes`
  // state via the functional updater — never through `allNodes` (see the
  // "selected: false" comment above) — so it can't clobber an in-progress
  // drag's position. Re-runs after every position resync too (`allNodes`
  // in the deps), since that resync just reset every node's
  // `selected`/`data.isSelected` to `false`.
  //
  // Deliberately keyed off `selectedNodeIds` alone, NOT `selectedNodeId`:
  // `selectedNodeId` is the Properties-panel target and, on a double-click,
  // is intentionally left stale (see `onSelectionChange` comment in
  // `useDiagramEditing.ts`) to avoid flipping the right dock. If this effect
  // also honored `selectedNodeId`, that staleness kept the *previously*
  // selected node highlighted forever after double-clicking a different
  // node, since `selectedNodeIds` had already moved on but the stale id
  // kept forcing the old node's `isSelected` back to `true`.
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const isSelected = selectedNodeIds?.includes(n.id) ?? false;
        const prevIsSelected = (n.data as { isSelected?: boolean } | undefined)?.isSelected ?? false;
        if (n.selected === isSelected && prevIsSelected === isSelected) return n;
        return { ...n, selected: isSelected, data: { ...n.data, isSelected } };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeIds, allNodes, setNodes]);

  // Rubber-band selection (PLAN3.md step 11.10) is derived from `nodes`
  // itself (already synced through `onNodesChange`'s own 'select' change
  // events) rather than React Flow's separate `onSelectionChange` prop —
  // subscribing to that prop directly was observed to put RF's internal
  // store into a render loop ("Maximum update depth exceeded") whenever
  // several selected nodes/edges were removed in the same commit (e.g.
  // deleting a node with multiple dependent links). Reading `.selected`
  // off nodes we already own sidesteps that RF-internal instability
  // entirely, at the cost of nothing (this effect fires on every `nodes`
  // change, not just selection ones, but `onSelectionChange` is already
  // guarded by the caller against no-op updates — see `useDiagramEditing.ts`).
  useEffect(() => {
    onSelectionChange?.(nodes.filter((n) => n.selected && !noteIds.has(n.id)).map((n) => n.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  /** True if `candidateId` is `ofId` itself, or a descendant of it —
   * used to keep a container drag from being reparented into its own
   * subtree (which would create a cycle). */
  const isSelfOrDescendant = (candidateId: string, ofId: string): boolean => {
    let cur: string | undefined = candidateId;
    while (cur !== undefined) {
      if (cur === ofId) return true;
      cur = geometry.layoutNodeById.get(cur)?.parent;
    }
    return false;
  };

  /** Converts an RF (possibly parent-relative) drag position back to an
   * absolute canvas position — shared by the single-node and group drag
   * handlers below. */
  const toAbsolutePosition = (id: string, rfPosition: LayoutPosition): LayoutPosition => {
    const parent = geometry.layoutNodeById.get(id)?.parent;
    const parentAbs = parent ? geometry.absoluteById.get(parent) : undefined;
    return parentAbs ? { x: rfPosition.x + parentAbs.x, y: rfPosition.y + parentAbs.y } : rfPosition;
  };

  const handleNodeDragStop = (id: string, rfPosition: LayoutPosition) => {
    if (noteIds.has(id)) {
      onNoteDrag?.(id, rfPosition);
      return;
    }
    // A node that's part of a multi-selection moves together with the
    // rest of the selection (PLAN3.md step 11.10) — `onSelectionDragStop`
    // handles the whole group as one commit; skip the single-node path
    // (with its container-reparent check, which a group drag doesn't do)
    // so the two handlers can't double-commit the same drag.
    if ((selectedNodeIds?.length ?? 0) > 1 && selectedNodeIds?.includes(id)) return;
    const ln = geometry.layoutNodeById.get(id);
    const oldParent = ln?.parent;
    const parentAbs = oldParent ? geometry.absoluteById.get(oldParent) : undefined;
    const absPosition = parentAbs ? { x: rfPosition.x + parentAbs.x, y: rfPosition.y + parentAbs.y } : rfPosition;

    // Container-crossing check (PLAN3.md step 11.6): does the dragged
    // node's new center now fall inside a different container? Picks
    // the smallest-area match so dropping into a nested container picks
    // the innermost one, not an outer ancestor it also overlaps.
    const size = geometry.sizeById.get(id) ?? { width: ln?.width ?? 0, height: ln?.height ?? 0 };
    const centerX = absPosition.x + size.width / 2;
    const centerY = absPosition.y + size.height / 2;
    let newParent: string | null = null;
    let smallestArea = Infinity;
    for (const containerId of geometry.containerIds) {
      if (isSelfOrDescendant(containerId, id)) continue;
      const cAbs = geometry.absoluteById.get(containerId);
      const cSize = geometry.sizeById.get(containerId);
      if (!cAbs || !cSize) continue;
      const within =
        centerX >= cAbs.x && centerX <= cAbs.x + cSize.width && centerY >= cAbs.y && centerY <= cAbs.y + cSize.height;
      if (!within) continue;
      const area = cSize.width * cSize.height;
      if (area < smallestArea) {
        smallestArea = area;
        newParent = containerId;
      }
    }

    const parentChanged = newParent !== (oldParent ?? null);
    onNodeDragStop?.(id, absPosition, parentChanged ? newParent : undefined);
  };

  const handleSelectionDragStop = (draggedNodes: Node[]) => {
    const updates = draggedNodes
      .filter((n) => !noteIds.has(n.id))
      .map((n) => ({ id: n.id, pos: toAbsolutePosition(n.id, n.position) }));
    if (updates.length > 0) onGroupDragStop?.(updates);
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
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={() => {
          // A pending single-click selection timer (below) is only
          // cleared by a subsequent *click* on some node, never by a
          // *drag* — so clicking A then immediately dragging B left A's
          // timer armed to fire ~250ms into B's drag and clobber the
          // selection RF had already moved to B (visually: A stays
          // "active" briefly, then B's drag looks like it got reset).
          // Starting any drag means the click's single-select intent is
          // moot, so cancel it here too.
          if (clickTimer.current) {
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
          }
        }}
        onNodeDragStop={(_, node) => handleNodeDragStop(node.id, node.position)}
        onSelectionDragStop={(_, draggedNodes) => handleSelectionDragStop(draggedNodes)}
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
          if (!dcNode) return;
          // A confirmed double-click is a definitive selection of `node`,
          // unlike RF's native first-click `selected` flag (deliberately
          // NOT fed into `selectedNodeId`, see the `onSelectionChange`
          // comment in useDiagramEditing.ts). Without this call, the
          // deferred single-click's own `onNodeClick` never fires (its
          // timer was just cleared above), so neither `selectedNodeId` nor
          // `selectedNodeIds` would move to the double-clicked node at all.
          onNodeClick?.(dcNode);
          if (onNodeDoubleClick) onNodeDoubleClick(dcNode);
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
        // Delete/Duplicate are handled by our own keyboard shortcut
        // (PLAN3.md step 11.10, `useDiagramEditing.ts`) — going through
        // `applyOps` for cascade cleanup + undo, not React Flow's own
        // built-in delete-selected-on-Backspace.
        deleteKeyCode={null}
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
