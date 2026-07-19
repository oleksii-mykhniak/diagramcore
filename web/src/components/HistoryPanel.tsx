import type { HistoryStep } from '../hooks/useDiagramStack';

interface HistoryPanelProps {
  steps: HistoryStep[];
  cursor: number;
  onJumpTo: (index: number) => void;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** History panel (PLAN4.md step 12.13) — fourth dock tab, a flat
 * bottom-to-top list of every checkpoint in the active tab's timeline.
 * `steps[0]` ("Open") is oldest, `steps[steps.length-1]` newest; the
 * entry at `cursor` is the current state. Entries past the cursor are
 * the redo branch — dimmed, same convention Photoshop's own History
 * panel uses. Clicking any entry jumps straight to it (non-destructive:
 * the branch survives until a fresh edit from mid-history truncates it,
 * same as a plain Undo followed by a new edit already does). */
export function HistoryPanel({ steps, cursor, onJumpTo }: HistoryPanelProps) {
  if (steps.length === 0) {
    return (
      <div style={{ padding: 'var(--dc-space-3)', color: 'var(--dc-text-muted)', fontSize: 'var(--dc-font-size-base)' }}>
        No history yet.
      </div>
    );
  }
  return (
    <div data-testid="history-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', height: '100%' }}>
      {steps.map((step, i) => {
        const isCurrent = i === cursor;
        const isFuture = i > cursor;
        return (
          <button
            key={i}
            type="button"
            data-testid={`history-step-${i}`}
            data-current={isCurrent || undefined}
            onClick={() => onJumpTo(i)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--dc-space-2)',
              width: '100%',
              textAlign: 'left',
              background: isCurrent ? 'var(--dc-surface-muted)' : 'none',
              border: 'none',
              borderLeft: isCurrent ? '3px solid var(--dc-accent)' : '3px solid transparent',
              padding: 'var(--dc-space-2) var(--dc-space-3)',
              cursor: 'pointer',
              color: isFuture ? 'var(--dc-text-muted)' : 'var(--dc-text)',
              opacity: isFuture ? 0.6 : 1,
              fontSize: 'var(--dc-font-size-base)',
              fontWeight: isCurrent ? 600 : 400,
            }}
          >
            <span>{step.label}</span>
            <span style={{ color: 'var(--dc-text-muted)', fontSize: 'var(--dc-font-size-sm)', flexShrink: 0 }}>
              {formatTime(step.at)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
