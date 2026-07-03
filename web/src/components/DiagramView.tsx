import type { Diagram } from '../types';
import { nodeLabel } from '../types';
import type { DiagramLayout } from '../layout';

interface Props {
  diagram: Diagram;
  layout: DiagramLayout;
}

export function DiagramView({ diagram, layout }: Props) {
  const labelById = new Map(diagram.nodes.map((n) => [n.id, nodeLabel(n)]));

  return (
    <svg
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
      {layout.edges.map((e) => (
        <polyline
          key={e.id}
          data-testid={`edge-${e.from}-${e.to}`}
          points={e.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#333"
          strokeWidth={1.5}
          markerEnd="url(#arrow)"
        />
      ))}
      {layout.nodes.map((n) => (
        <g key={n.id} data-testid={`node-${n.id}`} transform={`translate(${n.x},${n.y})`}>
          <rect width={n.width} height={n.height} rx={6} fill="#fff" stroke="#333" strokeWidth={1.5} />
          <text x={n.width / 2} y={n.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={13}>
            {labelById.get(n.id) ?? n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}
