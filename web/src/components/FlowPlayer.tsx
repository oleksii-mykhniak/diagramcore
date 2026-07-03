import { useEffect, useRef, useState } from 'react';
import type { BranchChoices } from '../flowPlayer';
import { resolveFlowSteps } from '../flowPlayer';
import type { Diagram } from '../types';
import type { ActiveStep } from './DiagramView';
import { pairKey } from '../flowPlayer';

interface Props {
  diagram: Diagram;
  /** Called whenever the active/visited step set changes, so the parent
   * can forward it to DiagramView. */
  onStateChange: (state: { activeStep: ActiveStep | null; visitedStepKeys: Set<string> }) => void;
}

const AUTOPLAY_INTERVAL_MS = 1200;

export function FlowPlayer({ diagram, onStateChange }: Props) {
  const flows = diagram.flows ?? [];
  const [flowIndex, setFlowIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = nothing highlighted yet
  const [choices, setChoices] = useState<BranchChoices>({});
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flow = flowIndex === null ? null : flows[flowIndex];
  const { steps, pendingBranch } = flow ? resolveFlowSteps(flow, choices) : { steps: [], pendingBranch: null };
  const canGoNext = currentIndex + 1 < steps.length;
  const awaitingBranchChoice = !canGoNext && pendingBranch !== null;

  useEffect(() => {
    if (!flow || currentIndex < 0) {
      onStateChange({ activeStep: null, visitedStepKeys: new Set() });
      return;
    }
    const visited = new Set(steps.slice(0, currentIndex).map((s) => pairKey(s.from, s.to)));
    const active = steps[currentIndex] ?? null;
    onStateChange({ activeStep: active, visitedStepKeys: visited });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, currentIndex, JSON.stringify(steps)]);

  useEffect(() => {
    if (!playing) return;
    if (!canGoNext) {
      setPlaying(false);
      return;
    }
    timerRef.current = setInterval(() => {
      setCurrentIndex((i) => i + 1);
    }, AUTOPLAY_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, canGoNext]);

  // Stop autoplay once we run out of steps or hit a branch needing input.
  useEffect(() => {
    if (playing && (awaitingBranchChoice || !canGoNext)) {
      setPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, awaitingBranchChoice, canGoNext]);

  const selectFlow = (index: number | null) => {
    setFlowIndex(index);
    setCurrentIndex(-1);
    setChoices({});
    setPlaying(false);
  };

  const next = () => {
    if (canGoNext) setCurrentIndex((i) => i + 1);
  };

  const prev = () => {
    setCurrentIndex((i) => Math.max(-1, i - 1));
    setPlaying(false);
  };

  const chooseBranch = (arm: 'then' | 'else') => {
    if (!pendingBranch) return;
    setChoices((prev) => ({ ...prev, [pendingBranch.index]: arm }));
  };

  if (flows.length === 0) {
    return null;
  }

  const currentNote = flow && currentIndex >= 0 ? steps[currentIndex]?.note : undefined;

  return (
    <div data-testid="flow-player" style={{ marginBottom: 16, padding: 8, border: '1px solid #ccc' }}>
      <label>
        Flow:{' '}
        <select
          data-testid="flow-select"
          value={flowIndex ?? ''}
          onChange={(e) => selectFlow(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">-- select a flow --</option>
          {flows.map((f, i) => (
            <option key={f.name} value={i}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {flow && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" data-testid="flow-prev" onClick={prev} disabled={currentIndex < 0}>
            Prev
          </button>
          <button type="button" data-testid="flow-next" onClick={next} disabled={!canGoNext}>
            Next
          </button>
          <button
            type="button"
            data-testid="flow-autoplay"
            onClick={() => setPlaying((p) => !p)}
            disabled={!canGoNext && !playing}
          >
            {playing ? 'Pause' : 'Autoplay'}
          </button>
          <span data-testid="flow-step-count">
            Step {currentIndex + 1} / {steps.length}
            {pendingBranch ? '+' : ''}
          </span>
        </div>
      )}
      {awaitingBranchChoice && pendingBranch && (
        <div data-testid="flow-branch-choice" style={{ marginTop: 8 }}>
          <p>Branch: {pendingBranch.condition}</p>
          <button type="button" data-testid="flow-branch-then" onClick={() => chooseBranch('then')}>
            Then
          </button>{' '}
          {pendingBranch.hasElse && (
            <button type="button" data-testid="flow-branch-else" onClick={() => chooseBranch('else')}>
              Else
            </button>
          )}
        </div>
      )}
      {currentNote && (
        <p data-testid="flow-note" style={{ marginTop: 8 }}>
          {currentNote}
        </p>
      )}
    </div>
  );
}
