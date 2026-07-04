import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { importDrawio } from './drawioImport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'testdata', 'drawio');

function fileFrom(name: string, mime = 'text/xml'): File {
  const content = fs.readFileSync(path.join(fixturesDir, name), 'utf8');
  return new File([content], name, { type: mime });
}

describe('importDrawio', () => {
  it('parses an uncompressed .drawio file, applying all shape heuristics', async () => {
    const result = await importDrawio(fileFrom('uncompressed.drawio'));
    const doc = parseYaml(result.yamlText);
    const typeById: Record<string, string> = Object.fromEntries(doc.nodes.map((n: { id: string; type: string }) => [n.id, n.type]));

    expect(Object.values(typeById)).toContain('actor');
    expect(Object.values(typeById)).toContain('storage');
    expect(Object.values(typeById)).toContain('external');
    expect(Object.values(typeById)).toContain('queue');
    expect(Object.values(typeById)).toContain('service');
    expect(Object.values(typeById)).toContain('component');

    expect(doc.nodes).toHaveLength(6);
    // One edge points at a nonexistent node ("missingNode") and is skipped.
    expect(doc.links).toHaveLength(1);
    expect(result.summary).toContain('skipped 1');
    expect(result.summary).toContain('Imported 6 nodes, 1 link');
  });

  it('decompresses a compressed .drawio payload and parses it identically to the uncompressed form', async () => {
    const result = await importDrawio(fileFrom('compressed.drawio'));
    const doc = parseYaml(result.yamlText);
    expect(doc.nodes).toHaveLength(2);
    expect(doc.links).toHaveLength(1);
    const types = doc.nodes.map((n: { type: string }) => n.type).sort();
    expect(types).toEqual(['actor', 'service']);
  });

  it('imports a draw.io-exported SVG with an embedded mxfile', async () => {
    const result = await importDrawio(fileFrom('with-mxfile.svg', 'image/svg+xml'));
    const doc = parseYaml(result.yamlText);
    const types = doc.nodes.map((n: { type: string }) => n.type).sort();
    expect(types).toEqual(['external', 'queue']);
    expect(doc.links).toHaveLength(1);
  });

  it('rejects a generic (non-draw.io) SVG with a human-readable error', async () => {
    await expect(importDrawio(fileFrom('not-drawio.svg', 'image/svg+xml'))).rejects.toThrow(/only draw\.io-exported svg/i);
  });

  it('sanitizes ids to [A-Za-z][A-Za-z0-9_]* while preserving link connectivity', async () => {
    const result = await importDrawio(fileFrom('uncompressed.drawio'));
    const doc = parseYaml(result.yamlText);
    const ids = doc.nodes.map((n: { id: string }) => n.id);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    }
    const idSet = new Set(ids);
    for (const link of doc.links) {
      expect(idSet.has(link.from)).toBe(true);
      expect(idSet.has(link.to)).toBe(true);
    }
    // The "calls" edge (User -> Auth Service) survives sanitization.
    expect(doc.links).toEqual([expect.objectContaining({ label: 'calls' })]);
  });

  it('captures each imported node position from mxGeometry', async () => {
    const result = await importDrawio(fileFrom('uncompressed.drawio'));
    const doc = parseYaml(result.yamlText);
    const userNode = doc.nodes.find((n: { label: string }) => n.label === 'User');
    expect(result.positions[userNode.id]).toEqual({ x: 40, y: 40 });
  });
});
