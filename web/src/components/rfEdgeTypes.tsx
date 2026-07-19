import { memo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { sketchEdgeD } from '../sketch';
import type { LineStyle, RenderStyle, TextStyleOverride } from '../shapes';
import { resolveEdgeColor } from '../edgeStyle';

export interface DcEdgeData extends Record<string, unknown> {
  label?: string;
  linkType: string;
  isActive: boolean;
  isVisited: boolean;
  isHovered?: boolean;
  /** View → "Diagram style" (PLAN.md step 10.12). */
  renderStyle?: RenderStyle;
  /** Resolved stroke color/width/dash override (PLAN3.md step 11.9) —
   * only consulted when the edge is none of active/visited/hovered,
   * same precedence as node style overrides vs. selection highlight. */
  color?: string;
  strokeWidthOverride?: number;
  lineStyle?: LineStyle;
  /** Instance text override (PLAN4.md step 12.5) — `align` is ignored
   * for an edge label (see `TextStyleOverride`). */
  text?: TextStyleOverride;
  /** Label drag offset relative to the edge's own midpoint (PLAN3.md
   * step 11.9). */
  labelOffset?: { x: number; y: number };
  /** View → "Connection labels" show/hide-all AND the per-edge hide
   * toggle, already resolved by the caller (PLAN3.md step 11.9). */
  showLabel?: boolean;
  /** Committed once per label-drag gesture, on release. */
  onLabelDragStop?: (offset: { x: number; y: number }) => void;
  /** Inline edit commit (PLAN4.md step 12.4) — fires on Enter/blur of the
   * dblclick-opened input; empty text removes the link's `label`. */
  onLabelCommit?: (label: string) => void;
  /** Core view (PLAN4.md step 12.8) rendering an otherwise-hidden
   * connector/label anyway, translucent with a dashed line and a badge —
   * still fully interactive (clickable to select and un-hide). */
  isGhost?: boolean;
}

const DASH_ARRAY: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: '6,4',
  dotted: '2,3',
};

export const DcEdge = memo(function DcEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerStart,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as DcEdgeData | undefined;
  const { getZoom } = useReactFlow();
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  // Inline label edit (PLAN4.md step 12.4) — replaces the old
  // `window.prompt`-based flow; dblclick opens an input right where the
  // label already sits, Enter/blur commits, Escape cancels.
  const [isEditingLabel, setIsEditingLabel] = useState(false);

  const [smoothPath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const path = edgeData?.renderStyle === 'sketch' ? sketchEdgeD(smoothPath) : smoothPath;
  const isActive = edgeData?.isActive ?? false;
  const isVisited = edgeData?.isVisited ?? false;
  const isHovered = edgeData?.isHovered ?? false;
  const stroke = resolveEdgeColor({ isActive, isVisited, isHovered, color: edgeData?.color });
  const strokeWidth = isActive ? 3 : isVisited || isHovered ? 2.5 : (edgeData?.strokeWidthOverride ?? 1.5);
  const isGhost = edgeData?.isGhost ?? false;
  // Core view (PLAN4.md step 12.8) — a hidden connector still draws, but
  // faded and dashed to read as "not really there" while staying
  // clickable to select/un-hide.
  const dashArray = isGhost ? '4,4' : edgeData?.lineStyle ? DASH_ARRAY[edgeData.lineStyle] : undefined;

  const baseOffset = edgeData?.labelOffset ?? { x: 0, y: 0 };
  const effectiveOffset = dragOffset ?? baseOffset;
  const labelTextStyle: CSSProperties = {
    fontSize: edgeData?.text?.fontSize ? `${edgeData.text.fontSize}px` : 'var(--dc-font-size-sm)',
    fontWeight: edgeData?.text?.bold ? 700 : 400,
    fontStyle: edgeData?.text?.italic ? 'italic' : 'normal',
    color: edgeData?.text?.color ?? 'var(--dc-text)',
    opacity: isGhost ? 0.5 : 1,
  };

  const handleLabelPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDragOffset(baseOffset);
  };
  const handleLabelPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const zoom = getZoom() || 1;
    const dx = (e.clientX - dragStart.current.x) / zoom;
    const dy = (e.clientY - dragStart.current.y) / zoom;
    setDragOffset({ x: baseOffset.x + dx, y: baseOffset.y + dy });
  };
  const handleLabelPointerUp = () => {
    if (!dragStart.current) return;
    dragStart.current = null;
    if (dragOffset) edgeData?.onLabelDragStop?.(dragOffset);
    setDragOffset(null);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        data-testid={`rf-edge-${id}`}
        data-link-type={edgeData?.linkType}
        data-active={isActive || undefined}
        data-visited={isVisited || undefined}
        data-hovered={isHovered || undefined}
        data-ghost={isGhost || undefined}
        style={{
          stroke,
          strokeWidth,
          ...(dashArray ? { strokeDasharray: dashArray } : {}),
          ...(isGhost ? { opacity: 0.4 } : {}),
        }}
      />
      {isActive && (
        <circle r={5} fill="var(--dc-flow-active)" data-testid={`rf-flow-marker-${id}`}>
          <animateMotion dur="1.2s" repeatCount="indefinite" path={path} />
        </circle>
      )}
      {edgeData?.label && edgeData.showLabel !== false && (
        <EdgeLabelRenderer>
          {isEditingLabel ? (
            <input
              data-testid={`rf-edge-label-input-${id}`}
              autoFocus
              defaultValue={edgeData.label}
              onFocus={(e) => e.currentTarget.select()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                setIsEditingLabel(false);
                edgeData.onLabelCommit?.(e.currentTarget.value.trim());
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  setIsEditingLabel(false);
                  edgeData.onLabelCommit?.(e.currentTarget.value.trim());
                } else if (e.key === 'Escape') {
                  setIsEditingLabel(false);
                }
              }}
              style={{
                ...labelTextStyle,
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX + effectiveOffset.x}px,${labelY + effectiveOffset.y}px)`,
                font: 'inherit',
                background: 'var(--dc-surface)',
                border: '1px solid var(--dc-accent)',
                borderRadius: 2,
                padding: '0 2px',
                width: `${Math.max(4, edgeData.label.length)}ch`,
                pointerEvents: 'auto',
              }}
            />
          ) : (
            <div
              data-testid={`rf-edge-label-${id}`}
              onPointerDown={handleLabelPointerDown}
              onPointerMove={handleLabelPointerMove}
              onPointerUp={handleLabelPointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingLabel(true);
              }}
              style={{
                ...labelTextStyle,
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX + effectiveOffset.x}px,${labelY + effectiveOffset.y}px)`,
                background: 'var(--dc-surface)',
                padding: '0 2px',
                cursor: 'grab',
                pointerEvents: 'auto',
              }}
            >
              {edgeData.label}
              {isGhost && (
                <span data-testid={`rf-edge-ghost-badge-${id}`} title="Hidden (Core view)">
                  {' '}
                  👁
                </span>
              )}
            </div>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes = { 'dc-edge': DcEdge };
