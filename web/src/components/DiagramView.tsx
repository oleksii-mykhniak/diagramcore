import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Diagram, DiagramNode } from '../types';
import { nodeLabel } from '../types';
import type { DiagramLayout, LayoutEdge, LayoutPoint } from '../layout';
import type { LayoutPosition } from '../layoutFile';
import { pairKey } from '../flowPlayer';

export interface ActiveStep {
  from: string;
  to: string;
}

interface Props {
  diagram: Diagram;
  layout: DiagramLayout;
  positions: Record<string, LayoutPosition>;
  onNodeDrag?: (id: string, pos: LayoutPosition) => void;
  /** Node/edge pairs already visited by the flow player, rendered with an
   * accent stroke (but not animated). */
  visitedStepKeys?: Set<string>;
  /** The flow player's current step: rendered with the brightest accent
   * stroke plus an <animateMotion> marker traveling along the edge. */
  activeStep?: ActiveStep;
  /** Double-clicking a node with a `details` reference calls this so the
   * parent can drill down into the sub-diagram (PLAN.md step 5.5). */
  onNodeDoubleClick?: (node: DiagramNode) => void;
}

function clientToSVGPoint(svg: SVGSVGElement, clientX: number, clientY: number): LayoutPosition {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

function pointsToPath(points: LayoutPoint[], reversed: boolean): string {
  const ordered = reversed ? [...points].reverse() : points;
  return ordered.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function edgeForStep(edges: LayoutEdge[], step: ActiveStep): LayoutEdge | undefined {
  const key = pairKey(step.from, step.to);
  return edges.find((e) => pairKey(e.from, e.to) === key);
}

export function DiagramView({
  diagram,
  layout,
  positions,
  onNodeDrag,
  visitedStepKeys,
  activeStep,
  onNodeDoubleClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const labelById = new Map(diagram.nodes.map((n) => [n.id, nodeLabel(n)]));

  const handlePointerDown = (e: ReactPointerEvent<SVGGElement>, id: string) => {
    if (!onNodeDrag) return;
    const svg = svgRef.current;
    if (!svg) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const start = clientToSVGPoint(svg, e.clientX, e.clientY);
    const origin = positions[id] ?? { x: 0, y: 0 };

    const onMove = (ev: PointerEvent) => {
      const p = clientToSVGPoint(svg, ev.clientX, ev.clientY);
      onNodeDrag(id, { x: origin.x + (p.x - start.x), y: origin.y + (p.y - start.y) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const activeKey = activeStep ? pairKey(activeStep.from, activeStep.to) : null;
  const activeEdge = activeStep ? edgeForStep(layout.edges, activeStep) : undefined;
  const activeEdgeReversed = activeEdge ? activeEdge.from !== activeStep?.from : false;

  return (
    <svg
      ref={svgRef}
      data-testid="diagram-svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
    >
      <defs>
        <marker id="arrow" markerWidth={10} markerHeight={10} refX={8} refY={5} orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#333" />
        </marker>
      </defs>
      {layout.edges.map((e) => {
        const key = pairKey(e.from, e.to);
        const isActive = key === activeKey;
        const isVisited = !isActive && (visitedStepKeys?.has(key) ?? false);
        return (
          <polyline
            key={e.id}
            data-testid={`edge-${e.from}-${e.to}`}
            data-active={isActive || undefined}
            data-visited={isVisited || undefined}
            points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={isActive ? '#e04b4b' : isVisited ? '#e08a4b' : '#333'}
            strokeWidth={isActive ? 3 : isVisited ? 2 : 1.5}
            markerEnd="url(#arrow)"
          />
        );
      })}
      {activeEdge && (
        <circle r={5} fill="#e04b4b" data-testid="flow-marker">
          <animateMotion
            dur="1.2s"
            repeatCount="indefinite"
            path={pointsToPath(activeEdge.points, activeEdgeReversed)}
          />
        </circle>
      )}
      {layout.nodes.map((n) => {
        const pos = positions[n.id] ?? n;
        const hasDetails = Boolean(nodeById.get(n.id)?.details);
        return (
          <g
            key={n.id}
            data-testid={`node-${n.id}`}
            data-has-details={hasDetails || undefined}
            transform={`translate(${pos.x},${pos.y})`}
            onPointerDown={(e) => handlePointerDown(e, n.id)}
            onDoubleClick={() => {
              const node = nodeById.get(n.id);
              if (node && onNodeDoubleClick) onNodeDoubleClick(node);
            }}
            style={{ cursor: onNodeDrag ? 'grab' : undefined }}
          >
            <rect
              width={n.width}
              height={n.height}
              rx={6}
              fill="#fff"
              stroke="#333"
              strokeWidth={hasDetails ? 3 : 1.5}
            />
            {hasDetails && (
              <rect
                x={3}
                y={3}
                width={n.width - 6}
                height={n.height - 6}
                rx={4}
                fill="none"
                stroke="#333"
                strokeWidth={1}
              />
            )}
            <text x={n.width / 2} y={n.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={13}>
              {labelById.get(n.id) ?? n.id}
              {hasDetails && (
                <tspan data-testid={`details-marker-${n.id}`}> ⊞</tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
