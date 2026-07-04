import { DND_NODE_TYPE } from './FlowCanvas';

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];

/** Rough per-type preview shape (PLAN.md step 10.4) — a cheap approximation
 * of each node type's outline. The real, single shared shape registry
 * (canvas + export + palette drawing through the same code) arrives in
 * step 10.6; this is intentionally not that. */
const PREVIEW_STYLE: Record<string, React.CSSProperties> = {
  actor: { borderRadius: '50%' },
  service: { borderRadius: 'var(--dc-radius-md)' },
  storage: { borderRadius: '0 0 var(--dc-radius-lg) var(--dc-radius-lg)', borderTop: '3px double var(--dc-node-border)' },
  queue: { borderRadius: 0, borderStyle: 'dashed' },
  external: { borderRadius: 'var(--dc-radius-md)', borderStyle: 'dotted', background: 'var(--dc-node-external-fill)' },
  component: { borderRadius: 'var(--dc-radius-sm)' },
};

/** Drag source for node CRUD (PLAN.md step 7.2): dragging one of these
 * onto the canvas creates a node of that type via `FlowCanvas`'s
 * onDropNodeType. Vertical list with a shape preview, in the left sidebar
 * since PLAN.md step 10.4. */
export function Palette() {
  return (
    <div
      data-testid="palette"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--dc-space-2)',
        padding: 'var(--dc-space-3)',
        width: 96,
        borderRight: '1px solid var(--dc-border)',
        background: 'var(--dc-surface)',
      }}
    >
      {BASE_TYPES.map((type) => (
        <div
          key={type}
          data-testid={`palette-item-${type}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_NODE_TYPE, type);
            e.dataTransfer.effectAllowed = 'move';
          }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--dc-space-1)',
            padding: 'var(--dc-space-1)',
            borderRadius: 'var(--dc-radius-md)',
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: 36,
              height: 24,
              border: '1.5px solid var(--dc-node-border)',
              background: 'var(--dc-node-fill)',
              ...PREVIEW_STYLE[type],
            }}
          />
          <span style={{ fontSize: 'var(--dc-font-size-sm)', color: 'var(--dc-text)' }}>{type}</span>
        </div>
      ))}
    </div>
  );
}
