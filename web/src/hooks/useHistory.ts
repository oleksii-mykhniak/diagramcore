import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { HistoryStep } from './useDiagramStack';

/** Undo/redo (PLAN.md step 7.7, refactored PLAN4.md step 12.13): a thin
 * wrapper around `useDiagramStack`'s `jumpToHistoryStep` — Undo/Redo are
 * just "move the cursor by one", the same primitive the History panel
 * (clicking an arbitrary entry) uses. This hook only adds the two
 * directional actions and the global keyboard shortcut. */
export function useHistory(
  historyRef: MutableRefObject<{ steps: HistoryStep[]; cursor: number }>,
  jumpToHistoryStep: (targetIndex: number) => Promise<void>,
) {
  const onUndo = useCallback(() => jumpToHistoryStep(historyRef.current.cursor - 1), [historyRef, jumpToHistoryStep]);
  const onRedo = useCallback(() => jumpToHistoryStep(historyRef.current.cursor + 1), [historyRef, jumpToHistoryStep]);

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
