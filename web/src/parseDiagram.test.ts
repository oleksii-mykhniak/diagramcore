import { describe, expect, it } from 'vitest';
import { parseDiagram } from './parseDiagram';

describe('parseDiagram', () => {
  it('parses a minimal valid diagram', () => {
    const yamlText = `
diagram:
  title: "Example"
nodes:
  - id: User
    type: actor
  - id: Gateway
    type: service
links:
  - from: User
    to: Gateway
    type: request
`;
    const d = parseDiagram(yamlText);
    expect(d.diagram.title).toBe('Example');
    expect(d.nodes).toHaveLength(2);
    expect(d.links).toHaveLength(1);
  });

  it('defaults links to an empty array when omitted', () => {
    const yamlText = `
diagram:
  title: "No links"
nodes:
  - id: A
    type: actor
`;
    const d = parseDiagram(yamlText);
    expect(d.links).toEqual([]);
  });

  it('throws on non-mapping YAML', () => {
    expect(() => parseDiagram('- just\n- a\n- list\n')).toThrow();
  });

  it('throws when the nodes section is missing', () => {
    expect(() => parseDiagram('diagram:\n  title: "No nodes"\n')).toThrow();
  });
});
