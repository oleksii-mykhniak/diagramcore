import { useState } from 'react';
import type { DiagramLink } from '../types';

const LINK_TYPES = ['request', 'call', 'query', 'event', 'dataflow', 'inherits', 'contains'];

interface Props {
  links: DiagramLink[];
  hoveredLinkIndex: number | null;
  onHoverLink: (index: number | null) => void;
  onUpdateLink: (index: number, patch: Partial<DiagramLink>) => void;
  onDeleteLink: (index: number) => void;
}

/** Right sidebar link inspector (PLAN.md step 7.3): lists every link,
 * filterable by type/node, with two-way hover highlight against the
 * canvas edges (driven by `hoveredLinkIndex`/`onHoverLink`, owned by
 * App.tsx so canvas edge hover can drive this list too). */
export function LinksPanel({ links, hoveredLinkIndex, onHoverLink, onUpdateLink, onDeleteLink }: Props) {
  const [typeFilter, setTypeFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const nodeIds = Array.from(new Set(links.flatMap((l) => [l.from, l.to]))).sort();

  const visible = links
    .map((link, index) => ({ link, index }))
    .filter(({ link }) => !typeFilter || link.type === typeFilter)
    .filter(({ link }) => !nodeFilter || link.from === nodeFilter || link.to === nodeFilter);

  return (
    <aside data-testid="links-panel" style={{ padding: 12, borderLeft: '1px solid #ccc', minWidth: 260 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Links</h3>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
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
        {visible.map(({ link, index }) => (
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
            onClick={() => setEditingIndex(editingIndex === index ? null : index)}
          >
            <div>
              {link.from} → {link.to} <em>({link.type})</em>
            </div>
            {editingIndex === index && (
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
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
