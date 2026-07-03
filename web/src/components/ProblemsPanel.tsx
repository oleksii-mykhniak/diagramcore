import type { ValidationError } from '../wasmValidate';

interface Props {
  errors: ValidationError[];
  onSelectError: (error: ValidationError) => void;
}

/** Problems panel (PLAN.md step 7.6): lists every validation error from
 * the last (debounced) WASM validation pass; clicking one asks App.tsx to
 * focus the canvas/YAML panel on the offending element. */
export function ProblemsPanel({ errors, onSelectError }: Props) {
  return (
    <div data-testid="problems-panel" style={{ marginTop: 16, borderTop: '1px solid #ccc', paddingTop: 8 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Problems</h3>
      {errors.length === 0 ? (
        <p data-testid="problems-ok">OK — no validation errors</p>
      ) : (
        <ul data-testid="problems-list">
          {errors.map((e, i) => (
            <li key={`${e.file}:${e.line}:${e.code}:${i}`}>
              <button
                type="button"
                data-testid={`problem-${i}`}
                onClick={() => onSelectError(e)}
                style={{ textAlign: 'left', background: 'none', border: 'none', color: '#c00', cursor: 'pointer' }}
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
