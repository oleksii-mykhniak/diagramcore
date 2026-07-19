import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { parseDiagram } from '../parseDiagram';
import { validateDiagram } from '../wasmValidate';
import type { ValidationError } from '../wasmValidate';
import { computeLayout } from '../layout';
import type { DiagramLayout } from '../layout';
import type { Diagram, DiagramNode } from '../types';
import {
  buildLayoutFileFromLevel,
  downloadLayoutFile,
  fromLayoutSizes,
  layoutFileName,
  layoutSnapshotOf,
  parseLayoutFile,
} from '../layoutFile';
import type { LayoutEdgeStyle, LayoutFileSource, LayoutPosition, LayoutStyle, RenderStyle } from '../layoutFile';
import { initialFlowPlayerState } from '../flowPlayer';
import type { FlowPlayerState } from '../flowPlayer';
import { isNativeFsSupported, openDiagramFiles, pickSaveHandle, writeTextToHandle } from '../nativeFile';
import { decodeShareState } from '../shareLink';
import { downloadBlob } from '../svgExport';
import { AUTOSAVE_DEBOUNCE_MS, cancelScheduledAutosave, clearAutosave, loadAutosave, scheduleAutosave } from '../localAutosave';
import type { AutosaveRecord } from '../localAutosave';

const AUTO_SAVE_TO_FILE_KEY = 'dc-auto-save-to-file';

/** Whether a level has changes not yet reflected on disk (PLAN4.md step
 * 12.3) — compares BOTH the YAML text and the serialized layout state
 * (positions/sizes/styles/hidden-state/etc.) against the snapshot taken
 * at the last successful Save or fresh Open. Drag/resize/style/hide are
 * layout-only changes that never touch `rawText`, so a text-only
 * comparison (the pre-12.3 behavior) missed them entirely. Exported for
 * `TabStrip`, which needs the identical per-tab check for its `•`
 * marker. */
export function levelHasUnsavedChanges(level: LayoutFileSource & { rawText: string; savedRawText: string; savedLayoutSnapshot: string }): boolean {
  return level.rawText !== level.savedRawText || layoutSnapshotOf(level) !== level.savedLayoutSnapshot;
}

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
  /** Manually-resized node dimensions (PLAN3.md step 11.4) — like
   * `positions`, only nodes the user actually resized get an entry;
   * everything else keeps the auto-layout default size. */
  sizes: Record<string, { width: number; height: number }>;
  /** Instance-level style overrides (PLAN3.md step 11.8) — like `sizes`,
   * only nodes the user actually styled get an entry. */
  styles: Record<string, LayoutStyle>;
  /** Instance-level edge style overrides (PLAN3.md step 11.9), keyed by
   * `edgeStyle.ts`'s `edgeLinkKey` — like `styles`, only edges the user
   * actually styled get an entry. */
  edgeStyles: Record<string, LayoutEdgeStyle>;
  /** Edge label drag offsets relative to the edge's own midpoint
   * (PLAN3.md step 11.9), keyed by link-key — only labels the user
   * actually dragged get an entry. */
  edgeLabelOffsets: Record<string, LayoutPosition>;
  /** Link-keys whose label is individually hidden (PLAN3.md step 11.9),
   * independent of the global "Connection labels" show/hide-all view
   * setting. */
  hiddenEdgeLabels: Set<string>;
  /** Link-keys whose whole connector (line + marker + label) is hidden
   * (PLAN4.md step 12.7) — presentation only, layout-file state; never
   * seen by `dc context`/validation/YAML. */
  hiddenEdges: Set<string>;
  /** Node ids whose text label is hidden (PLAN4.md step 12.7) — the
   * shape itself still renders. */
  hiddenNodeLabels: Set<string>;
  /** Node ids bottom-to-top (PLAN4.md step 12.9) — presentation-only
   * draw order, not necessarily covering every node; see `zOrder.ts`'s
   * `resolveZOrder`. Unlike the `hidden*` sets, a later snapshot
   * (import/restore) REPLACES this rather than merging into it — it's
   * itself already the full resolved order as of that snapshot. */
  zOrder: string[];
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
  /** `layoutSnapshotOf(this)` at the last successful save (or at
   * open/drop-in) — PLAN4.md step 12.3's other half of "unsaved": a
   * drag/resize/style/hide never touches `rawText`, so dirty-tracking
   * needs this too. Kept as a precomputed string (not recomputed from
   * `savedRawText` alone) so restoring an autosave draft can leave it
   * pointing at what's genuinely on disk instead of at the draft. */
  savedLayoutSnapshot: string;
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

type HistoryEntry = { past: string[]; future: string[] };

/** Owns every currently open diagram tab (PLAN3.md step 11.7 — a main
 * file plus every `details:` sub-diagram reachable from it, all parsed
 * eagerly at load time instead of lazily on double-click), which one is
 * active, and the serialized-mutation machinery (`levelRef`/`runMutation`)
 * every editing hook builds on. Also owns undo/redo history — one
 * independent stack per tab, since switching tabs must not affect a
 * different tab's undo stack — and local-autosave scheduling for the
 * active tab. */
export function useDiagramStack() {
  const [virtualFS, setVirtualFS] = useState<Record<string, string>>({});
  const [levels, setLevels] = useState<Record<string, DiagramLevel>>({});
  /** Every open tab, in the order it was first opened; the main file is
   * always first and never closable. */
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [mainFileName, setMainFileName] = useState<string | null>(null);
  /** A tab whose file failed to parse/build (PLAN3.md step 11.7): kept
   * in `openTabs` so it still gets a tab (and, if it's on the current
   * breadcrumb path, still shows there) — its content just can't be
   * displayed, only the error. */
  const [tabErrors, setTabErrors] = useState<Record<string, string>>({});
  /** fileName -> the fileName of the tab whose node's `details:` first
   * opened it, used to reconstruct the breadcrumb path back to the main
   * file for whichever tab is active. */
  const [tabParent, setTabParent] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drillError, setDrillError] = useState<string | null>(null);
  /** "Restore unsaved work?" banner (PLAN3.md step 11.3): set whenever a
   * fresh load (open/drop/native-open — NOT a share-link restore, which
   * has its own explicit state) finds a local IndexedDB autosave record
   * for the same `fileName`, offering to swap in that draft instead. */
  const [restorePrompt, setRestorePrompt] = useState<AutosaveRecord | null>(null);

  const current = activeTab ? (levels[activeTab] ?? null) : null;
  /** Mirrors the active level synchronously (React state updates are not
   * synchronous, so a second `applyOps` call fired before the first one's
   * `setLevels` has been reflected in `current` would otherwise read stale
   * `rawText` and clobber the first edit — see docs/deviations.md, step
   * 7.4). Reassigned on every tab switch as well as on every mutation. */
  const levelRef = useRef<DiagramLevel | null>(null);

  /** One serialized mutation queue per tab (keyed by fileName at the
   * moment a mutation is queued, not read lazily at run time) — so an
   * edit queued for one tab can never end up applying to whichever tab
   * happens to be active by the time it actually runs, if the user
   * switched tabs in between. */
  const mutationChains = useRef<Map<string, Promise<void>>>(new Map());
  const runMutation = useCallback((run: () => Promise<void>) => {
    const key = levelRef.current?.fileName ?? '';
    const prevChain = mutationChains.current.get(key) ?? Promise.resolve();
    const next = prevChain.then(run, run);
    mutationChains.current.set(key, next);
    return next;
  }, []);

  /** Undo/redo (PLAN.md step 7.7): one `{past, future}` stack per tab
   * (PLAN3.md step 11.7), covering every YAML-document mutation
   * regardless of whether it came from the canvas (`applyOps`) or the
   * YAML panel (`applyTextReplace`) — node drag/layout-only changes
   * don't touch `rawText`, so they're outside undo's scope. Capped at 50
   * entries per tab. `historyRef.current` always points at the *active*
   * tab's entry (reassigned on every switch), so `useHistory` (which
   * only ever mutates `historyRef.current` directly) needs no per-tab
   * awareness of its own. */
  const historyByTab = useRef<Map<string, HistoryEntry>>(new Map());
  const historyRef = useRef<HistoryEntry>({ past: [], future: [] });
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });

  const historyFor = useCallback((fileName: string): HistoryEntry => {
    let h = historyByTab.current.get(fileName);
    if (!h) {
      h = { past: [], future: [] };
      historyByTab.current.set(fileName, h);
    }
    return h;
  }, []);

  const syncHistoryCounts = useCallback(() => {
    setHistoryCounts({ past: historyRef.current.past.length, future: historyRef.current.future.length });
  }, []);

  /** Discards *every* tab's history — only on a fresh load (Open/drop/
   * native-open/share-link/restore), which replaces the whole open-tabs
   * set anyway. Switching between already-open tabs must NOT call this
   * (see `switchTab`) — each tab's undo stack survives being switched
   * away from and back to. */
  const resetAllHistory = useCallback(
    (activeFileName: string | null) => {
      historyByTab.current.clear();
      historyRef.current = activeFileName ? historyFor(activeFileName) : { past: [], future: [] };
      syncHistoryCounts();
    },
    [historyFor, syncHistoryCounts],
  );

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
    const level: DiagramLevel = {
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
      sizes: {},
      styles: {},
      edgeStyles: {},
      edgeLabelOffsets: {},
      hiddenEdgeLabels: new Set<string>(),
      hiddenEdges: new Set<string>(),
      hiddenNodeLabels: new Set<string>(),
      zOrder: [],
      renderStyle: 'clean',
      savedRawText: text,
      savedLayoutSnapshot: '',
    };
    level.savedLayoutSnapshot = layoutSnapshotOf(level);
    return level;
  }, []);

  /** Eagerly parses every `details:` sub-diagram transitively reachable
   * from `mainLevel` against `vfs` (PLAN3.md step 11.7), breadth-first,
   * each file visited at most once (first reference wins for its
   * breadcrumb parent). A sub-diagram that fails to parse gets an entry
   * in `errors` (still becomes a tab, showing the error instead of a
   * canvas) rather than failing the whole open; one that isn't present
   * in `vfs` at all is skipped silently (same as today's double-click
   * behavior when the file wasn't opened together with the main one). */
  const loadReachableDetails = useCallback(
    async (
      mainFileName: string,
      mainLevel: DiagramLevel,
      vfs: Record<string, string>,
    ): Promise<{
      levels: Record<string, DiagramLevel>;
      tabs: string[];
      errors: Record<string, string>;
      parents: Record<string, string>;
    }> => {
      const levels: Record<string, DiagramLevel> = { [mainFileName]: mainLevel };
      const tabs = [mainFileName];
      const errors: Record<string, string> = {};
      const parents: Record<string, string> = {};
      const seen = new Set([mainFileName]);
      const queue: Array<{ fileName: string; parent: string }> = [];
      const enqueueDetailsOf = (level: DiagramLevel) => {
        for (const n of level.diagram.nodes) {
          if (n.details) queue.push({ fileName: detailsBasename(n.details), parent: level.fileName });
        }
      };
      enqueueDetailsOf(mainLevel);
      while (queue.length > 0) {
        const { fileName, parent } = queue.shift()!;
        if (seen.has(fileName)) continue;
        seen.add(fileName);
        const text = vfs[fileName];
        if (text === undefined) continue;
        tabs.push(fileName);
        parents[fileName] = parent;
        try {
          const level = await buildLevel(fileName, text);
          levels[fileName] = level;
          enqueueDetailsOf(level);
        } catch (err) {
          errors[fileName] = err instanceof Error ? err.message : String(err);
        }
      }
      return { levels, tabs, errors, parents };
    },
    [buildLevel],
  );

  /** Checks for a local autosave draft of `fileName` after a fresh load
   * (PLAN3.md step 11.3) and, if one exists, surfaces the restore banner
   * instead of silently discarding it. `diskLevel` is what was just
   * loaded from the real file — its saved snapshot is captured (PLAN4.md
   * step 12.3) so a later "Restore" can tell the indicator what's
   * genuinely on disk, distinct from the draft it's swapping in. */
  const checkAutosave = useCallback(async (fileName: string, diskLevel: DiagramLevel) => {
    const record = await loadAutosave(fileName);
    if (record) {
      setRestorePrompt(record);
      diskSnapshotForRestoreRef.current = { rawText: diskLevel.rawText, savedLayoutSnapshot: diskLevel.savedLayoutSnapshot };
    }
  }, []);

  /** Replaces the entire open-tabs set with a freshly loaded tree rooted
   * at `mainLevel` — shared by every "open a new document" entry point
   * (file input, drop, native picker, share link, autosave restore). */
  const openTree = useCallback(
    async (mainLevel: DiagramLevel, vfs: Record<string, string>) => {
      const { levels: newLevels, tabs, errors, parents } = await loadReachableDetails(mainLevel.fileName, mainLevel, vfs);
      levelRef.current = mainLevel;
      setLevels(newLevels);
      setOpenTabs(tabs);
      setTabErrors(errors);
      setTabParent(parents);
      setMainFileName(mainLevel.fileName);
      setActiveTab(mainLevel.fileName);
      resetAllHistory(mainLevel.fileName);
    },
    [loadReachableDetails, resetAllHistory],
  );

  const resetToEmpty = useCallback(() => {
    levelRef.current = null;
    setLevels({});
    setOpenTabs([]);
    setTabErrors({});
    setTabParent({});
    setMainFileName(null);
    setActiveTab(null);
    resetAllHistory(null);
  }, [resetAllHistory]);

  const openFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setLoadError(null);
      setDrillError(null);
      setRestorePrompt(null);
      try {
        const contents = await Promise.all(files.map(async (f) => [f.name, await f.text()] as const));
        const vfs = Object.fromEntries(contents);
        setVirtualFS(vfs);
        const [primaryName, primaryText] = contents[0];
        const mainLevel = await buildLevel(primaryName, primaryText);
        await openTree(mainLevel, vfs);
        void checkAutosave(primaryName, mainLevel);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        resetToEmpty();
      }
    },
    [buildLevel, openTree, resetToEmpty, checkAutosave],
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
        const vfs = { [fileName]: text };
        setVirtualFS(vfs);
        const level = await buildLevel(fileName, text);
        if (positions) {
          level.positions = { ...level.positions, ...positions };
          level.manualPositionIds = new Set(Object.keys(positions));
          level.savedLayoutSnapshot = layoutSnapshotOf(level);
        }
        await openTree(level, vfs);
        void checkAutosave(fileName, level);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
        resetToEmpty();
      }
    },
    [buildLevel, openTree, resetToEmpty, checkAutosave],
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
    // synchronously — NOT inside the `setLevels` updater. React 18
    // batches state updates and does not guarantee updater functions run
    // synchronously at call time (they may run later, when the batch is
    // flushed), so mirroring into `levelRef` from inside the updater let
    // a second `applyOps`/`applyTextReplace` call — fired immediately
    // after, before the batch flushed — read a stale `levelRef.current`
    // and race the first one (see docs/deviations.md, step 7.7).
    const merged = { ...levelRef.current, ...patch };
    levelRef.current = merged;
    setLevels((prev) => ({ ...prev, [merged.fileName]: merged }));
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
          level.sizes = { ...level.sizes, ...fromLayoutSizes(imported.views.default?.sizes) };
          level.styles = { ...level.styles, ...(imported.views.default?.styles ?? {}) };
          level.edgeStyles = { ...level.edgeStyles, ...(imported.views.default?.edgeStyles ?? {}) };
          level.edgeLabelOffsets = { ...level.edgeLabelOffsets, ...(imported.views.default?.edgeLabelOffsets ?? {}) };
          level.hiddenEdgeLabels = new Set([
            ...level.hiddenEdgeLabels,
            ...(imported.views.default?.hiddenEdgeLabels ?? []),
          ]);
          level.hiddenEdges = new Set([...level.hiddenEdges, ...(imported.views.default?.hiddenEdges ?? [])]);
          level.hiddenNodeLabels = new Set([
            ...level.hiddenNodeLabels,
            ...(imported.views.default?.hiddenNodeLabels ?? []),
          ]);
          if (imported.views.default?.zOrder?.length) level.zOrder = imported.views.default.zOrder;
          if (imported.renderStyle) level.renderStyle = imported.renderStyle;
          level.savedLayoutSnapshot = layoutSnapshotOf(level);
        }
        await openTree(level, { [opened.mainName]: opened.mainText });
        void checkAutosave(opened.mainName, level);
      } catch (err) {
        // AbortError: user cancelled the picker — not a real error.
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    [buildLevel, openTree, checkAutosave],
  );

  /** "Save"/"Save as" (PLAN.md step 8.1): writes the core YAML and (if any
   * position is manual) the layout back to their native handles, creating
   * a layout file via a save picker the first time one is needed. Falls
   * back to downloading both files when there's no native handle (API
   * unsupported, or the level was opened via the plain file input). */
  const onSave = useCallback(async () => {
    if (!current) return;
    const hasLayoutToSave =
      current.manualPositionIds.size > 0 ||
      Boolean(current.diagram.notes?.length) ||
      current.renderStyle !== 'clean' ||
      Object.keys(current.sizes).length > 0 ||
      Object.keys(current.styles).length > 0 ||
      Object.keys(current.edgeStyles).length > 0 ||
      Object.keys(current.edgeLabelOffsets).length > 0 ||
      current.hiddenEdgeLabels.size > 0 ||
      current.hiddenEdges.size > 0 ||
      current.hiddenNodeLabels.size > 0 ||
      current.zOrder.length > 0;
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
          buildLayoutFileFromLevel(current),
        );
      }
      updateCurrentLevel({ savedRawText: current.rawText, savedLayoutSnapshot: layoutSnapshotOf(current) });
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
          JSON.stringify(buildLayoutFileFromLevel(current), null, 2),
        );
      }
    }
    updateCurrentLevel({
      savedRawText: current.rawText,
      savedLayoutSnapshot: layoutSnapshotOf(current),
      layoutHandle: layoutHandle ?? undefined,
    });
  }, [current, updateCurrentLevel]);

  // Layout serialization is O(diagram size) — memoized on `current`'s
  // identity so it only recomputes when a mutation actually replaced the
  // level (PLAN4.md step 12.3 AC: "не на кожен рендер"), not on every
  // unrelated re-render of whatever owns this hook.
  const currentLayoutSnapshot = useMemo(() => (current ? layoutSnapshotOf(current) : ''), [current]);
  const hasUnsavedChanges = current
    ? current.rawText !== current.savedRawText || currentLayoutSnapshot !== current.savedLayoutSnapshot
    : false;

  /** The IndexedDB draft's content/timestamp the moment it last matched
   * what's now on screen, per tab (PLAN4.md step 12.3) — lets the save
   * indicator tell "edited, but the draft already covers it" (`Draft ·
   * autosaved HH:MM`) apart from "edited a moment ago, draft still
   * catching up" (`Unsaved`). A stale entry (content no longer matching
   * the current edit) simply stops satisfying `isDraftCurrent` below;
   * it doesn't need to be cleaned up. */
  const [autosavedByTab, setAutosavedByTab] = useState<Record<string, { rawText: string; layoutSnapshot: string; savedAt: number }>>({});
  const draftMeta = current ? autosavedByTab[current.fileName] : undefined;
  const isDraftCurrent = Boolean(
    current && draftMeta && draftMeta.rawText === current.rawText && draftMeta.layoutSnapshot === currentLayoutSnapshot,
  );
  const saveStatus: 'saved' | 'draft' | 'unsaved' = !hasUnsavedChanges ? 'saved' : isDraftCurrent ? 'draft' : 'unsaved';
  const draftSavedAt = isDraftCurrent ? draftMeta?.savedAt : undefined;

  // beforeunload only warns for the "unsaved" substate (PLAN4.md step
  // 12.3 AC 5) — a fresh IndexedDB draft already covers the edit, and
  // the restore banner will offer it back on the next load, so warning
  // here would just be crying wolf.
  const shouldWarnBeforeUnloadRef = useRef(false);
  shouldWarnBeforeUnloadRef.current = saveStatus === 'unsaved';

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!shouldWarnBeforeUnloadRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Local autosave (PLAN3.md step 11.3): every level mutation reschedules
  // a debounced IndexedDB write, keyed by `fileName` (PLAN3.md step
  // 11.7: since this keys off `current`, which is the *active* tab,
  // each tab gets its own independent autosave whenever it's the one
  // being edited).
  useEffect(() => {
    if (!current) return;
    const fileName = current.fileName;
    const rawText = current.rawText;
    const layoutSnapshot = currentLayoutSnapshot;
    scheduleAutosave(
      fileName,
      {
        rawText,
        positions: current.positions,
        notePositions: current.notePositions,
        renderStyle: current.renderStyle,
        sizes: current.sizes,
        styles: current.styles,
        edgeStyles: current.edgeStyles,
        edgeLabelOffsets: current.edgeLabelOffsets,
        hiddenEdgeLabels: Array.from(current.hiddenEdgeLabels),
        hiddenEdges: Array.from(current.hiddenEdges),
        hiddenNodeLabels: Array.from(current.hiddenNodeLabels),
        zOrder: current.zOrder,
      },
      (savedAt) => setAutosavedByTab((prev) => ({ ...prev, [fileName]: { rawText, layoutSnapshot, savedAt } })),
    );
  }, [current, currentLayoutSnapshot]);

  // "Auto-save to file" (PLAN4.md step 12.3, File-menu toggle,
  // localStorage-persisted): when on and the active tab has a native
  // handle, the same debounce that drives the IndexedDB draft also
  // writes straight to disk. The layout file specifically is only
  // auto-written once a `layoutHandle` already exists (from a prior
  // manual Save) — silently popping the native "Save As" picker in the
  // background the first time a position becomes manual would be a
  // surprise, not a convenience.
  const [autoSaveToFile, setAutoSaveToFile] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_SAVE_TO_FILE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleAutoSaveToFile = useCallback(() => {
    setAutoSaveToFile((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_SAVE_TO_FILE_KEY, next ? '1' : '0');
      } catch {
        /* localStorage unavailable (private mode, quota) — in-memory toggle still works for this session. */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!autoSaveToFile || !current || !current.mainHandle || !isNativeFsSupported() || !hasUnsavedChanges) return;
    const level = current;
    const timer = setTimeout(() => {
      void (async () => {
        await writeTextToHandle(level.mainHandle!, level.rawText);
        if (level.layoutHandle) {
          await writeTextToHandle(level.layoutHandle, JSON.stringify(buildLayoutFileFromLevel(level), null, 2));
        }
        // The active level may have moved on (further edits, tab switch)
        // while this write was in flight — only commit the "saved" snapshot
        // if it still matches exactly what was actually written to disk.
        if (levelRef.current?.fileName === level.fileName && levelRef.current.rawText === level.rawText) {
          updateCurrentLevel({ savedRawText: level.rawText, savedLayoutSnapshot: layoutSnapshotOf(level) });
        }
      })();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [autoSaveToFile, current, hasUnsavedChanges, updateCurrentLevel, levelRef]);

  /** The on-disk snapshot at the moment a restore banner was offered
   * (PLAN4.md step 12.3) — captured alongside `restorePrompt` so
   * `onRestoreAutosave` can leave `savedRawText`/`savedLayoutSnapshot`
   * pointing at what's genuinely on disk (the file that was just
   * loaded), not at the draft it's about to swap in. Without this, the
   * indicator would falsely claim "Saved" right after a Restore even
   * though the draft was never written back to the real file. */
  const diskSnapshotForRestoreRef = useRef<{ rawText: string; savedLayoutSnapshot: string } | null>(null);

  /** Restore banner → "Restore" (PLAN3.md step 11.3): swaps in the
   * IndexedDB draft's text/positions in place of what was just loaded
   * from the real file. */
  const onRestoreAutosave = useCallback(async () => {
    if (!restorePrompt) return;
    const record = restorePrompt;
    const disk = diskSnapshotForRestoreRef.current;
    setRestorePrompt(null);
    const level = await buildLevel(record.fileName, record.rawText);
    level.positions = { ...level.positions, ...record.positions };
    level.manualPositionIds = new Set(Object.keys(record.positions));
    level.notePositions = { ...level.notePositions, ...record.notePositions };
    level.sizes = { ...level.sizes, ...record.sizes };
    level.styles = { ...level.styles, ...record.styles };
    level.edgeStyles = { ...level.edgeStyles, ...record.edgeStyles };
    level.edgeLabelOffsets = { ...level.edgeLabelOffsets, ...record.edgeLabelOffsets };
    level.hiddenEdgeLabels = new Set([...level.hiddenEdgeLabels, ...(record.hiddenEdgeLabels ?? [])]);
    level.hiddenEdges = new Set([...level.hiddenEdges, ...(record.hiddenEdges ?? [])]);
    level.hiddenNodeLabels = new Set([...level.hiddenNodeLabels, ...(record.hiddenNodeLabels ?? [])]);
    if (record.zOrder?.length) level.zOrder = record.zOrder;
    level.renderStyle = record.renderStyle;
    // Deliberately NOT `layoutSnapshotOf(level)` — that would be the
    // draft's own layout, making the indicator lie that a just-restored,
    // never-actually-saved draft is "Saved" (the bug PLAN4.md step 12.3
    // set out to fix).
    if (disk) {
      level.savedRawText = disk.rawText;
      level.savedLayoutSnapshot = disk.savedLayoutSnapshot;
    }
    await openTree(level, { [record.fileName]: record.rawText });
  }, [restorePrompt, buildLevel, openTree]);

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
        level.sizes = { ...level.sizes, ...fromLayoutSizes(shared.layout.views.default?.sizes) };
        level.styles = { ...level.styles, ...(shared.layout.views.default?.styles ?? {}) };
        level.edgeStyles = { ...level.edgeStyles, ...(shared.layout.views.default?.edgeStyles ?? {}) };
        level.edgeLabelOffsets = { ...level.edgeLabelOffsets, ...(shared.layout.views.default?.edgeLabelOffsets ?? {}) };
        level.hiddenEdgeLabels = new Set([
          ...level.hiddenEdgeLabels,
          ...(shared.layout.views.default?.hiddenEdgeLabels ?? []),
        ]);
        level.hiddenEdges = new Set([
          ...level.hiddenEdges,
          ...(shared.layout.views.default?.hiddenEdges ?? []),
        ]);
        level.hiddenNodeLabels = new Set([
          ...level.hiddenNodeLabels,
          ...(shared.layout.views.default?.hiddenNodeLabels ?? []),
        ]);
        if (shared.layout.views.default?.zOrder?.length) level.zOrder = shared.layout.views.default.zOrder;
        if (shared.layout.renderStyle) level.renderStyle = shared.layout.renderStyle;
        level.savedLayoutSnapshot = layoutSnapshotOf(level);
      }
      await openTree(level, { [shared.fileName]: shared.yaml });
    })();
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Switches the active tab (PLAN3.md step 11.7) — instant, no
   * reparsing: every open tab's `DiagramLevel` already lives in
   * `levels`. Restores that tab's own undo stack instead of resetting
   * it, so switching away and back is completely non-destructive. */
  const switchTab = useCallback(
    (fileName: string) => {
      if (!levels[fileName] && !tabErrors[fileName]) return;
      setDrillError(null);
      setActiveTab(fileName);
      levelRef.current = levels[fileName] ?? null;
      historyRef.current = historyFor(fileName);
      syncHistoryCounts();
    },
    [levels, tabErrors, historyFor, syncHistoryCounts],
  );

  /** Double-clicking a node with `details:` (PLAN3.md step 11.7): every
   * reachable details file was already parsed at load time, so this is
   * just a tab switch, reopening the tab first if the user had closed
   * it. A details reference to a file that was never part of the
   * opened set at all (not in `virtualFS`) still shows the old
   * non-fatal `drillError` instead. */
  const openDetails = useCallback(
    (node: DiagramNode) => {
      setDrillError(null);
      if (!node.details) return;
      const basename = detailsBasename(node.details);
      if (!levels[basename] && !tabErrors[basename]) {
        setDrillError(
          `Cannot open sub-diagram "${node.details}": that file wasn't opened together with this one. ` +
            'Select both files (or a whole folder) in the file picker to enable drill-down.',
        );
        return;
      }
      setOpenTabs((prev) => (prev.includes(basename) ? prev : [...prev, basename]));
      switchTab(basename);
    },
    [levels, tabErrors, switchTab],
  );

  /** Closes a tab (PLAN3.md step 11.7) — the main tab can't be closed.
   * Closing the active tab falls back to its breadcrumb parent (or the
   * main tab if it has none), matching how "going up" felt in the old
   * drill-down stack. The tab's parsed level/history are kept around
   * (just no longer listed), so reopening it via another double-click
   * doesn't reparse either. */
  const closeTab = useCallback(
    (fileName: string) => {
      if (fileName === mainFileName) return;
      setOpenTabs((prev) => prev.filter((f) => f !== fileName));
      if (activeTab === fileName) {
        switchTab(tabParent[fileName] ?? mainFileName ?? fileName);
      }
    },
    [mainFileName, activeTab, tabParent, switchTab],
  );

  /** The breadcrumb path (PLAN3.md step 11.7) from the main tab down to
   * whichever tab is active, reconstructed by walking `tabParent`. */
  const breadcrumbFileNames = (() => {
    if (!activeTab) return [];
    const path = [activeTab];
    const seen = new Set([activeTab]);
    let cur = tabParent[activeTab];
    while (cur && !seen.has(cur)) {
      path.unshift(cur);
      seen.add(cur);
      cur = tabParent[cur];
    }
    return path;
  })();

  /** View → "Diagram style" (PLAN.md step 10.12): unlike grid/snap, this
   * lives on the level (not a bare UI pref) since it's saved in the
   * layout file/share link alongside positions. */
  const setRenderStyle = useCallback(
    (renderStyle: RenderStyle) => updateCurrentLevel({ renderStyle }),
    [updateCurrentLevel],
  );

  return {
    virtualFS,
    levels,
    openTabs,
    activeTab,
    mainFileName,
    tabErrors,
    breadcrumbFileNames,
    current,
    loadError,
    setLoadError,
    drillError,
    levelRef,
    runMutation,
    historyRef,
    historyCounts,
    syncHistoryCounts,
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
    saveStatus,
    draftSavedAt,
    autoSaveToFile,
    toggleAutoSaveToFile,
    openDetails,
    switchTab,
    closeTab,
    setRenderStyle,
    restorePrompt,
    onRestoreAutosave,
    onDiscardAutosave,
  };
}
