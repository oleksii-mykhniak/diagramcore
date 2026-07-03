import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export interface DcNodeData extends Record<string, unknown> {
  label: string;
  hasDetails: boolean;
  isActive: boolean;
  isVisited: boolean;
}

interface ShellProps {
  id: string;
  data: DcNodeData;
  nodeType: string;
  className: string;
  style?: React.CSSProperties;
}

/** Shared shell for all custom node types: handles, label, details marker,
 * and flow-highlight state — only the outer shape/style differs per type
 * (PLAN.md step 6.1). */
function NodeShell({ id, data, nodeType, className, style }: ShellProps) {
  return (
    <div
      data-testid={`rf-node-${id}`}
      data-node-type={nodeType}
      data-has-details={data.hasDetails || undefined}
      data-active={data.isActive || undefined}
      data-visited={data.isVisited || undefined}
      className={`rf-node ${className}`}
      style={{
        padding: '8px 14px',
        border: `${data.hasDetails ? 3 : 1.5}px solid ${data.isActive ? '#e04b4b' : data.isVisited ? '#e08a4b' : '#333'}`,
        background: '#fff',
        fontSize: 13,
        textAlign: 'center',
        minWidth: 120,
        ...style,
      }}
    >
      <Handle type="target" position={Position.Top} />
      {data.label}
      {data.hasDetails && <span data-testid={`rf-details-marker-${id}`}> ⊞</span>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function ActorNode({ id, data }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="actor"
      className="rf-node--actor"
      style={{ borderRadius: '50%', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    />
  );
}

export function ServiceNode({ id, data }: NodeProps) {
  return <NodeShell id={id} data={data as DcNodeData} nodeType="service" className="rf-node--service" style={{ borderRadius: 6 }} />;
}

export function StorageNode({ id, data }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="storage"
      className="rf-node--storage"
      style={{ borderRadius: '0 0 12px 12px', borderTop: '3px double #333' }}
    />
  );
}

export function QueueNode({ id, data }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="queue"
      className="rf-node--queue"
      style={{ borderRadius: 0, borderStyle: 'dashed' }}
    />
  );
}

export function ExternalNode({ id, data }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="external"
      className="rf-node--external"
      style={{ borderRadius: 6, borderStyle: 'dotted', background: '#f5f5f5' }}
    />
  );
}

export function ComponentNode({ id, data }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="component"
      className="rf-node--component"
      style={{ borderRadius: 2 }}
    />
  );
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
