import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { parseDiagram } from './parseDiagram';
import { generateContext, validateDiagram } from './wasmValidate';
import type { ValidationError } from './wasmValidate';
import { computeLayout } from './layout';
import type { DiagramLayout } from './layout';
import type { Diagram, DiagramNode } from './types';
import { FlowCanvas } from './components/FlowCanvas';
import { FlowPlayer } from './components/FlowPlayer';
import { Palette } from './components/Palette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { LinksPanel } from './components/LinksPanel';
import { FlowEditorPanel } from './components/FlowEditorPanel';
import type { BranchTarget } from './components/FlowEditorPanel';
import { YamlPanel } from './components/YamlPanel';
import { ProblemsPanel } from './components/ProblemsPanel';
import type { DiagramLink } from './types';
import { buildLayoutFile, downloadLayoutFile, layoutFileName, parseLayoutFile } from './layoutFile';
import type { LayoutPosition } from './layoutFile';
import { computeFlowHighlight, flowStepFrames, initialFlowPlayerState, resolveFlowSteps } from './flowPlayer';
import type { FlowPlayerState } from './flowPlayer';
import { downloadBlob, renderDiagramSVGString, svgStringToPngBlob } from './svgExport';
import { zipSync } from 'fflate';
import { applyPatch } from './yamlPatch';
import type { PatchOp } from './yamlPatch';
import { findNodeDependents } from './dependents';
import { isNativeFsSupported, openDiagramFiles, pickSaveHandle, writeTextToHandle } from './nativeFile';

interface DiagramLevel {
  fileName: string;
  rawText: string;
  diagram: Diagram;
  layout: DiagramLayout;
  positions: Record<string, LayoutPosition>;
  errors: ValidationError[];
  flowPlayerState: FlowPlayerState;
  /** Node ids whose position was set manually (drag or layout import),
   * as opposed to the last auto-layout computation — "Re-layout"
   * (PLAN.md step 6.2) leaves these untouched. */
  manualPositionIds: Set<string>;
  /** File System Access handles (PLAN.md step 8.1), only set when the
   * level was opened via the native picker (Chromium). `null` (as
   * opposed to `undefined`) means "opened natively, but no layout file
   * existed yet — Save should create one". */
  mainHandle?: FileSystemFileHandle;
  layoutHandle?: FileSystemFileHandle | null;
  /** `rawText` at the last successful save (or at open/drop-in) — used
   * to show the unsaved-changes indicator. */
  savedRawText: string;
}

/** <file.dc.yaml> -> <file>, for naming exported PNG/zip/markdown files. */
function baseName(fileName: string): string {
  return fileName.replace(/\.dc\.yaml$/, '').replace(/\.ya?ml$/, '');
}

/** <details reference> -> basename, matching how details are resolved
 * against the virtual filesystem of files opened together (see openFiles
 * below). Real relative-path resolution (../, subdirectories) is out of
 * scope for v0 - all files are expected in the same flat selection. */
function detailsBasename(details: string): string {
  const parts = details.split('/');
  return parts[parts.length - 1];
}

export default function App() {
  const [virtualFS, setVirtualFS] = useState<Record<string, string>>({});
  const [stack, setStack] = useState<DiagramLevel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [branchTarget, setBranchTarget] = useState<BranchTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState<
    { kind: 'node'; id: string; nonce: number } | { kind: 'line'; line: number; nonce: number } | null
  >(null);

  const current = stack.length > 0 ? stack[stack.length - 1] : null;
  /** Mirrors the current level synchronously (React state updates are not
   * synchronous, so a second `applyOps` call fired before the first one's
   * `setStack` has been reflected in `current` would otherwise read stale
   * `rawText` and clobber the first edit — see docs/deviations.md, step
   * 7.4). `applyChainRef` additionally serializes overlapping calls so
   * each one builds on the previous one's result. */
  const levelRef = useRef<DiagramLevel | null>(null);
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());
  /** Undo/redo history (PLAN.md step 7.7): a single stack of previous
   * `rawText` snapshots per level, covering every YAML-document mutation
   * regardless of whether it came from the canvas (`applyOps`) or the
   * YAML panel (`applyTextReplace`) — node drag/layout-only changes don't
   * touch `rawText`, so they're outside undo's scope, matching the plan's
   * "history at the YAML document level". Capped at 50 entries. */
  const HISTORY_LIMIT = 50;
  const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });
  const syncHistoryCounts = useCallback(() => {
    setHistoryCounts({ past: historyRef.current.past.length, future: historyRef.current.future.length });
  }, []);
  const resetHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] };
    syncHistoryCounts();
  }, [syncHistoryCounts]);
  const pushHistory = useCallback(
    (previousText: string) => {
      const h = historyRef.current;
      h.past.push(previousText);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
      syncHistoryCounts();
    },
    [syncHistoryCounts],
  );

  const buildLevel = useCallback(async (fileName: string, text: string): Promise<DiagramLevel> => {
    const parsed = parseDiagram(text);
    const validationErrors = await validateDiagram(text);
    const computedLayout = await computeLayout(parsed);
    return {
      fileName,
      rawText: text,
      diagram: parsed,
      layout: computedLayout,
      positions: Object.fromEntries(computedLayout.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
      errors: validationErrors,
      flowPlayerState: initialFlowPlayerState,
      manualPositionIds: new Set<string>(),
      savedRawText: text,
    };
  }, []);

  const openFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setLoadError(null);
      setDrillError(null);
      try {
        const contents = await Promise.all(files.map(async (f) => [f.name, await f.text()] as const));
        setVirtualFS(Object.fromEntries(contents));
        const [primaryName, primaryText] = contents[0];
        const level = await buildLevel(primaryName, primaryText);
        levelRef.current = level;
        resetHistory();
        setStack([level]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        levelRef.current = null;
        resetHistory();
        setStack([]);
      }
    },
    [buildLevel, resetHistory],
  );

  const onFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      void openFiles(Array.from(e.target.files ?? []));
    },
    [openFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      void openFiles(Array.from(e.dataTransfer.files ?? []));
    },
    [openFiles],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const updateCurrentLevel = useCallback((patch: Partial<DiagramLevel>) => {
    if (!levelRef.current) return;
    // Compute and assign the merged level to `levelRef` right here,
    // synchronously — NOT inside the `setStack` updater. React 18 batches
    // state updates and does not guarantee updater functions run
    // synchronously at call time (they may run later, when the batch is
    // flushed), so mirroring into `levelRef` from inside the updater let
    // a second `applyOps`/`applyTextReplace` call — fired immediately
    // after, before the batch flushed — read a stale `levelRef.current`
    // and race the first one (see docs/deviations.md, step 7.7).
    const merged = { ...levelRef.current, ...patch };
    levelRef.current = merged;
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = merged;
      return next;
    });
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** "Open" via the File System Access API (PLAN.md step 8.1, Chromium
   * only): lets Save write straight back to the same files. Falls back
   * to the plain file input (already handled by `onFileInput`/`openFiles`)
   * when the API isn't available, without throwing. */
  const onOpenNative = useCallback(async () => {
    if (!isNativeFsSupported()) {
      fileInputRef.current?.click();
      return;
    }
    setLoadError(null);
    setDrillError(null);
    try {
      const opened = await openDiagramFiles();
      if (!opened) return;
      const level = await buildLevel(opened.mainName, opened.mainText);
      level.mainHandle = opened.mainHandle;
      level.layoutHandle = opened.layoutHandle;
      if (opened.layoutText) {
        const imported = parseLayoutFile(opened.layoutText);
        const importedPositions = imported.views.default?.positions ?? {};
        level.positions = { ...level.positions, ...importedPositions };
        level.manualPositionIds = new Set(Object.keys(importedPositions));
      }
      levelRef.current = level;
      resetHistory();
      setStack([level]);
    } catch (err) {
      // AbortError: user cancelled the picker — not a real error.
      if (err instanceof Error && err.name === 'AbortError') return;
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [buildLevel, resetHistory]);

  /** "Save"/"Save as" (PLAN.md step 8.1): writes the core YAML and (if any
   * position is manual) the layout back to their native handles, creating
   * a layout file via a save picker the first time one is needed. Falls
   * back to downloading both files when there's no native handle (API
   * unsupported, or the level was opened via the plain file input). */
  const onSave = useCallback(async () => {
    if (!current) return;
    if (!current.mainHandle || !isNativeFsSupported()) {
      downloadBlob(current.fileName, new Blob([current.rawText], { type: 'application/x-yaml' }));
      if (current.manualPositionIds.size > 0) {
        downloadLayoutFile(layoutFileName(current.fileName), buildLayoutFile(current.positions));
      }
      updateCurrentLevel({ savedRawText: current.rawText });
      return;
    }
    await writeTextToHandle(current.mainHandle, current.rawText);
    let layoutHandle = current.layoutHandle ?? null;
    if (current.manualPositionIds.size > 0) {
      if (!layoutHandle) {
        layoutHandle = await pickSaveHandle(layoutFileName(current.fileName));
      }
      if (layoutHandle) {
        await writeTextToHandle(layoutHandle, JSON.stringify(buildLayoutFile(current.positions), null, 2));
      }
    }
    updateCurrentLevel({ savedRawText: current.rawText, layoutHandle: layoutHandle ?? undefined });
  }, [current, updateCurrentLevel]);

  const hasUnsavedChanges = current ? current.rawText !== current.savedRawText : false;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  /** Applies structured YAML patches (PLAN.md step 7.1) to the current
   * level: re-parses/re-validates the patched text and re-derives layout,
   * keeping manual positions and giving newly-added or newly-auto-laid-out
   * nodes fresh auto-layout coordinates (mirrors the merge in
   * `onRelayout`). `manualPosition` additionally marks/positions a single
   * node as manual — used when a node is created by dropping it at a
   * specific canvas location. */
  const applyOps = useCallback(
    (ops: PatchOp[], opts?: { manualPosition?: { id: string; pos: LayoutPosition } }) => {
      const run = async () => {
        const level = levelRef.current;
        if (!level) return;
        const newText = applyPatch(level.rawText, ops);
        const newDiagram = parseDiagram(newText);
        const newErrors = await validateDiagram(newText);
        const recomputed = await computeLayout(newDiagram);
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
        if (newText !== level.rawText) pushHistory(level.rawText);
        updateCurrentLevel({
          rawText: newText,
          diagram: newDiagram,
          errors: newErrors,
          layout: recomputed,
          positions,
          manualPositionIds,
        });
      };
      // Serialize overlapping calls (e.g. clicking edges in quick
      // succession while recording a flow) so each one patches the text
      // left behind by the previous one, instead of racing on stale
      // `levelRef.current.rawText` (docs/deviations.md, step 7.4).
      const next = applyChainRef.current.then(run, run);
      applyChainRef.current = next;
      return next;
    },
    [updateCurrentLevel, pushHistory],
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
        let newDiagram;
        try {
          newDiagram = parseDiagram(text);
        } catch {
          return;
        }
        const newErrors = await validateDiagram(text);
        const recomputed = await computeLayout(newDiagram);
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
      const next = applyChainRef.current.then(run, run);
      applyChainRef.current = next;
      return next;
    },
    [updateCurrentLevel, pushHistory],
  );

  /** Undo/redo (PLAN.md step 7.7): moves a snapshot between the past/
   * future stacks and re-derives the level from it exactly like
   * `applyTextReplace`, but without touching history itself. Serialized
   * through the same queue as every other mutation. */
  const onUndo = useCallback(() => {
    const run = async () => {
      const level = levelRef.current;
      const h = historyRef.current;
      if (!level || h.past.length === 0) return;
      const text = h.past.pop() as string;
      h.future.push(level.rawText);
      syncHistoryCounts();
      let newDiagram;
      try {
        newDiagram = parseDiagram(text);
      } catch {
        return;
      }
      const newErrors = await validateDiagram(text);
      const recomputed = await computeLayout(newDiagram);
      const manualPositionIds = new Set(level.manualPositionIds);
      const positions: Record<string, LayoutPosition> = {};
      for (const n of recomputed.nodes) {
        positions[n.id] =
          manualPositionIds.has(n.id) && level.positions[n.id] ? level.positions[n.id] : { x: n.x, y: n.y };
      }
      updateCurrentLevel({ rawText: text, diagram: newDiagram, errors: newErrors, layout: recomputed, positions, manualPositionIds });
    };
    const next = applyChainRef.current.then(run, run);
    applyChainRef.current = next;
    return next;
  }, [updateCurrentLevel, syncHistoryCounts]);

  const onRedo = useCallback(() => {
    const run = async () => {
      const level = levelRef.current;
      const h = historyRef.current;
      if (!level || h.future.length === 0) return;
      const text = h.future.pop() as string;
      h.past.push(level.rawText);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      syncHistoryCounts();
      let newDiagram;
      try {
        newDiagram = parseDiagram(text);
      } catch {
        return;
      }
      const newErrors = await validateDiagram(text);
      const recomputed = await computeLayout(newDiagram);
      const manualPositionIds = new Set(level.manualPositionIds);
      const positions: Record<string, LayoutPosition> = {};
      for (const n of recomputed.nodes) {
        positions[n.id] =
          manualPositionIds.has(n.id) && level.positions[n.id] ? level.positions[n.id] : { x: n.x, y: n.y };
      }
      updateCurrentLevel({ rawText: text, diagram: newDiagram, errors: newErrors, layout: recomputed, positions, manualPositionIds });
    };
    const next = applyChainRef.current.then(run, run);
    applyChainRef.current = next;
    return next;
  }, [updateCurrentLevel, syncHistoryCounts]);

  // Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z anywhere in the app trigger the single
  // shared history, including while focus is inside the CodeMirror YAML
  // panel — captured on `window` in the capture phase and stopped there,
  // so CodeMirror's own (per-keystroke, YAML-panel-only) undo never sees
  // the event and the two histories can't diverge (PLAN.md step 7.7).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) void onRedo();
      else void onUndo();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onUndo, onRedo]);

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
    (id: string, pos: LayoutPosition) => {
      if (!current) return;
      updateCurrentLevel({
        positions: { ...current.positions, [id]: pos },
        manualPositionIds: new Set(current.manualPositionIds).add(id),
      });
    },
    [current, updateCurrentLevel],
  );

  const recordingFlow = current?.flowPlayerState.flowIndex != null ? current.diagram.flows?.[current.flowPlayerState.flowIndex] ?? null : null;

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
    const recomputed = await computeLayout(current.diagram);
    const positions = { ...current.positions };
    for (const n of recomputed.nodes) {
      if (!current.manualPositionIds.has(n.id)) {
        positions[n.id] = { x: n.x, y: n.y };
      }
    }
    updateCurrentLevel({ layout: recomputed, positions });
  }, [current, updateCurrentLevel]);

  const onExportLayout = useCallback(() => {
    if (!current) return;
    downloadLayoutFile(layoutFileName(current.fileName), buildLayoutFile(current.positions));
  }, [current]);

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
          });
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    },
    [current, updateCurrentLevel],
  );

  const onFlowPlayerChange = useCallback(
    (flowPlayerState: FlowPlayerState) => updateCurrentLevel({ flowPlayerState }),
    [updateCurrentLevel],
  );

  const onExportPng = useCallback(async () => {
    if (!current) return;
    const highlight = computeFlowHighlight(current.diagram, current.flowPlayerState);
    const svg = renderDiagramSVGString(current.diagram, current.layout, current.positions, {
      activeStep: highlight.activeStep ?? undefined,
      visitedStepKeys: highlight.visitedStepKeys,
    });
    const blob = await svgStringToPngBlob(svg, current.layout.width, current.layout.height);
    downloadBlob(`${baseName(current.fileName)}.png`, blob);
  }, [current]);

  const onExportFlowStepsZip = useCallback(async () => {
    if (!current || current.flowPlayerState.flowIndex === null) return;
    const flow = current.diagram.flows?.[current.flowPlayerState.flowIndex];
    if (!flow) return;
    const { steps } = resolveFlowSteps(flow, current.flowPlayerState.choices);
    const frames = flowStepFrames(steps);
    const zipInput: Record<string, Uint8Array> = {};
    for (const frame of frames) {
      const svg = renderDiagramSVGString(current.diagram, current.layout, current.positions, {
        activeStep: frame.activeStep,
        visitedStepKeys: frame.visitedStepKeys,
      });
      const blob = await svgStringToPngBlob(svg, current.layout.width, current.layout.height);
      zipInput[`${frame.name}.png`] = new Uint8Array(await blob.arrayBuffer());
    }
    const zipped = zipSync(zipInput);
    downloadBlob(`${baseName(current.fileName)}-${flow.name}-steps.zip`, new Blob([zipped as BlobPart]));
  }, [current]);

  const onExportContext = useCallback(async () => {
    if (!current) return;
    const md = await generateContext(current.rawText);
    downloadBlob(`${baseName(current.fileName)}.md`, new Blob([md], { type: 'text/markdown' }));
  }, [current]);

  const openDetails = useCallback(
    async (node: DiagramNode) => {
      setDrillError(null);
      if (!node.details) return;
      const basename = detailsBasename(node.details);
      const text = virtualFS[basename];
      if (text === undefined) {
        setDrillError(
          `Cannot open sub-diagram "${node.details}": that file wasn't opened together with this one. ` +
            'Select both files (or a whole folder) in the file picker to enable drill-down.',
        );
        return;
      }
      try {
        const level = await buildLevel(basename, text);
        levelRef.current = level;
        resetHistory();
        setStack((prev) => [...prev, level]);
      } catch (err) {
        setDrillError(err instanceof Error ? err.message : String(err));
      }
    },
    [virtualFS, buildLevel, resetHistory],
  );

  const goToLevel = useCallback((index: number) => {
    setDrillError(null);
    setStack((prev) => {
      const next = prev.slice(0, index + 1);
      levelRef.current = next[next.length - 1] ?? null;
      resetHistory();
      return next;
    });
  }, [resetHistory]);

  const highlight = current ? computeFlowHighlight(current.diagram, current.flowPlayerState) : null;
  const selectedNode = current?.diagram.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #ccc' }}>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>DiagramCore</h1>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          multiple
          data-testid="file-input"
          onChange={onFileInput}
        />{' '}
        <button type="button" data-testid="open-native" onClick={() => void onOpenNative()}>
          Open
        </button>{' '}
        {current && (
          <>
            <button type="button" data-testid="save" onClick={() => void onSave()}>
              Save{hasUnsavedChanges ? ' •' : ''}
            </button>{' '}
            {hasUnsavedChanges && <span data-testid="unsaved-indicator">Unsaved changes</span>}
          </>
        )}
        {current && (
          <>
            {' '}
            <button type="button" data-testid="export-layout" onClick={onExportLayout}>
              Export layout
            </button>{' '}
            <label>
              Import layout:{' '}
              <input type="file" accept=".json" data-testid="layout-input" onChange={onImportLayout} />
            </label>{' '}
            <button type="button" data-testid="export-png" onClick={() => void onExportPng()}>
              Export PNG
            </button>{' '}
            <button
              type="button"
              data-testid="export-flow-steps-zip"
              onClick={() => void onExportFlowStepsZip()}
              disabled={current.flowPlayerState.flowIndex === null}
            >
              Export flow steps (zip)
            </button>{' '}
            <button type="button" data-testid="export-context" onClick={() => void onExportContext()}>
              Export AI context (markdown)
            </button>{' '}
            <button type="button" data-testid="relayout" onClick={() => void onRelayout()}>
              Re-layout
            </button>{' '}
            <button type="button" data-testid="undo" onClick={() => void onUndo()} disabled={historyCounts.past === 0}>
              Undo
            </button>{' '}
            <button type="button" data-testid="redo" onClick={() => void onRedo()} disabled={historyCounts.future === 0}>
              Redo
            </button>
          </>
        )}
        {stack.length > 0 && (
          <nav data-testid="breadcrumbs" style={{ marginTop: 8 }}>
            {stack.map((level, i) => (
              <span key={`${level.fileName}-${i}`}>
                {i > 0 && ' › '}
                {i === stack.length - 1 ? (
                  <strong data-testid={`breadcrumb-${i}`}>{level.diagram.diagram.title}</strong>
                ) : (
                  <button
                    type="button"
                    data-testid={`breadcrumb-${i}`}
                    onClick={() => goToLevel(i)}
                    style={{ background: 'none', border: 'none', color: '#06c', cursor: 'pointer', padding: 0 }}
                  >
                    {level.diagram.diagram.title}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}
      </header>
      <main style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loadError && (
          <p role="alert" data-testid="load-error">
            {loadError}
          </p>
        )}
        {drillError && (
          <p role="alert" data-testid="drill-error">
            {drillError}
          </p>
        )}
        {current && <ProblemsPanel errors={current.errors} onSelectError={onSelectProblem} />}
        {current && (
          <FlowPlayer diagram={current.diagram} state={current.flowPlayerState} onChange={onFlowPlayerChange} />
        )}
        {current && (
          <FlowEditorPanel
            flow={recordingFlow}
            recording={recording}
            branchTarget={branchTarget}
            onNewFlow={onNewFlow}
            onToggleRecording={onToggleRecording}
            onAddBranch={onAddBranch}
            onSwitchArm={onSwitchArm}
            onFinishBranch={onFinishBranch}
            onUpdateStepNote={onUpdateFlowStepNote}
            onDeleteStep={onDeleteFlowStep}
          />
        )}
        {current && <Palette />}
        {current && (
          <div style={{ display: 'flex' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <FlowCanvas
                diagram={current.diagram}
                layout={current.layout}
                positions={current.positions}
                onNodeDrag={onNodeDrag}
                onNodeDoubleClick={(node) => void openDetails(node)}
                onNodeClick={onNodeClick}
                selectedNodeId={selectedNodeId}
                onDropNodeType={onDropNodeType}
                onConnectNodes={onConnectNodes}
                hoveredLinkIndex={hoveredLinkIndex}
                onEdgeHover={setHoveredLinkIndex}
                onEdgeClick={onEdgeClickRecord}
                focusNodeId={focusRequest?.kind === 'node' ? focusRequest.id : null}
                focusNonce={focusRequest?.nonce}
                activeStep={highlight?.activeStep ?? undefined}
                visitedStepKeys={highlight?.visitedStepKeys}
              />
              {selectedNode && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: '#fff' }}>
                  <PropertiesPanel
                    node={selectedNode}
                    onUpdate={onUpdateSelectedNode}
                    onDelete={onDeleteSelectedNode}
                  />
                </div>
              )}
            </div>
            <LinksPanel
              links={current.diagram.links}
              hoveredLinkIndex={hoveredLinkIndex}
              onHoverLink={setHoveredLinkIndex}
              onUpdateLink={onUpdateLink}
              onDeleteLink={onDeleteLink}
            />
          </div>
        )}
        {current && (
          <div style={{ marginTop: 16, borderTop: '1px solid #ccc', paddingTop: 8 }}>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>YAML</h3>
            <YamlPanel
              text={current.rawText}
              onCommit={(text) => void applyTextReplace(text)}
              focusLine={focusRequest?.kind === 'line' ? focusRequest.line : null}
              focusNonce={focusRequest?.nonce}
            />
          </div>
        )}
        {current && (
          <textarea
            data-testid="yaml-source"
            readOnly
            value={current.rawText}
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
          />
        )}
        {!current && !loadError && <p>Drag a .dc.yaml file here, or use the file picker above.</p>}
      </main>
    </div>
  );
}
