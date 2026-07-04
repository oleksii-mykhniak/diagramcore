import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { NODE_WIDTH, NODE_HEIGHT } from '../layout';
import { resolveShape } from '../shapes';

export interface DcNodeData extends Record<string, unknown> {
  label: string;
  hasDetails: boolean;
  isActive: boolean;
  isVisited: boolean;
  isSelected?: boolean;
}

interface ShellProps {
  id: string;
  data: DcNodeData;
  nodeType: string;
  className: string;
}

/** Shared shell for all custom node types (PLAN.md step 6.1, geometry
 * unified in step 10.6): the outline is drawn by the same
 * `renderSvgInner` that `svgExport.ts` uses for the same node type, sized
 * to the same `NODE_WIDTH`/`NODE_HEIGHT` the auto-layout engine reserves
 * — so canvas and export can never draw a type differently. Label,
 * handles and the details marker sit on top as an absolutely-positioned
 * overlay. */
function NodeShell({ id, data, nodeType, className }: ShellProps) {
  const shape = resolveShape(nodeType);
  const stroke = data.isActive
    ? 'var(--dc-flow-active)'
    : data.isVisited
      ? 'var(--dc-flow-visited)'
      : data.isSelected
        ? 'var(--dc-accent)'
        : 'var(--dc-node-border)';
  const fill = nodeType === 'external' ? 'var(--dc-node-external-fill)' : 'var(--dc-node-fill)';
  const strokeWidth = data.hasDetails ? 3 : 1.5;
  const svgInner = shape.renderSvgInner(NODE_WIDTH, NODE_HEIGHT, { fill, stroke, strokeWidth });

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
          textAlign: 'center',
          padding: '0 var(--dc-space-2)',
          fontSize: 'var(--dc-font-size-base)',
          color: 'var(--dc-text)',
        }}
      >
        {data.label}
        {data.hasDetails && <span data-testid={`rf-details-marker-${id}`}> ⊞</span>}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function ActorNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="actor" className="rf-node--actor" />;
}

export function ServiceNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="service" className="rf-node--service" />;
}

export function StorageNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="storage" className="rf-node--storage" />;
}

export function QueueNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="queue" className="rf-node--queue" />;
}

export function ExternalNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="external" className="rf-node--external" />;
}

export function ComponentNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="component" className="rf-node--component" />;
}

export const nodeTypes = {
  actor: ActorNode,
  service: ServiceNode,
  storage: StorageNode,
  queue: QueueNode,
  external: ExternalNode,
  component: ComponentNode,
};

/** Any node type not in the base six (custom_types) falls back to the
 * generic component shape. */
export function resolveNodeType(type: string): keyof typeof nodeTypes {
  return type in nodeTypes ? (type as keyof typeof nodeTypes) : 'component';
}
