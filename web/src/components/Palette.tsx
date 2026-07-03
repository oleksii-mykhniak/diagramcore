import { DND_NODE_TYPE } from './FlowCanvas';

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];

/** Drag source for node CRUD (PLAN.md step 7.2): dragging one of these
 * onto the canvas creates a node of that type via `FlowCanvas`'s
 * onDropNodeType. */
export function Palette() {
  return (
    <div data-testid="palette" style={{ display: 'flex', gap: 8, padding: '4px 16px' }}>
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
            padding: '4px 8px',
            border: '1px solid #333',
            borderRadius: 4,
            cursor: 'grab',
            fontSize: 12,
            userSelect: 'none',
          }}
        >
          {type}
        </div>
      ))}
    </div>
  );
}
