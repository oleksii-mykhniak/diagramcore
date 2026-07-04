import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { parseDiagram } from '../parseDiagram';
import { validateDiagram } from '../wasmValidate';
import { computeLayout } from '../layout';
import type { LayoutPosition } from '../layoutFile';
import type { DiagramLevel } from './useDiagramStack';

/** Undo/redo actions (PLAN.md step 7.7) built on top of the history
 * state owned by `useDiagramStack` (`historyCounts`/`pushHistory`/
 * `resetHistory` live there since a fresh document load must always
 * reset them — see that hook's doc comment). This hook only adds the
 * two actions themselves and the global keyboard shortcut. */
export function useHistory(
  levelRef: MutableRefObject<DiagramLevel | null>,
  runMutation: (run: () => Promise<void>) => Promise<void>,
  updateCurrentLevel: (patch: Partial<DiagramLevel>) => void,
  historyRef: MutableRefObject<{ past: string[]; future: string[] }>,
  syncHistoryCounts: () => void,
) {
  const HISTORY_LIMIT = 50;

  /** Moves a snapshot between the past/future stacks and re-derives the
   * level from it exactly like `applyTextReplace`, but without touching
   * history itself. Serialized through the same queue as every other
   * mutation. */
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
    return runMutation(run);
  }, [levelRef, historyRef, runMutation, syncHistoryCounts, updateCurrentLevel]);

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
    return runMutation(run);
  }, [levelRef, historyRef, runMutation, syncHistoryCounts, updateCurrentLevel]);

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

  return { onUndo, onRedo };
}
