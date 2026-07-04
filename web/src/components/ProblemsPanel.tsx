import type { ValidationError } from '../wasmValidate';

interface Props {
  errors: ValidationError[];
  onSelectError: (error: ValidationError) => void;
}

/** Problems panel (PLAN.md step 7.6): lists every validation error from
 * the last (debounced) WASM validation pass; clicking one asks App.tsx to
 * focus the canvas/YAML panel on the offending element. Embedded inside
 * the status bar's expandable popover since PLAN.md step 10.4 — no
 * margin/border of its own, the popover supplies that. */
export function ProblemsPanel({ errors, onSelectError }: Props) {
  return (
    <div data-testid="problems-panel" style={{ padding: 'var(--dc-space-3)' }}>
      <h3 style={{ fontSize: 'var(--dc-font-size-base)', margin: '0 0 8px', color: 'var(--dc-text)' }}>Problems</h3>
      {errors.length === 0 ? (
        <p data-testid="problems-ok" style={{ color: 'var(--dc-text)' }}>
          OK — no validation errors
        </p>
      ) : (
        <ul data-testid="problems-list" style={{ margin: 0, paddingLeft: 'var(--dc-space-4)' }}>
          {errors.map((e, i) => (
            <li key={`${e.file}:${e.line}:${e.code}:${i}`}>
              <button
                type="button"
                data-testid={`problem-${i}`}
                onClick={() => onSelectError(e)}
                style={{ textAlign: 'left', background: 'none', border: 'none', color: 'var(--dc-danger)', cursor: 'pointer' }}
              >
                {e.file}:{e.line} [{e.code}] {e.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
