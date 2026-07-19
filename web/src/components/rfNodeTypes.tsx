import { memo } from 'react';
import type { CSSProperties } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { MIN_NODE_HEIGHT, MIN_NODE_WIDTH, NODE_WIDTH, NODE_HEIGHT } from '../layout';
import { renderContainerSvgInner, resolveShape } from '../shapes';
import type { LineStyle, RenderStyle, TextStyleOverride } from '../shapes';
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
  /** Resolved fill (instance override → custom_type → theme default —
   * PLAN3.md step 11.8's `resolveNodeStyle`). */
  color?: string;
  icon?: string;
  /** Resolved stroke/strokeWidth/lineStyle/rounded (PLAN3.md step
   * 11.8) — same priority order as `color` above. Active/visited/
   * selected highlight colors still take precedence over `strokeColor`
   * when applicable (see `NodeShell`). */
  strokeColor?: string;
  strokeWidthOverride?: number;
  lineStyle?: LineStyle;
  rounded?: boolean;
  /** View → "Show descriptions" (PLAN.md step 10.11). */
  description?: string;
  showDescription?: boolean;
  /** View → "Diagram style" (PLAN.md step 10.12). */
  renderStyle?: RenderStyle;
  /** Instance text override (PLAN4.md step 12.5) — resolved by
   * `resolveNodeStyle` the same way canvas/SVG-export share every other
   * style field, so the two never render text differently. */
  text?: TextStyleOverride;
  /** "Hide label" (PLAN4.md step 12.7) — the shape still renders, only
   * the text label is suppressed. Doesn't affect the inline editor
   * (`isEditing` still shows the input with the real label). */
  labelHidden?: boolean;
  /** Fires once, on resize release (mirrors `onNodeDragStop`'s
   * single-commit-per-gesture pattern from step 11.1). */
  onResizeEnd?: (size: { width: number; height: number; x: number; y: number }) => void;
  /** Inline label editing (PLAN4.md step 12.4) — `FlowCanvas` owns which
   * node is being edited and patches these three fields directly onto
   * the live node state (see its `editingNodeId` effect). */
  isEditing?: boolean;
  onEditCommit?: (label: string) => void;
  onEditCancel?: () => void;
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
        : (data.strokeColor ?? 'var(--dc-node-border)');
  const fill = data.color ?? (nodeType === 'external' ? 'var(--dc-node-external-fill)' : 'var(--dc-node-fill)');
  const strokeWidth = data.hasDetails ? 3 : (data.strokeWidthOverride ?? 1.5);
  const svgInner = shape.renderSvgInner(width, height, {
    fill,
    stroke,
    strokeWidth,
    renderStyle: data.renderStyle,
    lineStyle: data.lineStyle,
    rounded: data.rounded,
  });
  const IconComponent = data.icon ? CUSTOM_TYPE_ICONS[data.icon] : null;
  // Instance text override (PLAN4.md step 12.5) — `align` moves the
  // flex/text alignment; the rest are plain CSS passthroughs. Long text
  // still wraps naturally at any font-size since this stays a flexbox
  // label, not `white-space: nowrap` (unchanged from before this step).
  const textAlign = data.text?.align ?? 'center';
  const flexAlign = textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';
  const labelTextStyle: CSSProperties = {
    fontSize: data.text?.fontSize ? `${data.text.fontSize}px` : 'var(--dc-font-size-base)',
    fontWeight: data.text?.bold ? 700 : 400,
    fontStyle: data.text?.italic ? 'italic' : 'normal',
    color: data.text?.color ?? 'var(--dc-text)',
  };

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
        onResizeEnd={(_, params) =>
          data.onResizeEnd?.({ width: params.width, height: params.height, x: params.x, y: params.y })
        }
      />
      <svg
        width={width}
        height={height}
        // Same reasoning as the label div below: this comes after
        // <NodeResizer> in DOM order, so at z-index:auto it paints (and
        // hit-tests) on top of the resize handles wherever the shape's
        // path actually has fill/stroke near the node's edges/corners
        // (e.g. the storage cylinder's arc) — pointer-events:none hands
        // those pixels back to the resize handles/plain node div
        // underneath without affecting node click/drag/select, which
        // React Flow attaches to the ancestor `.react-flow__node`, not
        // to this element specifically.
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svgInner }}
      />
      <Handle type="target" position={Position.Top} />
      <div
        // This label layer sits in DOM order right after <NodeResizer>,
        // so with default stacking (later sibling wins at z-index:auto)
        // it would paint on top of the resize handles — its box covers
        // the full node, overlapping the inner half of every corner/edge
        // handle (they're centered exactly on the node boundary). Since
        // it's a plain div, it captures pointer events everywhere in its
        // box by default, even where there's no visible content — unlike
        // the SVG shape below, whose unpainted areas pass clicks through.
        // That made resize-handle clicks land on this label layer instead
        // of the handle depending on sub-pixel rounding (zoom-dependent),
        // silently turning an attempted resize into a plain node drag.
        // No content here is interactive, so it's safe to opt it out of
        // hit-testing entirely.
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: flexAlign,
          justifyContent: 'center',
          textAlign,
          padding: '0 var(--dc-space-2)',
          fontSize: 'var(--dc-font-size-base)',
          color: 'var(--dc-text)',
          pointerEvents: 'none',
        }}
      >
        {data.isEditing ? (
          <input
            data-testid={`rf-node-label-input-${id}`}
            autoFocus
            defaultValue={data.label}
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => data.onEditCommit?.(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                data.onEditCancel?.();
              }
            }}
            style={{
              ...labelTextStyle,
              width: '90%',
              font: 'inherit',
              textAlign,
              background: 'var(--dc-surface)',
              border: '1px solid var(--dc-accent)',
              borderRadius: 2,
              pointerEvents: 'auto',
            }}
          />
        ) : data.labelHidden ? (
          // "Hide label" (PLAN4.md step 12.7) — shape only, no text at
          // all; still gets the testid so a caller can assert absence
          // of the visible span without the whole node disappearing.
          <span data-testid={`rf-node-label-${id}`} data-hidden="true" style={{ display: 'none' }} />
        ) : (
          <span
            data-testid={`rf-node-label-${id}`}
            style={{ ...labelTextStyle, display: 'inline-flex', alignItems: 'center', gap: 'var(--dc-space-1)' }}
          >
            {IconComponent && (
              <span data-testid={`rf-node-icon-${id}`} style={{ display: 'inline-flex' }}>
                <IconComponent size={14} />
              </span>
            )}
            {data.label}
            {data.hasDetails && <span data-testid={`rf-details-marker-${id}`}> ⊞</span>}
          </span>
        )}
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

export interface ContainerNodeData extends Record<string, unknown> {
  label: string;
  isSelected?: boolean;
  /** Dynamic resize floor (PLAN3.md step 11.6) — the container's
   * children's bounding box, computed by `FlowCanvas` from their live
   * positions/sizes, so a container can never be resized smaller than
   * what it currently holds. */
  minWidth?: number;
  minHeight?: number;
  onResizeEnd?: (size: { width: number; height: number; x: number; y: number }) => void;
}

/** A node with `parent:` children (PLAN3.md step 11.6) draws as a
 * container instead of its own dc-type shape: a dashed, translucent box
 * with the label in a top-left header, sized to enclose its children.
 * Resizable (down to `minWidth`/`minHeight`) only while selected, same as
 * every other node type. Uses the exact same `renderContainerSvgInner`
 * SVG export draws, so canvas and export never disagree on how a
 * container looks. */
export const ContainerNode = memo(function ContainerNode({ id, data, width, height }: NodeProps) {
  const d = data as ContainerNodeData;
  const w = width ?? NODE_WIDTH * 2;
  const h = height ?? NODE_HEIGHT * 2;
  const stroke = d.isSelected ? 'var(--dc-accent)' : 'var(--dc-node-border)';
  const svgInner = renderContainerSvgInner(w, h, d.label, { stroke });
  return (
    <div
      data-testid={`rf-node-${id}`}
      data-node-type="container"
      data-selected={d.isSelected || undefined}
      className="rf-node rf-node--container"
      style={{ position: 'relative', width: w, height: h }}
    >
      <NodeResizer
        isVisible={d.isSelected}
        minWidth={d.minWidth ?? MIN_NODE_WIDTH}
        minHeight={d.minHeight ?? MIN_NODE_HEIGHT}
        onResizeEnd={(_, params) =>
          d.onResizeEnd?.({ width: params.width, height: params.height, x: params.x, y: params.y })
        }
      />
      <svg
        width={w}
        height={h}
        // Same fix as NodeShell's leaf-node SVG: this paints after
        // <NodeResizer> in DOM order and would otherwise hit-test on top
        // of the resize handles wherever the container's border/fill
        // touches an edge/corner. The container's own click/select still
        // works — it bubbles from the underlying `.rf-node` div through
        // to the `.react-flow__node` ancestor either way.
        style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svgInner }}
      />
    </div>
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
  container: ContainerNode,
  note: NoteNode,
};

const BASE_TYPES = ['actor', 'service', 'storage', 'queue', 'external', 'component'];

/** Any node type not in the base six (custom_types) renders via the
 * generic `CustomNode` instead of silently collapsing into `component`
 * (PLAN.md step 10.8 — the previous fallback lived here). */
export function resolveNodeType(type: string): keyof typeof nodeTypes {
  return (BASE_TYPES.includes(type) ? type : 'custom') as keyof typeof nodeTypes;
}
