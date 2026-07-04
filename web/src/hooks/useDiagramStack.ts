import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { parseDiagram } from '../parseDiagram';
import { validateDiagram } from '../wasmValidate';
import type { ValidationError } from '../wasmValidate';
import { computeLayout } from '../layout';
import type { DiagramLayout } from '../layout';
import type { Diagram, DiagramNode } from '../types';
import { buildLayoutFile, downloadLayoutFile, layoutFileName, parseLayoutFile } from '../layoutFile';
import type { LayoutPosition, RenderStyle } from '../layoutFile';
import { initialFlowPlayerState } from '../flowPlayer';
import type { FlowPlayerState } from '../flowPlayer';
import { isNativeFsSupported, openDiagramFiles, pickSaveHandle, writeTextToHandle } from '../nativeFile';
import { decodeShareState } from '../shareLink';
import { downloadBlob } from '../svgExport';
import { cancelScheduledAutosave, clearAutosave, loadAutosave, scheduleAutosave } from '../localAutosave';
import type { AutosaveRecord } from '../localAutosave';

export interface DiagramLevel {
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
  /** Note positions (PLAN.md step 10.11) — separate from `positions`
   * since notes aren't diagram nodes and have no auto-layout; every note
   * has an entry, defaulted on load if the layout file didn't have one. */
  notePositions: Record<string, LayoutPosition>;
  /** Diagram style preset (PLAN.md step 10.12), persisted in the layout
   * file/share link — see `layoutFile.ts`'s `RenderStyle`. */
  renderStyle: RenderStyle;
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

/** <details reference> -> basename, matching how details are resolved
 * against the virtual filesystem of files opened together (see openFiles
 * below). Real relative-path resolution (../, subdirectories) is out of
 * scope for v0 - all files are expected in the same flat selection. */
function detailsBasename(details: string): string {
  const parts = details.split('/');
  return parts[parts.length - 1];
}

const HISTORY_LIMIT = 50;

/** Owns the open-document stack: which file(s) are loaded, the current
 * drill-down level, and the serialized-mutation machinery (`levelRef`/
 * `runMutation`) every editing hook builds on. Also owns undo/redo history
 * state, since a fresh load must always reset it (PLAN.md step 7.7) —
 * kept alongside the stack so every load site (open/drop/native-open/
 * drill-down/share-link) resets it in the same place instead of
 * threading a callback through from a sibling hook. */
export function useDiagramStack() {
  const [virtualFS, setVirtualFS] = useState<Record<string, string>>({});
  const [stack, setStack] = useState<DiagramLevel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  /** "Restore unsaved work?" banner (PLAN3.md step 11.3): set whenever a
   * fresh load (open/drop/native-open — NOT a share-link restore, which
   * has its own explicit state) finds a local IndexedDB autosave record
   * for the same `fileName`, offering to swap in that draft instead. */
  const [restorePrompt, setRestorePrompt] = useState<AutosaveRecord | null>(null);

  const current = stack.length > 0 ? stack[stack.length - 1] : null;
  /** Mirrors the current level synchronously (React state updates are not
   * synchronous, so a second `applyOps` call fired before the first one's
   * `setStack` has been reflected in `current` would otherwise read stale
   * `rawText` and clobber the first edit — see docs/deviations.md, step
   * 7.4). `applyChainRef` additionally serializes overlapping calls so
   * each one builds on the previous one's result. */
  const levelRef = useRef<DiagramLevel | null>(null);
  const applyChainRef = useRef<Promise<void>>(Promise.resolve());

  /** Serializes overlapping mutations (e.g. clicking edges in quick
   * succession while recording a flow) so each one patches the state left
   * behind by the previous one, instead of racing on a stale
   * `levelRef.current` (docs/deviations.md, step 7.4). Shared by every
   * mutation path: patches, YAML-panel replaces, undo, redo. */
  const runMutation = useCallback((run: () => Promise<void>) => {
    const next = applyChainRef.current.then(run, run);
    applyChainRef.current = next;
    return next;
  }, []);

  /** Undo/redo (PLAN.md step 7.7): a single stack of previous `rawText`
   * snapshots per level, covering every YAML-document mutation regardless
   * of whether it came from the canvas (`applyOps`) or the YAML panel
   * (`applyTextReplace`) — node drag/layout-only changes don't touch
   * `rawText`, so they're outside undo's scope, matching the plan's
   * "history at the YAML document level". Capped at 50 entries. */
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
      notePositions: Object.fromEntries(
        (parsed.notes ?? []).map((note, i) => [note.id, { x: 40 + i * 30, y: 40 + i * 30 }]),
      ),
      renderStyle: 'clean',
      savedRawText: text,
    };
  }, []);

  /** Checks for a local autosave draft of `fileName` after a fresh load
   * (PLAN3.md step 11.3) and, if one exists, surfaces the restore banner
   * instead of silently discarding it. */
  const checkAutosave = useCallback(async (fileName: string) => {
    const record = await loadAutosave(fileName);
    if (record) setRestorePrompt(record);
  }, []);

  const openFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setLoadError(null);
      setDrillError(null);
      setRestorePrompt(null);
      try {
        const contents = await Promise.all(files.map(async (f) => [f.name, await f.text()] as const));
        setVirtualFS(Object.fromEntries(contents));
        const [primaryName, primaryText] = contents[0];
        const level = await buildLevel(primaryName, primaryText);
        levelRef.current = level;
        resetHistory();
        setStack([level]);
        void checkAutosave(primaryName);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        levelRef.current = null;
        resetHistory();
        setStack([]);
      }
    },
    [buildLevel, resetHistory, checkAutosave],
  );

  /** Opens an in-memory diagram (a bundled example, "New diagram" template
   * — PLAN.md step 8.3 — or a draw.io import — step 10.10) the same way
   * `openFiles` opens a File: no native handle, so Save falls back to
   * download. `positions`, when given, seeds manual (not auto-layout)
   * node positions — used by the draw.io importer to place nodes where
   * they were in the source diagram. */
  const openTextAsDiagram = useCallback(
    async (fileName: string, text: string, positions?: Record<string, LayoutPosition>) => {
      setLoadError(null);
      setDrillError(null);
      setRestorePrompt(null);
      try {
        setVirtualFS({ [fileName]: text });
        const level = await buildLevel(fileName, text);
        if (positions) {
          level.positions = { ...level.positions, ...positions };
          level.manualPositionIds = new Set(Object.keys(positions));
        }
        levelRef.current = level;
        resetHistory();
        setStack([level]);
        void checkAutosave(fileName);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        levelRef.current = null;
        resetHistory();
        setStack([]);
      }
    },
    [buildLevel, resetHistory, checkAutosave],
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

  /** "Open" via the File System Access API (PLAN.md step 8.1, Chromium
   * only): lets Save write straight back to the same files. Falls back
   * to the plain file input (already handled by `onFileInput`/`openFiles`)
   * when the API isn't available, without throwing. */
  const onOpenNative = useCallback(
    async (fallback: () => void) => {
      if (!isNativeFsSupported()) {
        fallback();
        return;
      }
      setLoadError(null);
      setDrillError(null);
      setRestorePrompt(null);
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
          level.notePositions = { ...level.notePositions, ...(imported.views.default?.notePositions ?? {}) };
          if (imported.renderStyle) level.renderStyle = imported.renderStyle;
        }
        levelRef.current = level;
        resetHistory();
        setStack([level]);
        void checkAutosave(opened.mainName);
      } catch (err) {
        // AbortError: user cancelled the picker — not a real error.
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    [buildLevel, resetHistory, checkAutosave],
  );

  /** "Save"/"Save as" (PLAN.md step 8.1): writes the core YAML and (if any
   * position is manual) the layout back to their native handles, creating
   * a layout file via a save picker the first time one is needed. Falls
   * back to downloading both files when there's no native handle (API
   * unsupported, or the level was opened via the plain file input). */
  const onSave = useCallback(async () => {
    if (!current) return;
    const hasLayoutToSave =
      current.manualPositionIds.size > 0 || Boolean(current.diagram.notes?.length) || current.renderStyle !== 'clean';
    // A real Save makes any pending/stored local autosave draft moot
    // (PLAN3.md step 11.3) — cancel the debounced write and clear
    // whatever's already in IndexedDB for this file.
    cancelScheduledAutosave(current.fileName);
    void clearAutosave(current.fileName);
    if (!current.mainHandle || !isNativeFsSupported()) {
      downloadBlob(current.fileName, new Blob([current.rawText], { type: 'application/x-yaml' }));
      if (hasLayoutToSave) {
        downloadLayoutFile(
          layoutFileName(current.fileName),
          buildLayoutFile(current.positions, current.notePositions, current.renderStyle),
        );
      }
      updateCurrentLevel({ savedRawText: current.rawText });
      return;
    }
    await writeTextToHandle(current.mainHandle, current.rawText);
    let layoutHandle = current.layoutHandle ?? null;
    if (hasLayoutToSave) {
      if (!layoutHandle) {
        layoutHandle = await pickSaveHandle(layoutFileName(current.fileName));
      }
      if (layoutHandle) {
        await writeTextToHandle(
          layoutHandle,
          JSON.stringify(buildLayoutFile(current.positions, current.notePositions, current.renderStyle), null, 2),
        );
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

  // Local autosave (PLAN3.md step 11.3): every level mutation reschedules
  // a debounced IndexedDB write, keyed by `fileName` — a safety net
  // against losing work to an accidental reload/close, independent of
  // the real Save.
  useEffect(() => {
    if (!current) return;
    scheduleAutosave(current.fileName, {
      rawText: current.rawText,
      positions: current.positions,
      notePositions: current.notePositions,
      renderStyle: current.renderStyle,
    });
  }, [current]);

  /** Restore banner → "Restore" (PLAN3.md step 11.3): swaps in the
   * IndexedDB draft's text/positions in place of what was just loaded
   * from the real file. */
  const onRestoreAutosave = useCallback(async () => {
    if (!restorePrompt) return;
    const record = restorePrompt;
    setRestorePrompt(null);
    const level = await buildLevel(record.fileName, record.rawText);
    level.positions = { ...level.positions, ...record.positions };
    level.manualPositionIds = new Set(Object.keys(record.positions));
    level.notePositions = { ...level.notePositions, ...record.notePositions };
    level.renderStyle = record.renderStyle;
    levelRef.current = level;
    resetHistory();
    setStack([level]);
  }, [restorePrompt, buildLevel, resetHistory]);

  /** Restore banner → "Discard": drops the draft and keeps whatever was
   * just loaded from the real file. */
  const onDiscardAutosave = useCallback(() => {
    if (!restorePrompt) return;
    void clearAutosave(restorePrompt.fileName);
    setRestorePrompt(null);
  }, [restorePrompt]);

  // Restore a share link (PLAN.md step 8.2) on load: the diagram opens as
  // an unsaved document (no native file handle — Save falls back to
  // download, same as any level without one). The fragment never leaves
  // the browser (it's after `#`, so it isn't part of any HTTP request).
  useEffect(() => {
    const shared = decodeShareState(window.location.hash);
    if (!shared) return;
    void (async () => {
      const level = await buildLevel(shared.fileName, shared.yaml);
      if (shared.layout) {
        const importedPositions = shared.layout.views.default?.positions ?? {};
        level.positions = { ...level.positions, ...importedPositions };
        level.manualPositionIds = new Set(Object.keys(importedPositions));
        level.notePositions = { ...level.notePositions, ...(shared.layout.views.default?.notePositions ?? {}) };
        if (shared.layout.renderStyle) level.renderStyle = shared.layout.renderStyle;
      }
      levelRef.current = level;
      resetHistory();
      setStack([level]);
    })();
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** View → "Diagram style" (PLAN.md step 10.12): unlike grid/snap, this
   * lives on the level (not a bare UI pref) since it's saved in the
   * layout file/share link alongside positions. */
  const setRenderStyle = useCallback(
    (renderStyle: RenderStyle) => updateCurrentLevel({ renderStyle }),
    [updateCurrentLevel],
  );

  const goToLevel = useCallback(
    (index: number) => {
      setDrillError(null);
      setStack((prev) => {
        const next = prev.slice(0, index + 1);
        levelRef.current = next[next.length - 1] ?? null;
        resetHistory();
        return next;
      });
    },
    [resetHistory],
  );

  return {
    virtualFS,
    stack,
    current,
    loadError,
    setLoadError,
    drillError,
    levelRef,
    runMutation,
    historyRef,
    historyCounts,
    syncHistoryCounts,
    resetHistory,
    pushHistory,
    buildLevel,
    openFiles,
    openTextAsDiagram,
    onFileInput,
    onDrop,
    onDragOver,
    updateCurrentLevel,
    onOpenNative,
    onSave,
    hasUnsavedChanges,
    openDetails,
    goToLevel,
    setRenderStyle,
    restorePrompt,
    onRestoreAutosave,
    onDiscardAutosave,
  };
}
