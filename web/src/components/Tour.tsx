import { useState } from 'react';

const TIPS = [
  'Drag a shape from the palette onto the canvas to add a node.',
  'Drag from a node\'s handle to another node to draw a link — the "Links" panel lets you edit or delete any link.',
  'Set a node\'s parent (drag it into a container, or edit parent: in the YAML) to nest it — nested diagrams render as containers on the canvas and in D2/Mermaid.',
  'Select a node or link to change its fill, stroke, line style, and — for links — its arrow markers and label, from the Properties/Links panel.',
  'Shift+drag on empty canvas to rubber-band select several nodes at once — drag, Delete, or Cmd/Ctrl+D (duplicate) all act on the whole selection.',
  'Pick a flow in the flow player and step through it to see which links it uses, in order.',
  'The Problems panel validates live — click an error to jump straight to the node or line that caused it.',
  'Double-click a node (or press F2) to rename it right on the canvas — the Properties panel lets you size, bold, color, and align its text too.',
  'The save status in the header shows Saved/Draft/Unsaved — turn on Auto-save to file (File menu) to write changes straight back to disk as you work.',
  'Hide a connection or a node\'s label from its Properties without deleting it — View > Core view shows everything hidden, translucent, so you can find and unhide it again.',
  'Right-click a node for a context menu with layering (bring to front/back), grouping, and alignment actions — the same actions are in the Edit menu.',
  'Select two or more nodes and press Cmd/Ctrl+G to group them into a container; Cmd/Ctrl+Shift+G ungroups. Cmd/Ctrl+C/X/V copies, cuts, and pastes a selection — even across tabs.',
  'Select 3+ nodes and use Edit > Align or Distribute to line them up or space them evenly.',
  'Give a node a custom image from Properties → Image — it shows on the canvas and in exported SVGs.',
  'The History panel (right dock) lists every edit by name — click any entry to jump straight to that point, forward or back.',
];

/** Short built-in onboarding tour (PLAN.md step 8.3) — a few tips a user
 * can step through; no AC in the plan requires testing its flow, so it's
 * intentionally minimal (no forced first-visit auto-show). */
export function Tour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);

  return (
    <div
      data-testid="tour"
      style={{
        position: 'fixed',
        bottom: 'var(--dc-space-4)',
        right: 'var(--dc-space-4)',
        border: '1px solid var(--dc-border)',
        borderRadius: 'var(--dc-radius-md)',
        boxShadow: 'var(--dc-shadow)',
        background: 'var(--dc-surface)',
        color: 'var(--dc-text)',
        padding: 'var(--dc-space-3)',
        maxWidth: 320,
        zIndex: 100,
      }}
    >
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
