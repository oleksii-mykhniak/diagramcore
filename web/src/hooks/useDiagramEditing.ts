import { useCallback, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ChangeEvent } from 'react';
import { parseDiagram } from '../parseDiagram';
import { validateDiagram } from '../wasmValidate';
import type { ValidationError } from '../wasmValidate';
import { computeLayout } from '../layout';
import type { Diagram, DiagramNode, DiagramLink, DiagramNoteDef } from '../types';
import { fromLayoutSizes, parseLayoutFile } from '../layoutFile';
import type { LayoutPosition } from '../layoutFile';
import type { FlowPlayerState } from '../flowPlayer';
import { applyPatch } from '../yamlPatch';
import type { PatchOp } from '../yamlPatch';
import { findNodeDependents } from '../dependents';
import type { BranchTarget } from '../components/FlowEditorPanel';
import type { DiagramLevel } from './useDiagramStack';

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
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [branchTarget, setBranchTarget] = useState<BranchTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState<
    { kind: 'node'; id: string; nonce: number } | { kind: 'line'; line: number; nonce: number } | null
  >(null);

  /** Applies structured YAML patches (PLAN.md step 7.1) to the current
   * level: re-parses/re-validates the patched text and re-derives layout,
   * keeping manual positions and giving newly-added or newly-auto-laid-out
   * nodes fresh auto-layout coordinates (mirrors the merge in
   * `onRelayout`). `manualPosition` additionally marks/positions a single
   * node as manual — used when a node is created by dropping it at a
   * specific canvas location. */
  const applyOps = useCallback(
    (
      ops: PatchOp[],
      opts?: { manualPosition?: { id: string; pos: LayoutPosition }; notePosition?: { id: string; pos: LayoutPosition } },
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
          positions[n.id] =
            manualPositionIds.has(n.id) && level.positions[n.id] ? level.positions[n.id] : { x: n.x, y: n.y };
        }
        if (opts?.manualPosition) {
          positions[opts.manualPosition.id] = opts.manualPosition.pos;
          manualPositionIds.add(opts.manualPosition.id);
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
          positions[n.id] =
            manualPositionIds.has(n.id) && level.positions[n.id] ? level.positions[n.id] : { x: n.x, y: n.y };
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
      void applyOps([{ op: 'addNode', node: { id, type } }], { manualPosition: { id, pos } });
      setSelectedNodeId(id);
    },
    [current, applyOps],
  );

  const onNodeClick = useCallback((node: DiagramNode) => {
    setSelectedNodeId(node.id);
  }, []);

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

  const onDeleteSelectedNode = useCallback(() => {
    if (!current || !selectedNodeId) return;
    const deps = findNodeDependents(current.diagram, selectedNodeId);
    if (deps.links.length > 0 || deps.flowSteps.length > 0) {
      const lines = [
        ...deps.links.map((l) => `link ${l.from} -> ${l.to}`),
        ...deps.flowSteps.map((s) => `step in flow "${s.flowName}"`),
      ];
      const proceed = window.confirm(
        `Deleting node "${selectedNodeId}" also removes:\n${lines.join('\n')}\n\nContinue?`,
      );
      if (!proceed) return;
    }
    const ops: PatchOp[] = [];
    const indicesByFlow = new Map<string, number[]>();
    for (const s of deps.flowSteps) {
      const arr = indicesByFlow.get(s.flowName) ?? [];
      arr.push(s.index);
      indicesByFlow.set(s.flowName, arr);
    }
    for (const [flowName, indices] of indicesByFlow) {
      for (const atIndex of [...indices].sort((a, b) => b - a)) {
        ops.push({ op: 'removeFlowStep', flowName, atIndex });
      }
    }
    for (const l of deps.links) ops.push({ op: 'removeLink', from: l.from, to: l.to });
    ops.push({ op: 'removeNode', id: selectedNodeId });
    void applyOps(ops);
    setSelectedNodeId(null);
  }, [current, selectedNodeId, applyOps]);

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
      // `applyOps` path (and its manualPosition option) `onDropNodeType`
      // uses — that keeps the position commit and the parent patch as
      // a single re-derivation of layout/positions instead of two
      // separate state updates racing each other.
      if (newParent !== undefined) {
        void applyOps([{ op: 'updateNode', id, patch: { parent: newParent ?? undefined } }], {
          manualPosition: { id, pos },
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
   * same pattern as `onNodeDrag`'s single commit at drag-stop. */
  const onNodeResizeStop = useCallback(
    (id: string, size: { width: number; height: number }) => {
      if (!current) return;
      updateCurrentLevel({ sizes: { ...current.sizes, [id]: size } });
    },
    [current, updateCurrentLevel],
  );

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
      if (!recording || !recordingFlow || !current) return;
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
    hoveredLinkIndex,
    setHoveredLinkIndex,
    recording,
    branchTarget,
    focusRequest,
    recordingFlow,
    applyOps,
    applyTextReplace,
    onDropNodeType,
    onDropNoteType,
    onNoteDrag,
    onNoteDoubleClick,
    onNodeClick,
    onUpdateSelectedNode,
    onDeleteSelectedNode,
    onConnectNodes,
    onUpdateLink,
    onDeleteLink,
    onNodeDrag,
    onNodeResizeStop,
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
