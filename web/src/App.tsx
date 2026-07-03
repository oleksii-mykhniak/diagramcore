import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { parseDiagram } from './parseDiagram';
import { validateDiagram } from './wasmValidate';
import type { ValidationError } from './wasmValidate';
import { computeLayout } from './layout';
import type { DiagramLayout } from './layout';
import type { Diagram } from './types';
import { DiagramView } from './components/DiagramView';

export default function App() {
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [layout, setLayout] = useState<DiagramLayout | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openText = useCallback(async (text: string) => {
    setLoadError(null);
    try {
      const parsed = parseDiagram(text);
      const validationErrors = await validateDiagram(text);
      const computedLayout = await computeLayout(parsed);
      setErrors(validationErrors);
      setDiagram(parsed);
      setLayout(computedLayout);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setDiagram(null);
      setLayout(null);
    }
  }, []);

  const onFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      void file.text().then(openText);
    },
    [openText],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      void file.text().then(openText);
    },
    [openText],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #ccc' }}>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>DiagramCore</h1>
        <input type="file" accept=".yaml,.yml" data-testid="file-input" onChange={onFileInput} />
      </header>
      <main style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {loadError && (
          <p role="alert" data-testid="load-error">
            {loadError}
          </p>
        )}
        {errors.length > 0 && (
          <ul data-testid="validation-errors">
            {errors.map((e) => (
              <li key={`${e.file}:${e.line}:${e.code}`}>
                {e.file}:{e.line} [{e.code}] {e.message}
              </li>
            ))}
          </ul>
        )}
        {diagram && layout && <DiagramView diagram={diagram} layout={layout} />}
        {!diagram && !loadError && <p>Drag a .dc.yaml file here, or use the file picker above.</p>}
      </main>
    </div>
  );
}
