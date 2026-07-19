import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ChangeEvent } from 'react';
import { parseDiagram } from '../parseDiagram';
import { validateDiagram } from '../wasmValidate';
import type { ValidationError } from '../wasmValidate';
import { computeLayout } from '../layout';
import type { Diagram, DiagramNode, DiagramLink, DiagramNoteDef } from '../types';
import { fromLayoutSizes, parseLayoutFile } from '../layoutFile';
import type { LayoutPosition } from '../layoutFile';
import type { StyleOverride } from '../shapes';
import { edgeLinkKey } from '../edgeStyle';
import type { EdgeStyleOverride } from '../edgeStyle';
import type { FlowPlayerState } from '../flowPlayer';
import { applyPatch } from '../yamlPatch';
import type { PatchOp } from '../yamlPatch';
import { findNodeDependents } from '../dependents';
import { applyZOrderOp } from '../zOrder';
import type { BranchTarget } from '../components/FlowEditorPanel';
import type { DiagramLevel } from './useDiagramStack';
import { isNativeFsSupported, pickImageSaveHandle, writeBlobToHandle } from '../nativeFile';
import { downloadBlob } from '../svgExport';

/** All node/link/flow editing handlers, plus the transient UI state they
 * drive (selection, hover, flow recording, focus requests). Everything
 * here mutates the current level via `applyOps`/`applyTextReplace`,
 * both of which go through the shared `runMutation` queue owned by
 * `useDiagramStack` so they can't race a concurrent undo/redo or each
 * other (docs/deviations.md, step 7.4). */
export function useDiagramEditing(
  current: DiagramLevel | null,
  levelRef: MutableRefObject<DiagramLevel | null>,
  runMutation: (run: () => Promise<void>) => Promise<void>,
  updateCurrentLevel: (patch: Partial<DiagramLevel>) => void,
  pushHistory: (previousText: string) => void,
  setLoadError: (error: string | null) => void,
) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  /** Multi-selection (PLAN3.md step 11.10) — kept alongside
   * `selectedNodeId` (which stays the single-node source for the
   * Properties panel) so Delete/Duplicate/keyboard shortcuts have a
   * consistent scope whether the selection came from a plain click
   * (`onNodeClick` sets both to a single id) or a rubber-band drag
   * (`onSelectionChange`, which may set 0, 1, or many). */
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);
  /** Selected link (PLAN3.md step 11.9) — set when clicking an edge on
   * the canvas outside of flow recording, so its properties can open in
   * the right dock's Links tab (mirrors `selectedNodeId`/Properties). */
  const [selectedLinkIndex, setSelectedLinkIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [branchTarget, setBranchTarget] = useState<BranchTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState<
    { kind: 'node'; id: string; nonce: number } | { kind: 'line'; line: number; nonce: number } | null
  >(null);
  /** F2 on the selected node (PLAN4.md step 12.4) — opens the same
   * inline label editor a dblclick does, bumping `nonce` (not just `id`)
   * so pressing F2 again on the same already-selected node re-opens it
   * even if a previous edit was cancelled without changing selection. */
  const [editNodeRequest, setEditNodeRequest] = useState<{ id: string; nonce: number } | null>(null);

  /** Applies structured YAML patches (PLAN.md step 7.1) to the current
   * level: re-parses/re-validates the patched text and re-derives layout,
   * keeping manual positions and giving newly-added or newly-auto-laid-out
   * nodes fresh auto-layout coordinates (mirrors the merge in
   * `onRelayout`). `manualPositions` additionally marks/positions one or
   * more nodes as manual in the same commit — used when a node is
   * created by dropping it at a specific canvas location, or several are
   * created at once (PLAN3.md step 11.10's Duplicate). */
  const applyOps = useCallback(
    (
      ops: PatchOp[],
      opts?: { manualPositions?: Array<{ id: string; pos: LayoutPosition }>; notePosition?: { id: string; pos: LayoutPosition } },
    ) => {
      const run = async () => {
        const level = levelRef.current;
        if (!level) return;
        const newText = applyPatch(level.rawText, ops);
        const newDiagram = parseDiagram(newText);
        const newErrors = await validateDiagram(newText);
        const recomputed = await computeLayout(newDiagram, level.sizes);
        const manualPositionIds = new Set(level.manualPositionIds);
        const positions: Record<string, LayoutPosition> = {};
        for (const n of recomputed.nodes) {
          positions[n.id] = level.positions[n.id] ? level.positions[n.id] : { x: n.x, y: n.y };
        }
        for (const { id, pos } of opts?.manualPositions ?? []) {
          positions[id] = pos;
          manualPositionIds.add(id);
        }
        const notePositions = opts?.notePosition
          ? { ...level.notePositions, [opts.notePosition.id]: opts.notePosition.pos }
          : level.notePositions;
        if (newText !== level.rawText) pushHistory(level.rawText);
        updateCurrentLevel({
          rawText: newText,
          diagram: newDiagram,
          errors: newErrors,
          layout: recomputed,
          positions,
          manualPositionIds,
          notePositions,
        });
      };
      return runMutation(run);
    },
    [levelRef, runMutation, updateCurrentLevel, pushHistory],
  );

  /** Commits arbitrary already-valid YAML text (from the YAML panel,
   * PLAN.md step 7.5) the same way `applyOps` commits a patch result —
   * through the same ref/queue so text-panel edits and visual edits
   * never race each other. */
  const applyTextReplace = useCallback(
    (text: string) => {
      const run = async () => {
        const level = levelRef.current;
        if (!level) return;
        let newDiagram: Diagram;
        try {
          newDiagram = parseDiagram(text);
        } catch {
          return;
        }
        const newErrors = await validateDiagram(text);
        const recomputed = await computeLayout(newDiagram, level.sizes);
        const manualPositionIds = new Set(level.manualPositionIds);
        const positions: Record<string, LayoutPosition> = {};
        for (const n of recomputed.nodes) {
          positions[n.id] = level.positions[n.id] ? level.positions[n.id] : { x: n.x, y: n.y };
        }
        if (text !== level.rawText) pushHistory(level.rawText);
        updateCurrentLevel({
          rawText: text,
          diagram: newDiagram,
          errors: newErrors,
          layout: recomputed,
          positions,
          manualPositionIds,
        });
      };
      return runMutation(run);
    },
    [levelRef, runMutation, updateCurrentLevel, pushHistory],
  );

  const onDropNodeType = useCallback(
    (type: string, pos: LayoutPosition) => {
      if (!current) return;
      const existingIds = new Set(current.diagram.nodes.map((n) => n.id));
      let n = 1;
      let id = `${type}${n}`;
      while (existingIds.has(id)) {
        n += 1;
        id = `${type}${n}`;
      }
      void applyOps([{ op: 'addNode', node: { id, type } }], { manualPositions: [{ id, pos }] });
      setSelectedNodeId(id);
      setSelectedNodeIds([id]);
    },
    [current, applyOps],
  );

  const onNodeClick = useCallback((node: DiagramNode) => {
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    // Properties is contextual (PLAN4.md step 12.6: node/link/overview
    // share one tab) — a lingering link selection would otherwise fight
    // the node selection for which form shows.
    setSelectedLinkIndex(null);
  }, []);

  /** Rubber-band selection (PLAN3.md step 11.10) — driven by React
   * Flow's own `onSelectionChange`. Keeps `selectedNodeId` in sync so
   * the Properties panel still works for a single-node rubber-band
   * selection, same as a plain click. */
  /** Deliberately does NOT touch `selectedNodeId` (the Properties-panel/
   * right-dock-switching selection): React Flow tracks its own native
   * "selected" flag on every plain click too, not just rubber-band drags
   * — including the *first* click of a double-click, independently of
   * (and faster than) the 250ms deferred single-click/dblclick
   * disambiguation in `FlowCanvas.tsx`. Feeding that into `selectedNodeId`
   * made double-clicking a details node also flip the right dock to
   * Properties (clobbering whatever tab — e.g. Flows — the user had
   * open) before the dblclick was even recognized. `selectedNodeIds`
   * only drives Delete/Duplicate/group-drag and the selection highlight,
   * neither of which cares about that distinction. */
  const onSelectionChange = useCallback((ids: string[]) => {
    // `isSelected` (FlowCanvas.tsx) is derived from `selectedNodeIds`, so
    // a naive `setSelectedNodeIds(ids)` here — even when the selection's
    // *content* hasn't changed — creates a new array reference, which
    // recomputes `rfNodes`/`allNodes`, resets React Flow's node array via
    // the sync effect, and makes RF re-fire `onSelectionChange` with
    // another fresh array: an infinite render loop. Bail out (keeping the
    // previous reference) when the set of ids is unchanged.
    setSelectedNodeIds((prev) => {
      if (prev.length === ids.length && prev.every((id) => ids.includes(id))) return prev;
      return ids;
    });
  }, []);

  /** Group drag (PLAN3.md step 11.10): every dragged node's new
   * position is committed in one `updateCurrentLevel` call, mirroring
   * the single-commit-per-gesture pattern `onNodeDrag`/resize already
   * use — container reparenting is out of scope for a group drag (only
   * single-node drag checks container overlap). */
  const onGroupNodeDragStop = useCallback(
    (updates: Array<{ id: string; pos: LayoutPosition }>) => {
      if (!current || updates.length === 0) return;
      const positions = { ...current.positions };
      const manualPositionIds = new Set(current.manualPositionIds);
      for (const { id, pos } of updates) {
        positions[id] = pos;
        manualPositionIds.add(id);
      }
      updateCurrentLevel({ positions, manualPositionIds });
    },
    [current, updateCurrentLevel],
  );

  /** Palette "Text" item dropped on the canvas (PLAN.md step 10.11):
   * creates a `notes:` entry and seeds its position, mirroring
   * `onDropNodeType`. */
  const onDropNoteType = useCallback(
    (pos: LayoutPosition) => {
      if (!current) return;
      const existingIds = new Set((current.diagram.notes ?? []).map((n) => n.id));
      let n = 1;
      let id = `note${n}`;
      while (existingIds.has(id)) {
        n += 1;
        id = `note${n}`;
      }
      void applyOps([{ op: 'addNote', note: { id, text: 'New note' } }], { notePosition: { id, pos } });
    },
    [current, applyOps],
  );

  const onNoteDrag = useCallback(
    (id: string, pos: LayoutPosition) => {
      if (!current) return;
      updateCurrentLevel({ notePositions: { ...current.notePositions, [id]: pos } });
    },
    [current, updateCurrentLevel],
  );

  /** Double-click a note (PLAN.md step 10.11): prompts for new text —
   * clearing it removes the note, cancelling leaves it untouched. */
  const onNoteDoubleClick = useCallback(
    (note: DiagramNoteDef) => {
      const next = window.prompt('Note text', note.text);
      if (next === null) return;
      if (next.trim() === '') {
        void applyOps([{ op: 'removeNote', id: note.id }]);
        return;
      }
      void applyOps([{ op: 'updateNote', id: note.id, patch: { text: next } }]);
    },
    [applyOps],
  );

  const onUpdateSelectedNode = useCallback(
    (patch: Partial<DiagramNode>) => {
      if (!selectedNodeId) return;
      void applyOps([{ op: 'updateNode', id: selectedNodeId, patch }]);
    },
    [selectedNodeId, applyOps],
  );

  /** Inline label edit commit (PLAN4.md step 12.4) — unlike
   * `onUpdateSelectedNode`, targets `id` directly rather than the
   * current selection: a dblclick can open the editor for a node that
   * isn't (yet) selected. */
  const onUpdateNodeLabel = useCallback(
    (id: string, label: string) => {
      void applyOps([{ op: 'updateNode', id, patch: { label } }]);
    },
    [applyOps],
  );

  /** Delete key / Edit menu "Delete" / Properties panel "Delete node"
   * (PLAN3.md step 11.10 generalizes this from a single node to the
   * whole current selection — `selectedNodeIds` when non-empty, falling
   * back to the single `selectedNodeId` for callers, like the
   * Properties panel's own button, that only ever deal with one node).
   * Dependent links/flow steps across every selected node are
   * aggregated and deduped (a link between two selected nodes would
   * otherwise show up once per endpoint) into a single confirm and a
   * single `applyOps` call — one undo step removes the whole group. */
  const onDeleteSelectedNode = useCallback(() => {
    if (!current) return;
    const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const linkKeys = new Set<string>();
    const links: { from: string; to: string }[] = [];
    const flowStepKeys = new Set<string>();
    const flowSteps: { flowName: string; index: number }[] = [];
    for (const id of ids) {
      const deps = findNodeDependents(current.diagram, id);
      for (const l of deps.links) {
        const key = `${l.from}->${l.to}`;
        if (linkKeys.has(key)) continue;
        linkKeys.add(key);
        links.push(l);
      }
      for (const s of deps.flowSteps) {
        const key = `${s.flowName}#${s.index}`;
        if (flowStepKeys.has(key)) continue;
        flowStepKeys.add(key);
        flowSteps.push(s);
      }
    }
    if (links.length > 0 || flowSteps.length > 0) {
      const lines = [
        ...links.map((l) => `link ${l.from} -> ${l.to}`),
        ...flowSteps.map((s) => `step in flow "${s.flowName}"`),
      ];
      const subject = ids.length === 1 ? `node "${ids[0]}"` : `${ids.length} nodes`;
      const proceed = window.confirm(`Deleting ${subject} also removes:\n${lines.join('\n')}\n\nContinue?`);
      if (!proceed) return;
    }
    const ops: PatchOp[] = [];
    const indicesByFlow = new Map<string, number[]>();
    for (const s of flowSteps) {
      const arr = indicesByFlow.get(s.flowName) ?? [];
      arr.push(s.index);
      indicesByFlow.set(s.flowName, arr);
    }
    for (const [flowName, indices] of indicesByFlow) {
      for (const atIndex of [...indices].sort((a, b) => b - a)) {
        ops.push({ op: 'removeFlowStep', flowName, atIndex });
      }
    }
    for (const l of links) ops.push({ op: 'removeLink', from: l.from, to: l.to });
    for (const id of idSet) ops.push({ op: 'removeNode', id });
    void applyOps(ops);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }, [current, selectedNodeId, selectedNodeIds, applyOps]);

  /** Cmd/Ctrl+D / Edit menu "Duplicate" (PLAN3.md step 11.10): clones
   * every selected node (new unique id, same type/label/description/
   * other fields, position offset by +40/+40) in a single `applyOps`
   * call — one undo step adds the whole group. Links aren't
   * duplicated, only the nodes themselves. */
  const onDuplicateSelectedNodes = useCallback(() => {
    if (!current) return;
    const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    if (ids.length === 0) return;
    const existingIds = new Set(current.diagram.nodes.map((n) => n.id));
    const ops: PatchOp[] = [];
    const manualPositions: Array<{ id: string; pos: LayoutPosition }> = [];
    const newIds: string[] = [];
    for (const id of ids) {
      const node = current.diagram.nodes.find((n) => n.id === id);
      if (!node) continue;
      let newId = `${id}-copy`;
      let n = 2;
      while (existingIds.has(newId)) {
        newId = `${id}-copy${n}`;
        n += 1;
      }
      existingIds.add(newId);
      ops.push({ op: 'addNode', node: { ...node, id: newId } });
      const pos = current.positions[id] ?? { x: 0, y: 0 };
      manualPositions.push({ id: newId, pos: { x: pos.x + 40, y: pos.y + 40 } });
      newIds.push(newId);
    }
    if (ops.length === 0) return;
    void applyOps(ops, { manualPositions });
    setSelectedNodeIds(newIds);
    setSelectedNodeId(newIds.length === 1 ? newIds[0] : null);
  }, [current, selectedNodeId, selectedNodeIds, applyOps]);

  /** Esc clears the selection (PLAN3.md step 11.10); Delete/Backspace
   * and Cmd/Ctrl+D drive the two actions above from anywhere except an
   * editable field (so typing in a text input, the color picker, etc.
   * isn't hijacked) — captured on `window` like `useHistory`'s
   * Ctrl/Cmd+Z, but NOT in the capture phase, so a YAML-panel/input
   * keystroke still reaches its own field first and can mark itself as
   * "handled" by being an editable target. */
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    };
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        // Properties is contextual (PLAN4.md step 12.6) — clearing only
        // the node selection would leave a stale link selection showing
        // its own form instead of falling back to the overview.
        setSelectedLinkIndex(null);
        return;
      }
      if (e.key === 'F2' && selectedNodeId) {
        e.preventDefault();
        setEditNodeRequest({ id: selectedNodeId, nonce: Date.now() });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedNodeIds.length > 0 || selectedNodeId)) {
        e.preventDefault();
        onDeleteSelectedNode();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && (selectedNodeIds.length > 0 || selectedNodeId)) {
        e.preventDefault();
        onDuplicateSelectedNodes();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, selectedNodeIds, onDeleteSelectedNode, onDuplicateSelectedNodes]);

  const onConnectNodes = useCallback(
    (source: string, target: string) => {
      void applyOps([{ op: 'addLink', link: { from: source, to: target, type: 'request' } }]);
    },
    [applyOps],
  );

  const onUpdateLink = useCallback(
    (index: number, patch: Partial<DiagramLink>) => {
      void applyOps([{ op: 'updateLink', index, patch }]);
    },
    [applyOps],
  );

  const onDeleteLink = useCallback(
    (index: number) => {
      if (!current) return;
      const link = current.diagram.links[index];
      if (!link) return;
      void applyOps([{ op: 'removeLink', from: link.from, to: link.to, type: link.type }]);
    },
    [current, applyOps],
  );

  const onNodeDrag = useCallback(
    (id: string, pos: LayoutPosition, newParent?: string | null) => {
      if (!current) return;
      // Dragging a node across a container boundary (PLAN3.md step
      // 11.6) also patches `parent:` in the YAML, through the same
      // `applyOps` path (and its manualPositions option) `onDropNodeType`
      // uses — that keeps the position commit and the parent patch as
      // a single re-derivation of layout/positions instead of two
      // separate state updates racing each other.
      if (newParent !== undefined) {
        void applyOps([{ op: 'updateNode', id, patch: { parent: newParent ?? undefined } }], {
          manualPositions: [{ id, pos }],
        });
        return;
      }
      updateCurrentLevel({
        positions: { ...current.positions, [id]: pos },
        manualPositionIds: new Set(current.manualPositionIds).add(id),
      });
    },
    [current, updateCurrentLevel, applyOps],
  );

  /** Node resize (PLAN3.md step 11.4): committed once, on resize-stop —
   * same pattern as `onNodeDrag`'s single commit at drag-stop. `pos` is
   * committed alongside `size` because top/left-handle resizes shift the
   * node's x/y to keep the opposite edge anchored — without also
   * updating `positions`, the node would snap back to its pre-resize
   * position on the next render (only the size would "stick"). */
  const onNodeResizeStop = useCallback(
    (id: string, size: { width: number; height: number }, pos: LayoutPosition) => {
      if (!current) return;
      updateCurrentLevel({
        sizes: { ...current.sizes, [id]: size },
        positions: { ...current.positions, [id]: pos },
        manualPositionIds: new Set(current.manualPositionIds).add(id),
      });
    },
    [current, updateCurrentLevel],
  );

  /** Properties panel → Style section (PLAN3.md step 11.8): patches an
   * instance style override for the selected node — layout-file state,
   * like `sizes`/`positions`, never the YAML (`rawText` stays byte-for-
   * byte identical). */
  const onUpdateNodeStyle = useCallback(
    (patch: Partial<StyleOverride>) => {
      if (!current || !selectedNodeId) return;
      const existing = current.styles[selectedNodeId] ?? {};
      updateCurrentLevel({ styles: { ...current.styles, [selectedNodeId]: { ...existing, ...patch } } });
    },
    [current, selectedNodeId, updateCurrentLevel],
  );

  /** Properties → Text section (PLAN4.md step 12.5) — merges into the
   * selected node's nested `text` override specifically, unlike
   * `onUpdateNodeStyle`'s shallow top-level merge, which would otherwise
   * wholesale-replace `text` and drop whichever of its fields (e.g.
   * `bold`) weren't part of this particular patch. */
  const onUpdateNodeTextStyle = useCallback(
    (patch: Partial<StyleOverride['text']>) => {
      if (!current || !selectedNodeId) return;
      const existing = current.styles[selectedNodeId] ?? {};
      const existingText = existing.text ?? {};
      updateCurrentLevel({
        styles: { ...current.styles, [selectedNodeId]: { ...existing, text: { ...existingText, ...patch } } },
      });
    },
    [current, selectedNodeId, updateCurrentLevel],
  );

  /** "Reset style" — drops the selected node's entire override, back to
   * its `custom_types`/theme default. */
  const onResetNodeStyle = useCallback(() => {
    if (!current || !selectedNodeId) return;
    if (!(selectedNodeId in current.styles)) return;
    const styles = { ...current.styles };
    delete styles[selectedNodeId];
    updateCurrentLevel({ styles });
  }, [current, selectedNodeId, updateCurrentLevel]);

  /** "Reset text" — drops only the selected node's text override,
   * leaving fill/stroke/etc. untouched (PLAN4.md step 12.5). */
  const onResetNodeTextStyle = useCallback(() => {
    if (!current || !selectedNodeId) return;
    const existing = current.styles[selectedNodeId];
    if (!existing?.text) return;
    const { text: _text, ...rest } = existing;
    updateCurrentLevel({ styles: { ...current.styles, [selectedNodeId]: rest } });
  }, [current, selectedNodeId, updateCurrentLevel]);

  /** Links panel/edge Style section (PLAN3.md step 11.9): patches an
   * instance style override for the selected link — layout-file state,
   * like node styles, never the YAML. */
  const onUpdateEdgeStyle = useCallback(
    (patch: Partial<EdgeStyleOverride>) => {
      if (!current || selectedLinkIndex === null) return;
      const link = current.diagram.links[selectedLinkIndex];
      if (!link) return;
      const key = edgeLinkKey(link);
      const existing = current.edgeStyles[key] ?? {};
      updateCurrentLevel({ edgeStyles: { ...current.edgeStyles, [key]: { ...existing, ...patch } } });
    },
    [current, selectedLinkIndex, updateCurrentLevel],
  );

  /** "Reset style" for the selected link. */
  const onResetEdgeStyle = useCallback(() => {
    if (!current || selectedLinkIndex === null) return;
    const link = current.diagram.links[selectedLinkIndex];
    if (!link) return;
    const key = edgeLinkKey(link);
    if (!(key in current.edgeStyles)) return;
    const edgeStyles = { ...current.edgeStyles };
    delete edgeStyles[key];
    updateCurrentLevel({ edgeStyles });
  }, [current, selectedLinkIndex, updateCurrentLevel]);

  /** Links panel Text section (PLAN4.md step 12.5) — same nested-merge
   * reasoning as `onUpdateNodeTextStyle`. */
  const onUpdateEdgeTextStyle = useCallback(
    (patch: Partial<EdgeStyleOverride['text']>) => {
      if (!current || selectedLinkIndex === null) return;
      const link = current.diagram.links[selectedLinkIndex];
      if (!link) return;
      const key = edgeLinkKey(link);
      const existing = current.edgeStyles[key] ?? {};
      const existingText = existing.text ?? {};
      updateCurrentLevel({
        edgeStyles: { ...current.edgeStyles, [key]: { ...existing, text: { ...existingText, ...patch } } },
      });
    },
    [current, selectedLinkIndex, updateCurrentLevel],
  );

  /** "Reset text" for the selected link — drops only the text override. */
  const onResetEdgeTextStyle = useCallback(() => {
    if (!current || selectedLinkIndex === null) return;
    const link = current.diagram.links[selectedLinkIndex];
    if (!link) return;
    const key = edgeLinkKey(link);
    const existing = current.edgeStyles[key];
    if (!existing?.text) return;
    const { text: _text, ...rest } = existing;
    updateCurrentLevel({ edgeStyles: { ...current.edgeStyles, [key]: rest } });
  }, [current, selectedLinkIndex, updateCurrentLevel]);

  /** Edge label drag (PLAN3.md step 11.9): committed once, on release —
   * same single-commit-per-gesture pattern as node drag/resize. */
  const onEdgeLabelDragStop = useCallback(
    (linkIndex: number, offset: LayoutPosition) => {
      if (!current) return;
      const link = current.diagram.links[linkIndex];
      if (!link) return;
      const key = edgeLinkKey(link);
      updateCurrentLevel({ edgeLabelOffsets: { ...current.edgeLabelOffsets, [key]: offset } });
    },
    [current, updateCurrentLevel],
  );

  /** Edge label inline-edit commit (PLAN4.md step 12.4, replaces the old
   * `window.prompt`-based `onEdgeLabelDoubleClick` — the dblclick now
   * opens an input in place, owned by `DcEdge` itself; this just
   * commits it). Empty text removes the link's `label` entirely. */
  const onEdgeLabelCommit = useCallback(
    (linkIndex: number, label: string) => {
      void applyOps([{ op: 'updateLink', index: linkIndex, patch: { label: label.trim() === '' ? undefined : label } }]);
    },
    [applyOps],
  );

  /** Individual label show/hide (PLAN3.md step 11.9) — independent of
   * the global "Connection labels" view setting. */
  const onToggleEdgeLabelHidden = useCallback(
    (linkIndex: number) => {
      if (!current) return;
      const link = current.diagram.links[linkIndex];
      if (!link) return;
      const key = edgeLinkKey(link);
      const hiddenEdgeLabels = new Set(current.hiddenEdgeLabels);
      if (hiddenEdgeLabels.has(key)) hiddenEdgeLabels.delete(key);
      else hiddenEdgeLabels.add(key);
      updateCurrentLevel({ hiddenEdgeLabels });
    },
    [current, updateCurrentLevel],
  );

  /** "Hide connection" (PLAN4.md step 12.7) — hides the whole connector
   * (line + marker + label), not just its label; presentation-only,
   * layout-file state, same as `onToggleEdgeLabelHidden`. */
  const onToggleEdgeHidden = useCallback(
    (linkIndex: number) => {
      if (!current) return;
      const link = current.diagram.links[linkIndex];
      if (!link) return;
      const key = edgeLinkKey(link);
      const hiddenEdges = new Set(current.hiddenEdges);
      if (hiddenEdges.has(key)) hiddenEdges.delete(key);
      else hiddenEdges.add(key);
      updateCurrentLevel({ hiddenEdges });
    },
    [current, updateCurrentLevel],
  );

  /** "Hide label" for the selected node (PLAN4.md step 12.7) — the
   * shape still renders, only its text label is hidden. */
  const onToggleNodeLabelHidden = useCallback(() => {
    if (!current || !selectedNodeId) return;
    const hiddenNodeLabels = new Set(current.hiddenNodeLabels);
    if (hiddenNodeLabels.has(selectedNodeId)) hiddenNodeLabels.delete(selectedNodeId);
    else hiddenNodeLabels.add(selectedNodeId);
    updateCurrentLevel({ hiddenNodeLabels });
  }, [current, selectedNodeId, updateCurrentLevel]);

  /** Arrange → z-order (PLAN4.md step 12.9): Bring to front/forward,
   * Send backward/to back — acts on the current selection
   * (`selectedNodeIds`, falling back to the single `selectedNodeId`,
   * same scope rule as delete/duplicate), via the shared
   * `applyZOrderOp`/`resolveDrawOrder` (`zOrder.ts`) the canvas and SVG
   * export both resolve against. Persists the FULL resulting order, not
   * just the touched ids — see `zOrder.ts`'s module doc. */
  const onZOrderOp = useCallback(
    (op: 'front' | 'forward' | 'backward' | 'back') => {
      if (!current) return;
      const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
      if (ids.length === 0) return;
      const nodeIds = current.diagram.nodes.map((n) => n.id);
      const zOrder = applyZOrderOp(nodeIds, current.zOrder, ids, op);
      updateCurrentLevel({ zOrder });
    },
    [current, selectedNodeId, selectedNodeIds, updateCurrentLevel],
  );

  /** Properties → "Image…" (PLAN4.md step 12.10) — reads the picked file
   * as a data URL for THIS session's canvas/export rendering
   * (`imageAssets`, keyed by the same relative path the layout file's
   * `styles[id].image` holds), and separately gets the actual bytes
   * onto disk: a real save-as prompt when the document has a native
   * handle (the user can navigate into `assets/` there — the File
   * System Access API has no silent "copy next to this other file"
   * primitive), or a plain download otherwise. 2MB cap mirrors the
   * plan's "reasonable size limit"; over that, bail with a load-error
   * toast instead of silently bloating the layout/session state. */
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const onSetNodeImage = useCallback(
    (file: File) => {
      if (!current || !selectedNodeId) return;
      if (file.size > MAX_IMAGE_BYTES) {
        setLoadError(`Image "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 2MB.`);
        return;
      }
      void (async () => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const path = `assets/${selectedNodeId}-${file.name}`;
        const existing = current.styles[selectedNodeId] ?? {};
        updateCurrentLevel({
          styles: { ...current.styles, [selectedNodeId]: { ...existing, image: path } },
          imageAssets: { ...current.imageAssets, [path]: dataUrl },
        });
        if (isNativeFsSupported()) {
          try {
            const handle = await pickImageSaveHandle(path.split('/').pop()!);
            if (handle) await writeBlobToHandle(handle, file);
          } catch (err) {
            // AbortError: user cancelled the save-as picker — the image
            // still displays for this session either way, so this isn't
            // fatal, just unsaved-to-disk.
            if (!(err instanceof Error && err.name === 'AbortError')) {
              setLoadError(err instanceof Error ? err.message : String(err));
            }
          }
        } else {
          downloadBlob(file.name, file);
        }
      })();
    },
    [current, selectedNodeId, updateCurrentLevel, setLoadError],
  );

  /** Properties → "Remove image" — drops the style override's `image`
   * field only, leaving fill/stroke/text/etc. untouched. */
  const onRemoveNodeImage = useCallback(() => {
    if (!current || !selectedNodeId) return;
    const existing = current.styles[selectedNodeId];
    if (!existing?.image) return;
    const { image: _image, ...rest } = existing;
    updateCurrentLevel({ styles: { ...current.styles, [selectedNodeId]: rest } });
  }, [current, selectedNodeId, updateCurrentLevel]);

  const recordingFlow =
    current?.flowPlayerState.flowIndex != null ? current.diagram.flows?.[current.flowPlayerState.flowIndex] ?? null : null;

  const onNewFlow = useCallback(() => {
    if (!current) return;
    const name = window.prompt('New flow name');
    if (!name) return;
    const newIndex = current.diagram.flows?.length ?? 0;
    void applyOps([{ op: 'addFlow', name }]).then(() => {
      updateCurrentLevel({ flowPlayerState: { flowIndex: newIndex, currentIndex: -1, choices: {} } });
      setRecording(true);
      setBranchTarget(null);
    });
  }, [current, applyOps, updateCurrentLevel]);

  const onToggleRecording = useCallback(() => {
    setRecording((r) => !r);
    setBranchTarget(null);
  }, []);

  const onAddBranch = useCallback(() => {
    if (!recordingFlow) return;
    const condition = window.prompt('Branch condition');
    if (!condition) return;
    const branchAtIndex = recordingFlow.steps.length;
    void applyOps([{ op: 'addBranch', flowName: recordingFlow.name, condition }]);
    setBranchTarget({ branchAtIndex, arm: 'then' });
  }, [recordingFlow, applyOps]);

  const onSwitchArm = useCallback(() => {
    setBranchTarget((t) => (t ? { ...t, arm: t.arm === 'then' ? 'else' : 'then' } : t));
  }, []);

  const onFinishBranch = useCallback(() => setBranchTarget(null), []);

  const onEdgeClickRecord = useCallback(
    (index: number) => {
      if (!recording || !recordingFlow || !current) {
        // Not recording a flow: a click on an edge selects it instead,
        // so its properties can open in the right dock's Properties tab
        // (PLAN3.md step 11.9; folded from its own Links tab in PLAN4.md
        // step 12.6, hence also clearing the node selection here).
        setSelectedLinkIndex(index);
        setSelectedNodeId(null);
        setSelectedNodeIds([]);
        return;
      }
      const link = current.diagram.links[index];
      if (!link) return;
      const note = window.prompt('Step note (optional)') ?? undefined;
      const step = note ? { from: link.from, to: link.to, note } : { from: link.from, to: link.to };
      void applyOps([
        {
          op: 'addFlowStep',
          flowName: recordingFlow.name,
          step,
          target: branchTarget ?? undefined,
        },
      ]);
    },
    [recording, recordingFlow, current, branchTarget, applyOps],
  );

  const onUpdateFlowStepNote = useCallback(
    (atIndex: number, note: string) => {
      if (!recordingFlow) return;
      void applyOps([{ op: 'updateFlowStep', flowName: recordingFlow.name, atIndex, patch: { note } }]);
    },
    [recordingFlow, applyOps],
  );

  const onDeleteFlowStep = useCallback(
    (atIndex: number) => {
      if (!recordingFlow) return;
      void applyOps([{ op: 'removeFlowStep', flowName: recordingFlow.name, atIndex }]);
    },
    [recordingFlow, applyOps],
  );

  const onSelectProblem = useCallback(
    (error: ValidationError) => {
      if (!current) return;
      const nodeId = current.diagram.nodes.find((n) => error.message.includes(n.id))?.id;
      if (nodeId) {
        setSelectedNodeId(nodeId);
        setSelectedNodeIds([nodeId]);
        setFocusRequest((prev) => ({ kind: 'node', id: nodeId, nonce: (prev?.nonce ?? 0) + 1 }));
        return;
      }
      const flowIndex = current.diagram.flows?.findIndex((f) => error.message.includes(f.name));
      if (flowIndex !== undefined && flowIndex >= 0) {
        updateCurrentLevel({ flowPlayerState: { flowIndex, currentIndex: -1, choices: {} } });
        return;
      }
      setFocusRequest((prev) => ({ kind: 'line', line: error.line, nonce: (prev?.nonce ?? 0) + 1 }));
    },
    [current, updateCurrentLevel],
  );

  const onRelayout = useCallback(async () => {
    if (!current) return;
    const recomputed = await computeLayout(current.diagram, current.sizes);
    const positions = { ...current.positions };
    for (const n of recomputed.nodes) {
      if (!current.manualPositionIds.has(n.id)) {
        positions[n.id] = { x: n.x, y: n.y };
      }
    }
    updateCurrentLevel({ layout: recomputed, positions });
  }, [current, updateCurrentLevel]);

  /** Arrange → "Re-layout all" (PLAN.md step 10.3): unlike `onRelayout`,
   * also discards manual (dragged/imported) positions, so every node gets
   * a fresh auto-layout coordinate. */
  const onRelayoutAll = useCallback(async () => {
    if (!current) return;
    const recomputed = await computeLayout(current.diagram, current.sizes);
    const positions: Record<string, LayoutPosition> = {};
    for (const n of recomputed.nodes) {
      positions[n.id] = { x: n.x, y: n.y };
    }
    updateCurrentLevel({ layout: recomputed, positions, manualPositionIds: new Set<string>() });
  }, [current, updateCurrentLevel]);

  const onImportLayout = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !current) return;
      void file.text().then((text) => {
        try {
          const imported = parseLayoutFile(text);
          const importedPositions = imported.views.default?.positions ?? {};
          const manualPositionIds = new Set(current.manualPositionIds);
          for (const id of Object.keys(importedPositions)) manualPositionIds.add(id);
          updateCurrentLevel({
            positions: { ...current.positions, ...importedPositions },
            manualPositionIds,
            notePositions: { ...current.notePositions, ...(imported.views.default?.notePositions ?? {}) },
            sizes: { ...current.sizes, ...fromLayoutSizes(imported.views.default?.sizes) },
            styles: { ...current.styles, ...(imported.views.default?.styles ?? {}) },
            edgeStyles: { ...current.edgeStyles, ...(imported.views.default?.edgeStyles ?? {}) },
            edgeLabelOffsets: { ...current.edgeLabelOffsets, ...(imported.views.default?.edgeLabelOffsets ?? {}) },
            hiddenEdgeLabels: new Set([
              ...current.hiddenEdgeLabels,
              ...(imported.views.default?.hiddenEdgeLabels ?? []),
            ]),
            hiddenEdges: new Set([...current.hiddenEdges, ...(imported.views.default?.hiddenEdges ?? [])]),
            hiddenNodeLabels: new Set([
              ...current.hiddenNodeLabels,
              ...(imported.views.default?.hiddenNodeLabels ?? []),
            ]),
            ...(imported.views.default?.zOrder?.length ? { zOrder: imported.views.default.zOrder } : {}),
            ...(imported.renderStyle ? { renderStyle: imported.renderStyle } : {}),
          });
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    },
    [current, updateCurrentLevel, setLoadError],
  );

  const onFlowPlayerChange = useCallback(
    (flowPlayerState: FlowPlayerState) => updateCurrentLevel({ flowPlayerState }),
    [updateCurrentLevel],
  );

  return {
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeIds,
    onSelectionChange,
    onGroupNodeDragStop,
    onDuplicateSelectedNodes,
    hoveredLinkIndex,
    setHoveredLinkIndex,
    selectedLinkIndex,
    setSelectedLinkIndex,
    recording,
    branchTarget,
    focusRequest,
    editNodeRequest,
    recordingFlow,
    applyOps,
    applyTextReplace,
    onDropNodeType,
    onDropNoteType,
    onNoteDrag,
    onNoteDoubleClick,
    onNodeClick,
    onUpdateSelectedNode,
    onUpdateNodeLabel,
    onDeleteSelectedNode,
    onConnectNodes,
    onUpdateLink,
    onDeleteLink,
    onNodeDrag,
    onNodeResizeStop,
    onUpdateNodeStyle,
    onResetNodeStyle,
    onUpdateNodeTextStyle,
    onResetNodeTextStyle,
    onUpdateEdgeStyle,
    onResetEdgeStyle,
    onUpdateEdgeTextStyle,
    onResetEdgeTextStyle,
    onEdgeLabelDragStop,
    onEdgeLabelCommit,
    onToggleEdgeLabelHidden,
    onToggleEdgeHidden,
    onToggleNodeLabelHidden,
    onZOrderOp,
    onSetNodeImage,
    onRemoveNodeImage,
    onNewFlow,
    onToggleRecording,
    onAddBranch,
    onSwitchArm,
    onFinishBranch,
    onEdgeClickRecord,
    onUpdateFlowStepNote,
    onDeleteFlowStep,
    onSelectProblem,
    onRelayout,
    onRelayoutAll,
    onImportLayout,
    onFlowPlayerChange,
  };
}
