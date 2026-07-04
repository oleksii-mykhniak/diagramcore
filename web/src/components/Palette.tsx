import { DND_NODE_TYPE, NOTE_DND_TYPE } from './FlowCanvas';
import { normalizeCustomTypes } from '../types';
import type { Diagram } from '../types';

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

interface Props {
  diagram?: Diagram;
}

/** Drag source for node CRUD (PLAN.md step 7.2): dragging one of these
 * onto the canvas creates a node of that type via `FlowCanvas`'s
 * onDropNodeType. Vertical list with a shape preview, in the left sidebar
 * since PLAN.md step 10.4; a "Custom" section for the current diagram's
 * `custom_types` was added in step 10.8. */
export function Palette({ diagram }: Props) {
  const customTypes = diagram ? normalizeCustomTypes(diagram.diagram) : [];

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
        overflowY: 'auto',
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
      <div
        data-testid="palette-item-note"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_NODE_TYPE, NOTE_DND_TYPE);
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--dc-font-size-sm)',
            color: 'var(--dc-text-muted)',
          }}
        >
          Aa
        </div>
        <span style={{ fontSize: 'var(--dc-font-size-sm)', color: 'var(--dc-text)' }}>Text</span>
      </div>
      {customTypes.length > 0 && (
        <>
          <div
            style={{
              borderTop: '1px solid var(--dc-border)',
              paddingTop: 'var(--dc-space-2)',
              marginTop: 'var(--dc-space-1)',
              fontSize: 'var(--dc-font-size-sm)',
              color: 'var(--dc-text-muted)',
              textAlign: 'center',
            }}
          >
            Custom
          </div>
          {customTypes.map((ct) => (
            <div
              key={ct.name}
              data-testid={`palette-item-${ct.name}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_NODE_TYPE, ct.name);
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
                  background: ct.color ?? 'var(--dc-node-fill)',
                  borderRadius: 'var(--dc-radius-sm)',
                }}
              />
              <span style={{ fontSize: 'var(--dc-font-size-sm)', color: 'var(--dc-text)' }}>{ct.name}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
