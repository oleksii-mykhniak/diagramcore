import type { Diagram } from './types';
import { nodeLabel } from './types';
import type { DiagramLayout, LayoutEdge, LayoutPoint } from './layout';
import type { LayoutPosition } from './layoutFile';
import { pairKey } from './flowPlayer';

export interface FrameHighlight {
  activeStep?: { from: string; to: string };
  visitedStepKeys?: Set<string>;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pointsToPath(points: LayoutPoint[], reversed: boolean): string {
  const ordered = reversed ? [...points].reverse() : points;
  return ordered.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function edgeForStep(edges: LayoutEdge[], step: { from: string; to: string }): LayoutEdge | undefined {
  const key = pairKey(step.from, step.to);
  return edges.find((e) => pairKey(e.from, e.to) === key);
}

/** Renders diagram + layout + positions to a standalone SVG string, with
 * the same visual rules as components/DiagramView (active/visited flow
 * steps, details markers) — used for PNG export, where we need a
 * self-contained SVG document rather than a live DOM node. */
export function renderDiagramSVGString(
  diagram: Diagram,
  layout: DiagramLayout,
  positions: Record<string, LayoutPosition>,
  highlight: FrameHighlight = {},
): string {
  const labelById = new Map(diagram.nodes.map((n) => [n.id, nodeLabel(n)]));
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const activeKey = highlight.activeStep ? pairKey(highlight.activeStep.from, highlight.activeStep.to) : null;

  const edgesSvg = layout.edges
    .map((e) => {
      const key = pairKey(e.from, e.to);
      const isActive = key === activeKey;
      const isVisited = !isActive && (highlight.visitedStepKeys?.has(key) ?? false);
      const stroke = isActive ? '#e04b4b' : isVisited ? '#e08a4b' : '#333';
      const width = isActive ? 3 : isVisited ? 2 : 1.5;
      const points = e.points.map((p) => `${p.x},${p.y}`).join(' ');
      return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${width}" marker-end="url(#arrow)" />`;
    })
    .join('');

  let markerSvg = '';
  if (highlight.activeStep) {
    const activeEdge = edgeForStep(layout.edges, highlight.activeStep);
    if (activeEdge) {
      const reversed = activeEdge.from !== highlight.activeStep.from;
      markerSvg = `<circle r="5" fill="#e04b4b"><animateMotion dur="1.2s" repeatCount="indefinite" path="${pointsToPath(activeEdge.points, reversed)}" /></circle>`;
    }
  }

  const nodesSvg = layout.nodes
    .map((n) => {
      const pos = positions[n.id] ?? n;
      const hasDetails = Boolean(nodeById.get(n.id)?.details);
      const label = esc(labelById.get(n.id) ?? n.id) + (hasDetails ? ' ⊞' : '');
      const inner = hasDetails
        ? `<rect x="3" y="3" width="${n.width - 6}" height="${n.height - 6}" rx="4" fill="none" stroke="#333" stroke-width="1" />`
        : '';
      return (
        `<g transform="translate(${pos.x},${pos.y})">` +
        `<rect width="${n.width}" height="${n.height}" rx="6" fill="#fff" stroke="#333" stroke-width="${hasDetails ? 3 : 1.5}" />` +
        inner +
        `<text x="${n.width / 2}" y="${n.height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-family="system-ui, sans-serif">${label}</text>` +
        `</g>`
      );
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">` +
    `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#333" /></marker></defs>` +
    edgesSvg +
    markerSvg +
    nodesSvg +
    `</svg>`
  );
}

/** Rasterizes an SVG string to a PNG Blob via an offscreen <canvas>. */
export async function svgStringToPngBlob(svgString: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('failed to rasterize SVG for PNG export'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2D context unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas.toBlob produced no PNG data');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
