import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { parseDiagram } from './parseDiagram';
import { validateDiagram } from './wasmValidate';
import type { ValidationError } from './wasmValidate';
import { computeLayout } from './layout';
import type { DiagramLayout } from './layout';
import type { Diagram } from './types';
import { DiagramView } from './components/DiagramView';
import { buildLayoutFile, downloadLayoutFile, layoutFileName, parseLayoutFile } from './layoutFile';
import type { LayoutPosition } from './layoutFile';

export default function App() {
  const [fileName, setFileName] = useState<string>('diagram.dc.yaml');
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [layout, setLayout] = useState<DiagramLayout | null>(null);
  const [positions, setPositions] = useState<Record<string, LayoutPosition>>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openText = useCallback(async (name: string, text: string) => {
    setLoadError(null);
    try {
      const parsed = parseDiagram(text);
      const validationErrors = await validateDiagram(text);
      const computedLayout = await computeLayout(parsed);
      setErrors(validationErrors);
      setDiagram(parsed);
      setLayout(computedLayout);
      setPositions(Object.fromEntries(computedLayout.nodes.map((n) => [n.id, { x: n.x, y: n.y }])));
      setFileName(name);
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
      void file.text().then((text) => openText(file.name, text));
    },
    [openText],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      void file.text().then((text) => openText(file.name, text));
    },
    [openText],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onNodeDrag = useCallback((id: string, pos: LayoutPosition) => {
    setPositions((prev) => ({ ...prev, [id]: pos }));
  }, []);

  const onExportLayout = useCallback(() => {
    downloadLayoutFile(layoutFileName(fileName), buildLayoutFile(positions));
  }, [fileName, positions]);

  const onImportLayout = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const imported = parseLayoutFile(text);
        const importedPositions = imported.views.default?.positions ?? {};
        setPositions((prev) => ({ ...prev, ...importedPositions }));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    });
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
        {diagram && (
          <>
            {' '}
            <button type="button" data-testid="export-layout" onClick={onExportLayout}>
              Export layout
            </button>{' '}
            <label>
              Import layout:{' '}
              <input
                type="file"
                accept=".json"
                data-testid="layout-input"
                onChange={onImportLayout}
              />
            </label>
          </>
        )}
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
        {diagram && layout && (
          <DiagramView diagram={diagram} layout={layout} positions={positions} onNodeDrag={onNodeDrag} />
        )}
        {!diagram && !loadError && <p>Drag a .dc.yaml file here, or use the file picker above.</p>}
      </main>
    </div>
  );
}
