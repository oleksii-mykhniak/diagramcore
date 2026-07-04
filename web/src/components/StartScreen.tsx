import { useState } from 'react';
import { examples } from '../examples';
import { Tour } from './Tour';

export const BLANK_TEMPLATE = `diagram:
  title: "New diagram"

nodes:
  - id: A
    type: component

links: []
`;

interface Props {
  onOpenExample: (fileName: string, text: string) => void;
  onNewDiagram: (text: string) => void;
}

/** Start screen (PLAN.md step 8.3): shown when nothing is open yet — a
 * gallery of the bundled examples (with build-generated previews) plus a
 * blank "New diagram" starting point. "Open" (native picker or the
 * file-input fallback) lives in the header above, always available. */
export function StartScreen({ onOpenExample, onNewDiagram }: Props) {
  const [showTour, setShowTour] = useState(false);

  return (
    <div data-testid="start-screen" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" data-testid="new-diagram" onClick={() => onNewDiagram(BLANK_TEMPLATE)}>
          New diagram
        </button>
        <button type="button" data-testid="show-tour" onClick={() => setShowTour(true)}>
          Show tour
        </button>
      </div>
      <h2 style={{ fontSize: 16 }}>Examples</h2>
      <div data-testid="example-gallery" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {examples.map((ex) => (
          <button
            key={ex.fileName}
            type="button"
            data-testid={`example-${ex.fileName}`}
            onClick={() => onOpenExample(ex.fileName, ex.text)}
            style={{ border: '1px solid #ccc', padding: 8, background: '#fff', cursor: 'pointer', width: 180 }}
          >
            <img src={ex.previewUrl} alt={ex.fileName} style={{ width: '100%', height: 100, objectFit: 'contain' }} />
            <div style={{ fontSize: 12, marginTop: 4 }}>{ex.fileName}</div>
          </button>
        ))}
      </div>
      {showTour && <Tour onClose={() => setShowTour(false)} />}
    </div>
  );
}
