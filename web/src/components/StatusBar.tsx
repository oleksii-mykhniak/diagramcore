import { useState } from 'react';
import { ProblemsPanel } from './ProblemsPanel';
import type { ValidationError } from '../wasmValidate';

interface StatusBarProps {
  errors: ValidationError[];
  onSelectError: (error: ValidationError) => void;
  nodeCount: number;
  linkCount: number;
}

/** Bottom status bar (PLAN.md step 10.4): validation indicator that
 * expands the existing `ProblemsPanel` above itself when clicked, plus a
 * node/link counter. Zoom-level display is deferred — it needs the
 * ReactFlow instance, not currently exposed outside `FlowCanvas`
 * (docs/deviations.md, step 10.4). */
export function StatusBar({ errors, onSelectError, nodeCount, linkCount }: StatusBarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid="status-bar"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--dc-space-4)',
        padding: 'var(--dc-space-1) var(--dc-space-3)',
        borderTop: '1px solid var(--dc-border)',
        background: 'var(--dc-surface)',
        color: 'var(--dc-text)',
        fontSize: 'var(--dc-font-size-sm)',
      }}
    >
      <button
        type="button"
        data-testid="status-validation"
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: errors.length === 0 ? 'var(--dc-text)' : 'var(--dc-danger)',
          fontSize: 'var(--dc-font-size-sm)',
        }}
      >
        {errors.length === 0 ? 'OK' : `${errors.length} problem${errors.length === 1 ? '' : 's'}`}
      </button>
      <span data-testid="status-counts">
        {nodeCount} node{nodeCount === 1 ? '' : 's'} · {linkCount} link{linkCount === 1 ? '' : 's'}
      </span>
      {expanded && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            minWidth: 320,
            maxHeight: 300,
            overflow: 'auto',
            background: 'var(--dc-surface)',
            border: '1px solid var(--dc-border)',
            borderRadius: 'var(--dc-radius-md)',
            boxShadow: 'var(--dc-shadow)',
          }}
        >
          <ProblemsPanel
            errors={errors}
            onSelectError={(error) => {
              onSelectError(error);
              setExpanded(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
