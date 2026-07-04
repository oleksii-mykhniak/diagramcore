import { normalizeCustomTypes } from '../types';
import type { Diagram, DiagramNode } from '../types';
import type { StyleOverride } from '../shapes';

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];

const DEFAULT_FILL = '#ffffff';
const DEFAULT_STROKE = '#333333';

interface Props {
  node: DiagramNode;
  diagram: Diagram;
  onUpdate: (patch: Partial<DiagramNode>) => void;
  onDelete: () => void;
  /** Instance style override for this node (PLAN3.md step 11.8), if any. */
  style?: StyleOverride;
  onUpdateStyle: (patch: Partial<StyleOverride>) => void;
  onResetStyle: () => void;
}

/** Node properties panel (PLAN.md step 7.2): edits label/type/description/
 * tags on the selected node, each field committing a `updateNode` patch
 * immediately (App.tsx re-derives the diagram from the patched YAML). The
 * type select includes the diagram's `custom_types` since step 10.8.
 * The Style section (PLAN3.md step 11.8) edits an instance-level style
 * override, kept in the layout file — never the YAML. */
export function PropertiesPanel({ node, diagram, onUpdate, onDelete, style, onUpdateStyle, onResetStyle }: Props) {
  const customTypeNames = normalizeCustomTypes(diagram.diagram).map((t) => t.name);
  return (
    <aside
      data-testid="properties-panel"
      style={{ padding: 'var(--dc-space-3)', borderLeft: '1px solid var(--dc-border)', minWidth: 220, color: 'var(--dc-text)' }}
    >
      <h3 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>Node: {node.id}</h3>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Label
        <input
          data-testid="prop-label"
          value={node.label ?? ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
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
          {customTypeNames.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Description
        <textarea
          data-testid="prop-description"
          value={node.description ?? ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
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
      <hr style={{ border: 'none', borderTop: '1px solid var(--dc-border)', margin: 'var(--dc-space-3) 0' }} />
      <h4 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>Style</h4>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Fill
        <input
          type="color"
          data-testid="prop-style-fill"
          value={style?.fill ?? DEFAULT_FILL}
          onChange={(e) => onUpdateStyle({ fill: e.target.value })}
          style={{ display: 'block' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Stroke
        <input
          type="color"
          data-testid="prop-style-stroke"
          value={style?.stroke ?? DEFAULT_STROKE}
          onChange={(e) => onUpdateStyle({ stroke: e.target.value })}
          style={{ display: 'block' }}
        />
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Stroke width
        <select
          data-testid="prop-style-stroke-width"
          value={style?.strokeWidth ?? 1.5}
          onChange={(e) => onUpdateStyle({ strokeWidth: Number(e.target.value) })}
          style={{ display: 'block', width: '100%' }}
        >
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 'var(--dc-space-2)' }}>
        Line style
        <select
          data-testid="prop-style-line-style"
          value={style?.lineStyle ?? 'solid'}
          onChange={(e) => onUpdateStyle({ lineStyle: e.target.value as StyleOverride['lineStyle'] })}
          style={{ display: 'block', width: '100%' }}
        >
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--dc-space-1)', marginBottom: 'var(--dc-space-2)' }}>
        <input
          type="checkbox"
          data-testid="prop-style-rounded"
          checked={style?.rounded ?? false}
          onChange={(e) => onUpdateStyle({ rounded: e.target.checked })}
        />
        Rounded corners
      </label>
      <button type="button" data-testid="reset-style" onClick={onResetStyle} disabled={!style} style={{ marginBottom: 'var(--dc-space-3)' }}>
        Reset style
      </button>
      <br />
      <button type="button" data-testid="delete-node" onClick={onDelete}>
        Delete node
      </button>
    </aside>
  );
}
