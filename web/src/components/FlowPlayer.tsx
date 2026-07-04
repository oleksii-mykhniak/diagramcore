import { useEffect, useRef, useState } from 'react';
import type { FlowPlayerState } from '../flowPlayer';
import { resolveFlowSteps } from '../flowPlayer';
import type { Diagram } from '../types';

interface Props {
  diagram: Diagram;
  state: FlowPlayerState;
  onChange: (state: FlowPlayerState) => void;
}

const AUTOPLAY_INTERVAL_MS = 1200;

export function FlowPlayer({ diagram, state, onChange }: Props) {
  const flows = diagram.flows ?? [];
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flow = state.flowIndex === null ? null : flows[state.flowIndex];
  const { steps, pendingBranch } = flow
    ? resolveFlowSteps(flow, state.choices)
    : { steps: [], pendingBranch: null };
  const canGoNext = state.currentIndex + 1 < steps.length;
  const awaitingBranchChoice = !canGoNext && pendingBranch !== null;

  useEffect(() => {
    if (!playing) return;
    if (!canGoNext) {
      setPlaying(false);
      return;
    }
    timerRef.current = setInterval(() => {
      onChange({ ...state, currentIndex: state.currentIndex + 1 });
    }, AUTOPLAY_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, canGoNext, state.currentIndex]);

  useEffect(() => {
    if (playing && (awaitingBranchChoice || !canGoNext)) {
      setPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, awaitingBranchChoice, canGoNext]);

  if (flows.length === 0) {
    return null;
  }

  const selectFlow = (index: number | null) => {
    setPlaying(false);
    onChange({ flowIndex: index, currentIndex: -1, choices: {} });
  };

  const next = () => {
    if (canGoNext) onChange({ ...state, currentIndex: state.currentIndex + 1 });
  };

  const prev = () => {
    setPlaying(false);
    onChange({ ...state, currentIndex: Math.max(-1, state.currentIndex - 1) });
  };

  const chooseBranch = (arm: 'then' | 'else') => {
    if (!pendingBranch) return;
    onChange({ ...state, choices: { ...state.choices, [pendingBranch.index]: arm } });
  };

  const currentNote = flow && state.currentIndex >= 0 ? steps[state.currentIndex]?.note : undefined;

  return (
    <div
      data-testid="flow-player"
      style={{
        marginBottom: 'var(--dc-space-4)',
        padding: 'var(--dc-space-2)',
        border: '1px solid var(--dc-border)',
        color: 'var(--dc-text)',
      }}
    >
      <label>
        Flow:{' '}
        <select
          data-testid="flow-select"
          value={state.flowIndex ?? ''}
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
          <button type="button" data-testid="flow-prev" onClick={prev} disabled={state.currentIndex < 0}>
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
            Step {state.currentIndex + 1} / {steps.length}
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
