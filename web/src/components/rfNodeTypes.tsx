import { memo } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH, NODE_WIDTH, NODE_HEIGHT } from '../layout';
import { resolveShape } from '../shapes';
import type { RenderStyle } from '../shapes';
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
  /** View → "Show descriptions" (PLAN.md step 10.11). */
  description?: string;
  showDescription?: boolean;
  /** View → "Diagram style" (PLAN.md step 10.12). */
  renderStyle?: RenderStyle;
  /** Fires once, on resize release (mirrors `onNodeDragStop`'s
   * single-commit-per-gesture pattern from step 11.1). */
  onResizeEnd?: (size: { width: number; height: number }) => void;
}

interface ShellProps {
  id: string;
  data: DcNodeData;
  nodeType: string;
  shapeName: string;
  className: string;
  /** Effective size (PLAN3.md step 11.4) — the manually-resized size if
   * any, else the base default; a top-level `Node.width/height` field
   * (not `data`), since that's what React Flow's own `NodeResizer`
   * writes to live during a drag (see `FlowCanvas.tsx`). */
  width: number;
  height: number;
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
function NodeShell({ id, data, nodeType, shapeName, className, width, height }: ShellProps) {
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
  const svgInner = shape.renderSvgInner(width, height, { fill, stroke, strokeWidth, renderStyle: data.renderStyle });
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
      style={{ position: 'relative', width, height }}
    >
      <NodeResizer
        isVisible={data.isSelected}
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        onResizeEnd={(_, params) => data.onResizeEnd?.({ width: params.width, height: params.height })}
      />
      <svg
        width={width}
        height={height}
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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 var(--dc-space-2)',
          fontSize: 'var(--dc-font-size-base)',
          color: 'var(--dc-text)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--dc-space-1)' }}>
          {IconComponent && (
            <span data-testid={`rf-node-icon-${id}`} style={{ display: 'inline-flex' }}>
              <IconComponent size={14} />
            </span>
          )}
          {data.label}
          {data.hasDetails && <span data-testid={`rf-details-marker-${id}`}> ⊞</span>}
        </span>
        {data.showDescription && data.description && (
          <span
            data-testid={`rf-node-description-${id}`}
            style={{
              fontSize: 'var(--dc-font-size-sm)',
              color: 'var(--dc-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {data.description}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const ActorNode = memo(function ActorNode({ id, data, width, height }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="actor"
      shapeName="actor"
      className="rf-node--actor"
      width={width ?? NODE_WIDTH}
      height={height ?? NODE_HEIGHT}
    />
  );
});

export const ServiceNode = memo(function ServiceNode({ id, data, width, height }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="service"
      shapeName="service"
      className="rf-node--service"
      width={width ?? NODE_WIDTH}
      height={height ?? NODE_HEIGHT}
    />
  );
});

export const StorageNode = memo(function StorageNode({ id, data, width, height }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="storage"
      shapeName="storage"
      className="rf-node--storage"
      width={width ?? NODE_WIDTH}
      height={height ?? NODE_HEIGHT}
    />
  );
});

export const QueueNode = memo(function QueueNode({ id, data, width, height }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="queue"
      shapeName="queue"
      className="rf-node--queue"
      width={width ?? NODE_WIDTH}
      height={height ?? NODE_HEIGHT}
    />
  );
});

export const ExternalNode = memo(function ExternalNode({ id, data, width, height }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="external"
      shapeName="external"
      className="rf-node--external"
      width={width ?? NODE_WIDTH}
      height={height ?? NODE_HEIGHT}
    />
  );
});

export const ComponentNode = memo(function ComponentNode({ id, data, width, height }: NodeProps) {
  return (
    <NodeShell
      id={id}
      data={data as DcNodeData}
      nodeType="component"
      shapeName="component"
      className="rf-node--component"
      width={width ?? NODE_WIDTH}
      height={height ?? NODE_HEIGHT}
    />
  );
});

/** Renders any custom (non-base-six) type — PLAN.md step 10.8. The real
 * dc type name and resolved shape/color/icon are precomputed by
 * `FlowCanvas` (which has the diagram's `custom_types`) and threaded
 * through `data`. */
export const CustomNode = memo(function CustomNode({ id, data, width, height }: NodeProps) {
  const d = data as DcNodeData;
  const type = d.customType ?? 'component';
  return (
    <NodeShell
      id={id}
      data={d}
      nodeType={type}
      shapeName={d.shape ?? 'component'}
      className="rf-node--custom"
      width={width ?? NODE_WIDTH}
      height={height ?? NODE_HEIGHT}
    />
  );
});

export interface NoteNodeData extends Record<string, unknown> {
  text: string;
}

/** Free-text annotation (PLAN.md step 10.11) — borderless, draggable,
 * no handles (notes don't participate in links). Double-click to edit
 * (see `EditorWorkspace`'s `onNoteDoubleClick`). */
export const NoteNode = memo(function NoteNode({ id, data }: NodeProps) {
  const d = data as NoteNodeData;
  return (
    <div
      data-testid={`rf-note-${id}`}
      className="rf-note"
      style={{
        padding: 'var(--dc-space-1) var(--dc-space-2)',
        fontSize: 'var(--dc-font-size-base)',
        color: 'var(--dc-text)',
        background: 'transparent',
        border: 'none',
        maxWidth: 220,
        cursor: 'grab',
        whiteSpace: 'pre-wrap',
      }}
    >
      {d.text}
    </div>
  );
});

export const nodeTypes = {
  actor: ActorNode,
  service: ServiceNode,
  storage: StorageNode,
  queue: QueueNode,
  external: ExternalNode,
  component: ComponentNode,
  custom: CustomNode,
  note: NoteNode,
};

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];

/** Any node type not in the base six (custom_types) renders via the
 * generic `CustomNode` instead of silently collapsing into `component`
 * (PLAN.md step 10.8 — the previous fallback lived here). */
export function resolveNodeType(type: string): keyof typeof nodeTypes {
  return (BASE_TYPES.includes(type) ? type : 'custom') as keyof typeof nodeTypes;
}
