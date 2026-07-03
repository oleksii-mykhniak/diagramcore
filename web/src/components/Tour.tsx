import { useState } from 'react';

const TIPS = [
  'Drag a shape from the palette onto the canvas to add a node.',
  'Drag from a node\'s handle to another node to draw a link — the "Links" panel lets you edit or delete any link.',
  'Pick a flow in the flow player and step through it to see which links it uses, in order.',
  'The Problems panel validates live — click an error to jump straight to the node or line that caused it.',
];

/** Short built-in onboarding tour (PLAN.md step 8.3) — a few tips a user
 * can step through; no AC in the plan requires testing its flow, so it's
 * intentionally minimal (no forced first-visit auto-show). */
export function Tour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);

  return (
    <div data-testid="tour" style={{ position: 'fixed', bottom: 16, right: 16, border: '1px solid #333', background: '#fff', padding: 12, maxWidth: 320 }}>
      <p data-testid="tour-tip">{TIPS[index]}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>
          {index + 1} / {TIPS.length}
        </span>
        <div>
          <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            Prev
          </button>{' '}
          {index < TIPS.length - 1 ? (
            <button type="button" data-testid="tour-next" onClick={() => setIndex((i) => i + 1)}>
              Next
            </button>
          ) : (
            <button type="button" data-testid="tour-done" onClick={onClose}>
              Done
            </button>
          )}
          {' '}
          <button type="button" data-testid="tour-skip" onClick={onClose}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
