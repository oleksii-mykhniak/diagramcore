import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export interface DcEdgeData extends Record<string, unknown> {
  label?: string;
  linkType: string;
  isActive: boolean;
  isVisited: boolean;
  isHovered?: boolean;
}

export function DcEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as DcEdgeData | undefined;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const isActive = edgeData?.isActive ?? false;
  const isVisited = edgeData?.isVisited ?? false;
  const isHovered = edgeData?.isHovered ?? false;
  const stroke = isActive
    ? 'var(--dc-flow-active)'
    : isVisited
      ? 'var(--dc-flow-visited)'
      : isHovered
        ? 'var(--dc-accent)'
        : 'var(--dc-node-border)';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        data-testid={`rf-edge-${id}`}
        data-link-type={edgeData?.linkType}
        data-active={isActive || undefined}
        data-visited={isVisited || undefined}
        data-hovered={isHovered || undefined}
        style={{ stroke, strokeWidth: isActive ? 3 : isVisited || isHovered ? 2.5 : 1.5 }}
      />
      {isActive && (
        <circle r={5} fill="var(--dc-flow-active)" data-testid={`rf-flow-marker-${id}`}>
          <animateMotion dur="1.2s" repeatCount="indefinite" path={path} />
        </circle>
      )}
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 'var(--dc-font-size-sm)',
              background: 'var(--dc-surface)',
              color: 'var(--dc-text)',
              padding: '0 2px',
              pointerEvents: 'none',
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { 'dc-edge': DcEdge };
