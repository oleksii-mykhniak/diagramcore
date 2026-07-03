import type { Flow, FlowStepOrBranch } from '../types';
import { isFlowBranch } from '../types';

export interface BranchTarget {
  branchAtIndex: number;
  arm: 'then' | 'else';
}

interface Props {
  flow: Flow | null;
  recording: boolean;
  branchTarget: BranchTarget | null;
  onNewFlow: () => void;
  onToggleRecording: () => void;
  onAddBranch: () => void;
  onSwitchArm: () => void;
  onFinishBranch: () => void;
  onUpdateStepNote: (atIndex: number, note: string) => void;
  onDeleteStep: (atIndex: number) => void;
}

function describeStep(step: FlowStepOrBranch): string {
  if (isFlowBranch(step)) return `[branch: ${step.branch.condition}]`;
  return `${step.from} → ${step.to}${step.note ? ` — ${step.note}` : ''}`;
}

/** Flow editor sidebar (PLAN.md step 7.4): "record" mode turns clicks on
 * canvas edges into flow steps (wired in App.tsx via FlowCanvas's
 * onEdgeClick); this panel starts/stops recording, manages branch
 * authoring, and lists/edits/deletes the current flow's top-level steps. */
export function FlowEditorPanel({
  flow,
  recording,
  branchTarget,
  onNewFlow,
  onToggleRecording,
  onAddBranch,
  onSwitchArm,
  onFinishBranch,
  onUpdateStepNote,
  onDeleteStep,
}: Props) {
  return (
    <div data-testid="flow-editor-panel" style={{ marginBottom: 16, padding: 8, border: '1px solid #ccc' }}>
      <button type="button" data-testid="new-flow" onClick={onNewFlow}>
        New flow
      </button>{' '}
      <button type="button" data-testid="toggle-recording" onClick={onToggleRecording} disabled={!flow}>
        {recording ? 'Stop recording' : 'Start recording'}
      </button>{' '}
      {recording && (
        <button type="button" data-testid="add-branch" onClick={onAddBranch}>
          Add branch
        </button>
      )}
      {recording && branchTarget && (
        <>
          {' '}
          <span data-testid="recording-arm">Recording: {branchTarget.arm}</span>{' '}
          <button type="button" data-testid="switch-arm" onClick={onSwitchArm}>
            Switch to {branchTarget.arm === 'then' ? 'else' : 'then'}
          </button>{' '}
          <button type="button" data-testid="finish-branch" onClick={onFinishBranch}>
            Finish branch
          </button>
        </>
      )}
      {flow && (
        <ul data-testid="flow-steps-list" style={{ marginTop: 8 }}>
          {flow.steps.map((step, index) => (
            <li key={index} data-testid={`flow-step-${index}`}>
              {describeStep(step)}{' '}
              {!isFlowBranch(step) && (
                <input
                  data-testid={`flow-step-note-${index}`}
                  value={step.note ?? ''}
                  onChange={(e) => onUpdateStepNote(index, e.target.value)}
                />
              )}
              <button type="button" data-testid={`flow-step-delete-${index}`} onClick={() => onDeleteStep(index)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
