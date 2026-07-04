import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { NODE_WIDTH, NODE_HEIGHT } from '../layout';
import { resolveShape } from '../shapes';
import { CUSTOM_TYPE_ICONS } from '../customTypeIcons';

export interface DcNodeData extends Record<string, unknown> {
  label: string;
  hasDetails: boolean;
  isActive: boolean;
  isVisited: boolean;
  isSelected?: boolean;
  /** Only set for custom (non-base-six) types — PLAN.md step 10.8. */
  customType?: string;
  shape?: string;
  color?: string;
  icon?: string;
}

interface ShellProps {
  id: string;
  data: DcNodeData;
  nodeType: string;
  shapeName: string;
  className: string;
}

/** Shared shell for all node types (PLAN.md step 6.1, geometry unified in
 * step 10.6, custom-type color/icon added in step 10.8): the outline is
 * drawn by the same `renderSvgInner` that `svgExport.ts` uses for the
 * same shape, sized to the same `NODE_WIDTH`/`NODE_HEIGHT` the
 * auto-layout engine reserves — so canvas and export can never draw a
 * type differently. `nodeType` is the semantic dc type (shown in
 * `data-node-type`/className); `shapeName` is the shape-registry key to
 * draw (equal to `nodeType` for the base six, but can differ for a
 * custom type with a `shape:` override). Label, handles, the details
 * marker and an optional icon sit on top as an absolutely-positioned
 * overlay. */
function NodeShell({ id, data, nodeType, shapeName, className }: ShellProps) {
  const shape = resolveShape(shapeName);
  const stroke = data.isActive
    ? 'var(--dc-flow-active)'
    : data.isVisited
      ? 'var(--dc-flow-visited)'
      : data.isSelected
        ? 'var(--dc-accent)'
        : 'var(--dc-node-border)';
  const fill = data.color ?? (nodeType === 'external' ? 'var(--dc-node-external-fill)' : 'var(--dc-node-fill)');
  const strokeWidth = data.hasDetails ? 3 : 1.5;
  const svgInner = shape.renderSvgInner(NODE_WIDTH, NODE_HEIGHT, { fill, stroke, strokeWidth });
  const IconComponent = data.icon ? CUSTOM_TYPE_ICONS[data.icon] : null;

  return (
    <div
      data-testid={`rf-node-${id}`}
      data-node-type={nodeType}
      data-has-details={data.hasDetails || undefined}
      data-active={data.isActive || undefined}
      data-visited={data.isVisited || undefined}
      data-selected={data.isSelected || undefined}
      className={`rf-node ${className}`}
      style={{ position: 'relative', width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <svg
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svgInner }}
      />
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--dc-space-1)',
          textAlign: 'center',
          padding: '0 var(--dc-space-2)',
          fontSize: 'var(--dc-font-size-base)',
          color: 'var(--dc-text)',
        }}
      >
        {IconComponent && (
          <span data-testid={`rf-node-icon-${id}`} style={{ display: 'inline-flex' }}>
            <IconComponent size={14} />
          </span>
        )}
        {data.label}
        {data.hasDetails && <span data-testid={`rf-details-marker-${id}`}> ⊞</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function ActorNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="actor" shapeName="actor" className="rf-node--actor" />;
}

export function ServiceNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="service" shapeName="service" className="rf-node--service" />;
}

export function StorageNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="storage" shapeName="storage" className="rf-node--storage" />;
}

export function QueueNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="queue" shapeName="queue" className="rf-node--queue" />;
}

export function ExternalNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="external" shapeName="external" className="rf-node--external" />;
}

export function ComponentNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="component" shapeName="component" className="rf-node--component" />;
}

/** Renders any custom (non-base-six) type — PLAN.md step 10.8. The real
 * dc type name and resolved shape/color/icon are precomputed by
 * `FlowCanvas` (which has the diagram's `custom_types`) and threaded
 * through `data`. */
export function CustomNode({ id, data }: NodeProps) {
  const d = data as DcNodeData;
  const type = d.customType ?? 'component';
  return <NodeShell id={id} data={d} nodeType={type} shapeName={d.shape ?? 'component'} className="rf-node--custom" />;
}

export const nodeTypes = {
  actor: ActorNode,
  service: ServiceNode,
  storage: StorageNode,
  queue: QueueNode,
  external: ExternalNode,
  component: ComponentNode,
  custom: CustomNode,
};

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];

/** Any node type not in the base six (custom_types) renders via the
 * generic `CustomNode` instead of silently collapsing into `component`
 * (PLAN.md step 10.8 — the previous fallback lived here). */
export function resolveNodeType(type: string): keyof typeof nodeTypes {
  return (BASE_TYPES.includes(type) ? type : 'custom') as keyof typeof nodeTypes;
}
