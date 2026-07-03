import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';

export interface DcEdgeData extends Record<string, unknown> {
  label?: string;
  linkType: string;
  isActive: boolean;
  isVisited: boolean;
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
  const stroke = isActive ? '#e04b4b' : isVisited ? '#e08a4b' : '#333';

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
        style={{ stroke, strokeWidth: isActive ? 3 : isVisited ? 2 : 1.5 }}
      />
      {isActive && (
        <circle r={5} fill="#e04b4b" data-testid={`rf-flow-marker-${id}`}>
          <animateMotion dur="1.2s" repeatCount="indefinite" path={path} />
        </circle>
      )}
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 11,
              background: '#fff',
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
