import { inflateSync } from 'fflate';
import { stringify } from 'yaml';
import type { LayoutPosition } from './layoutFile';

export interface DrawioImportResult {
  /** `<original-basename>.dc.yaml` — always renamed, since the source was
   * never a `.dc.yaml` document. */
  fileName: string;
  yamlText: string;
  positions: Record<string, LayoutPosition>;
  /** Human-readable "imported N nodes, M links, skipped K" summary. */
  summary: string;
}

function withoutExtension(fileName: string): string {
  return fileName.replace(/\.(drawio|xml|svg)$/i, '');
}

/** draw.io's compressed `<diagram>` payload is `encodeURIComponent(xml)`,
 * raw-deflated, then base64-encoded — reverse each step. fflate's plain
 * `inflateSync` (as opposed to `unzlibSync`/`gunzipSync`) is raw DEFLATE
 * with no zlib/gzip header, matching draw.io's format. */
function decodeCompressedDiagram(base64: string): string {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const inflated = inflateSync(bytes);
  const uriEncoded = new TextDecoder().decode(inflated);
  return decodeURIComponent(uriEncoded);
}

function stripTagsAndDecodeEntities(value: string | null): string {
  if (!value) return '';
  const noTags = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const ta = document.createElement('textarea');
  ta.innerHTML = noTags;
  return ta.value;
}

function parseStyle(style: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of (style ?? '').split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      map[part] = '1';
    } else {
      map[part.slice(0, eq)] = part.slice(eq + 1);
    }
  }
  return map;
}

/** Shape → DiagramCore base type heuristic (PLAN.md step 10.10).
 * `fillColor` is intentionally ignored in v1 — see docs/deviations.md. */
function classifyShape(style: Record<string, string>): string {
  const shape = style.shape ?? '';
  if (shape.startsWith('cylinder') || shape.includes('couchdb')) return 'storage';
  if (shape === 'actor' || shape === 'umlActor') return 'actor';
  if (shape === 'cloud') return 'external';
  if (style.dashed === '1') return 'queue';
  if (style.rounded === '1') return 'service';
  return 'component';
}

/** Sanitizes a draw.io cell id/label into `[A-Za-z][A-Za-z0-9_]*`,
 * de-duplicating against ids already assigned in this import. */
function sanitizeId(seed: string, used: Set<string>): string {
  let base = seed.replace(/[^A-Za-z0-9_]/g, '');
  if (!/^[A-Za-z]/.test(base)) base = `n${base}`;
  if (!base) base = 'node';
  let candidate = base;
  let n = 1;
  while (used.has(candidate)) {
    candidate = `${base}${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function extractFromModel(modelDoc: Document, fileName: string): DrawioImportResult {
  const cells = Array.from(modelDoc.querySelectorAll('mxCell'));
  const idMap = new Map<string, string>();
  const used = new Set<string>();
  const nodes: { id: string; type: string; label: string }[] = [];
  const positions: Record<string, LayoutPosition> = {};

  for (const cell of cells) {
    if (cell.getAttribute('vertex') !== '1') continue;
    const rawId = cell.getAttribute('id') ?? '';
    const label = stripTagsAndDecodeEntities(cell.getAttribute('value'));
    const style = parseStyle(cell.getAttribute('style'));
    const type = classifyShape(style);
    const newId = sanitizeId(label || rawId, used);
    idMap.set(rawId, newId);
    const geom = cell.querySelector('mxGeometry');
    positions[newId] = {
      x: Number(geom?.getAttribute('x') ?? 0),
      y: Number(geom?.getAttribute('y') ?? 0),
    };
    nodes.push({ id: newId, type, label: label || newId });
  }

  const links: { from: string; to: string; label: string }[] = [];
  let skipped = 0;
  for (const cell of cells) {
    if (cell.getAttribute('edge') !== '1') continue;
    const source = cell.getAttribute('source');
    const target = cell.getAttribute('target');
    const from = source ? idMap.get(source) : undefined;
    const to = target ? idMap.get(target) : undefined;
    if (!from || !to) {
      skipped += 1;
      continue;
    }
    links.push({ from, to, label: stripTagsAndDecodeEntities(cell.getAttribute('value')) });
  }

  if (nodes.length === 0) {
    throw new Error('No importable shapes found in this draw.io file.');
  }

  const title = withoutExtension(fileName);
  const yamlObj = {
    diagram: { title },
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
    links: links.map((l) => ({ from: l.from, to: l.to, type: 'request', ...(l.label ? { label: l.label } : {}) })),
  };

  const nodeWord = nodes.length === 1 ? 'node' : 'nodes';
  const linkWord = links.length === 1 ? 'link' : 'links';
  const summary =
    `Imported ${nodes.length} ${nodeWord}, ${links.length} ${linkWord}` + (skipped > 0 ? `, skipped ${skipped}.` : '.');

  return { fileName: `${title}.dc.yaml`, yamlText: stringify(yamlObj), positions, summary };
}

function parseMxfileXml(xmlText: string, fileName: string): DrawioImportResult {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error("Could not parse this file as draw.io XML — it doesn't look like valid XML.");
  }
  const diagramEl = doc.querySelector('diagram');
  if (!diagramEl) {
    throw new Error("No <diagram> element found — this doesn't look like a draw.io file.");
  }
  // Uncompressed diagrams nest <mxGraphModel> as a real child *element* of
  // <diagram> — `textContent` would only concatenate its descendant text
  // nodes (mostly whitespace), not reconstruct the tags — so re-serialize
  // it. Compressed diagrams have no element children, just a base64 text
  // node.
  const modelElement = diagramEl.querySelector('mxGraphModel') ?? diagramEl.firstElementChild;
  const modelXml = modelElement
    ? new XMLSerializer().serializeToString(modelElement)
    : decodeCompressedDiagram((diagramEl.textContent ?? '').trim());
  const modelDoc = new DOMParser().parseFromString(modelXml, 'text/xml');
  if (modelDoc.querySelector('parsererror')) {
    throw new Error('Could not decode this draw.io diagram payload.');
  }
  return extractFromModel(modelDoc, fileName);
}

/** Imports a `.drawio`/`.xml` file, or a `.svg` exported by draw.io with
 * an embedded mxfile (the root `<svg>`'s `content` attribute) — a
 * generic (non-draw.io) SVG is explicitly not supported (PLAN.md step
 * 10.10; Mermaid and generic-SVG import are a conscious descope, see
 * docs/deviations.md). */
export async function importDrawio(file: File): Promise<DrawioImportResult> {
  const isSvg = /\.svg$/i.test(file.name);
  const text = await file.text();
  if (!isSvg) {
    return parseMxfileXml(text, file.name);
  }
  const svgDoc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (svgDoc.querySelector('parsererror')) {
    throw new Error("Could not parse this file as SVG — it doesn't look like valid XML.");
  }
  const content = svgDoc.documentElement.getAttribute('content');
  if (!content) {
    throw new Error('Only draw.io-exported SVG is supported (no embedded mxfile found in this SVG).');
  }
  return parseMxfileXml(content, file.name);
}
