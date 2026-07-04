import { useState } from 'react';
import type { DiagramLink } from '../types';
import { edgeLinkKey } from '../edgeStyle';
import type { EdgeStyleOverride } from '../edgeStyle';

const LINK_TYPES = ['request', 'call', 'query', 'event', 'dataflow', 'inherits', 'contains'];

interface Props {
  links: DiagramLink[];
  hoveredLinkIndex: number | null;
  onHoverLink: (index: number | null) => void;
  onUpdateLink: (index: number, patch: Partial<DiagramLink>) => void;
  onDeleteLink: (index: number) => void;
  /** Which link's row is expanded (PLAN3.md step 11.9) — controlled from
   * above so clicking an edge on the canvas can open the same row
   * (`useDiagramEditing`'s `selectedLinkIndex`). */
  selectedIndex: number | null;
  onSelectIndex: (index: number | null) => void;
  /** Instance-level edge style overrides (PLAN3.md step 11.9), keyed by
   * `edgeStyle.ts`'s `edgeLinkKey`. */
  edgeStyles: Record<string, EdgeStyleOverride>;
  onUpdateEdgeStyle: (patch: Partial<EdgeStyleOverride>) => void;
  onResetEdgeStyle: () => void;
  hiddenEdgeLabels: Set<string>;
  onToggleEdgeLabelHidden: (linkIndex: number) => void;
}

/** Right sidebar link inspector (PLAN.md step 7.3): lists every link,
 * filterable by type/node, with two-way hover highlight against the
 * canvas edges (driven by `hoveredLinkIndex`/`onHoverLink`, owned by
 * App.tsx so canvas edge hover can drive this list too). The expanded
 * row (PLAN3.md step 11.9) also edits the link's style override:
 * markers, line style, stroke width, color, and its label's individual
 * visibility. */
export function LinksPanel({
  links,
  hoveredLinkIndex,
  onHoverLink,
  onUpdateLink,
  onDeleteLink,
  selectedIndex,
  onSelectIndex,
  edgeStyles,
  onUpdateEdgeStyle,
  onResetEdgeStyle,
  hiddenEdgeLabels,
  onToggleEdgeLabelHidden,
}: Props) {
  const [typeFilter, setTypeFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');

  const nodeIds = Array.from(new Set(links.flatMap((l) => [l.from, l.to]))).sort();

  const visible = links
    .map((link, index) => ({ link, index }))
    .filter(({ link }) => !typeFilter || link.type === typeFilter)
    .filter(({ link }) => !nodeFilter || link.from === nodeFilter || link.to === nodeFilter);

  return (
    <aside
      data-testid="links-panel"
      style={{ padding: 'var(--dc-space-3)', borderLeft: '1px solid var(--dc-border)', minWidth: 260, color: 'var(--dc-text)' }}
    >
      <h3 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>Links</h3>
      <div style={{ marginBottom: 'var(--dc-space-2)', display: 'flex', gap: 'var(--dc-space-2)' }}>
        <select data-testid="links-filter-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">all types</option>
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select data-testid="links-filter-node" value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}>
          <option value="">all nodes</option>
          {nodeIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {visible.map(({ link, index }) => {
          const key = edgeLinkKey(link);
          const style = edgeStyles[key] ?? {};
          const isSelected = selectedIndex === index;
          return (
            <li
              key={index}
              data-testid={`link-item-${index}`}
              data-hovered={hoveredLinkIndex === index || undefined}
              onMouseEnter={() => onHoverLink(index)}
              onMouseLeave={() => onHoverLink(null)}
              style={{
                padding: 4,
                marginBottom: 4,
                background: hoveredLinkIndex === index ? '#eef5ff' : undefined,
                cursor: 'pointer',
              }}
              onClick={() => onSelectIndex(isSelected ? null : index)}
            >
              <div>
                {link.from} → {link.to} <em>({link.type})</em>
              </div>
              {isSelected && (
                <div onClick={(e) => e.stopPropagation()}>
                  <select
                    data-testid={`link-edit-type-${index}`}
                    value={link.type}
                    onChange={(e) => onUpdateLink(index, { type: e.target.value })}
                  >
                    {LINK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    data-testid={`link-edit-label-${index}`}
                    value={link.label ?? ''}
                    onChange={(e) => onUpdateLink(index, { label: e.target.value })}
                  />
                  <button type="button" data-testid={`link-delete-${index}`} onClick={() => onDeleteLink(index)}>
                    Delete
                  </button>

                  <div style={{ marginTop: 'var(--dc-space-2)' }}>
                    <label style={{ display: 'block', marginBottom: 'var(--dc-space-1)' }}>
                      Start marker
                      <select
                        data-testid={`link-edit-marker-start-${index}`}
                        value={style.markerStart ?? 'none'}
                        onChange={(e) => onUpdateEdgeStyle({ markerStart: e.target.value as EdgeStyleOverride['markerStart'] })}
                        style={{ display: 'block', width: '100%' }}
                      >
                        <option value="none">none</option>
                        <option value="arrow">arrow</option>
                        <option value="open-arrow">open arrow</option>
                      </select>
                    </label>
                    <label style={{ display: 'block', marginBottom: 'var(--dc-space-1)' }}>
                      End marker
                      <select
                        data-testid={`link-edit-marker-end-${index}`}
                        value={style.markerEnd ?? 'arrow'}
                        onChange={(e) => onUpdateEdgeStyle({ markerEnd: e.target.value as EdgeStyleOverride['markerEnd'] })}
                        style={{ display: 'block', width: '100%' }}
                      >
                        <option value="none">none</option>
                        <option value="arrow">arrow</option>
                        <option value="open-arrow">open arrow</option>
                      </select>
                    </label>
                    <label style={{ display: 'block', marginBottom: 'var(--dc-space-1)' }}>
                      Line style
                      <select
                        data-testid={`link-edit-line-style-${index}`}
                        value={style.lineStyle ?? 'solid'}
                        onChange={(e) => onUpdateEdgeStyle({ lineStyle: e.target.value as EdgeStyleOverride['lineStyle'] })}
                        style={{ display: 'block', width: '100%' }}
                      >
                        <option value="solid">solid</option>
                        <option value="dashed">dashed</option>
                        <option value="dotted">dotted</option>
                      </select>
                    </label>
                    <label style={{ display: 'block', marginBottom: 'var(--dc-space-1)' }}>
                      Stroke width
                      <select
                        data-testid={`link-edit-stroke-width-${index}`}
                        value={style.strokeWidth ?? 1.5}
                        onChange={(e) => onUpdateEdgeStyle({ strokeWidth: Number(e.target.value) })}
                        style={{ display: 'block', width: '100%' }}
                      >
                        {[1, 2, 3, 4].map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'block', marginBottom: 'var(--dc-space-1)' }}>
                      Color
                      <input
                        type="color"
                        data-testid={`link-edit-color-${index}`}
                        value={style.color ?? '#333333'}
                        onChange={(e) => onUpdateEdgeStyle({ color: e.target.value })}
                        style={{ display: 'block' }}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--dc-space-1)', marginBottom: 'var(--dc-space-1)' }}>
                      <input
                        type="checkbox"
                        data-testid={`link-edit-hide-label-${index}`}
                        checked={hiddenEdgeLabels.has(key)}
                        onChange={() => onToggleEdgeLabelHidden(index)}
                      />
                      Hide this label
                    </label>
                    <button
                      type="button"
                      data-testid={`link-reset-style-${index}`}
                      onClick={onResetEdgeStyle}
                      disabled={!edgeStyles[key]}
                    >
                      Reset style
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
