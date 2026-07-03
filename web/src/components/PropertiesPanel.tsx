import type { DiagramNode } from '../types';

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];

interface Props {
  node: DiagramNode;
  onUpdate: (patch: Partial<DiagramNode>) => void;
  onDelete: () => void;
}

/** Node properties panel (PLAN.md step 7.2): edits label/type/description/
 * tags on the selected node, each field committing a `updateNode` patch
 * immediately (App.tsx re-derives the diagram from the patched YAML). */
export function PropertiesPanel({ node, onUpdate, onDelete }: Props) {
  return (
    <aside data-testid="properties-panel" style={{ padding: 12, borderLeft: '1px solid #ccc', minWidth: 220 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Node: {node.id}</h3>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Label
        <input
          data-testid="prop-label"
          value={node.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Type
        <select
          data-testid="prop-type"
          value={node.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        >
          {BASE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Description
        <textarea
          data-testid="prop-description"
          value={node.description ?? ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Tags (comma-separated)
        <input
          data-testid="prop-tags"
          value={(node.tags ?? []).join(', ')}
          onChange={(e) =>
            onUpdate({
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <button type="button" data-testid="delete-node" onClick={onDelete}>
        Delete node
      </button>
    </aside>
  );
}
