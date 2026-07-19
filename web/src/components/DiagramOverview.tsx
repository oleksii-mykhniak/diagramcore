import { useState } from 'react';
import type { Diagram, DiagramLink } from '../types';
import { nodeLabel } from '../types';
import { edgeLinkKey } from '../edgeStyle';

const LINK_TYPES = ['request', 'call', 'query', 'event', 'dataflow', 'inherits', 'contains'];

interface Props {
  diagram: Diagram;
  hoveredLinkIndex: number | null;
  onHoverLink: (index: number | null) => void;
  onSelectNode: (id: string) => void;
  onSelectLink: (index: number) => void;
  /** Link-keys whose connector is hidden (PLAN4.md step 12.7) — marked
   * with an eye-slash badge here, since they're not on the canvas to
   * click. */
  hiddenEdges: Set<string>;
}

const rowStyle = (hovered: boolean): React.CSSProperties => ({
  padding: 4,
  marginBottom: 2,
  background: hovered ? '#eef5ff' : undefined,
  cursor: 'pointer',
});

/** Properties panel's empty-selection state (PLAN4.md step 12.6) —
 * replaces the old always-visible Links tab's list as the way to reach
 * a link without clicking its edge on the canvas: title/description of
 * the diagram, then a compact filterable node list and link list.
 * Clicking either selects it, which flips Properties over to that
 * element's own form (`PropertiesPanel`/`LinkProperties`). */
export function DiagramOverview({ diagram, hoveredLinkIndex, onHoverLink, onSelectNode, onSelectLink, hiddenEdges }: Props) {
  const [typeFilter, setTypeFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');

  const nodeIds = Array.from(new Set(diagram.links.flatMap((l) => [l.from, l.to]))).sort();
  const visibleLinks: Array<{ link: DiagramLink; index: number }> = diagram.links
    .map((link, index) => ({ link, index }))
    .filter(({ link }) => !typeFilter || link.type === typeFilter)
    .filter(({ link }) => !nodeFilter || link.from === nodeFilter || link.to === nodeFilter);

  return (
    <aside
      data-testid="diagram-overview"
      style={{ padding: 'var(--dc-space-3)', borderLeft: '1px solid var(--dc-border)', minWidth: 260, color: 'var(--dc-text)' }}
    >
      <h3 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-1)` }}>{diagram.diagram.title}</h3>
      {diagram.diagram.purpose && (
        <p style={{ fontSize: 'var(--dc-font-size-sm)', color: 'var(--dc-text-muted)', margin: `0 0 var(--dc-space-3)` }}>
          {diagram.diagram.purpose}
        </p>
      )}

      <h4 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>Nodes ({diagram.nodes.length})</h4>
      <ul style={{ listStyle: 'none', margin: `0 0 var(--dc-space-3)`, padding: 0 }}>
        {diagram.nodes.map((n) => (
          <li
            key={n.id}
            data-testid={`overview-node-${n.id}`}
            style={rowStyle(false)}
            onClick={() => onSelectNode(n.id)}
          >
            {nodeLabel(n)} <em style={{ color: 'var(--dc-text-muted)' }}>({n.type})</em>
          </li>
        ))}
      </ul>

      <h4 style={{ fontSize: 'var(--dc-font-size-base)', margin: `0 0 var(--dc-space-2)` }}>Links ({diagram.links.length})</h4>
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
        {visibleLinks.map(({ link, index }) => (
          <li
            key={index}
            data-testid={`overview-link-${index}`}
            data-hovered={hoveredLinkIndex === index || undefined}
            onMouseEnter={() => onHoverLink(index)}
            onMouseLeave={() => onHoverLink(null)}
            onClick={() => {
              // Selecting a link unmounts this whole list (Properties
              // switches to the link's own form), so the row's own
              // `onMouseLeave` never gets a chance to fire — clear the
              // hover explicitly instead of leaving it stuck "on"
              // (PLAN4.md step 12.6).
              onHoverLink(null);
              onSelectLink(index);
            }}
            style={rowStyle(hoveredLinkIndex === index)}
          >
            {link.from} → {link.to} <em style={{ color: 'var(--dc-text-muted)' }}>({link.type})</em>
            {hiddenEdges.has(edgeLinkKey(link)) && (
              <span
                data-testid={`overview-link-hidden-${index}`}
                title="Hidden connection"
                style={{ marginLeft: 'var(--dc-space-1)', color: 'var(--dc-text-muted)' }}
              >
                🙈
              </span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
