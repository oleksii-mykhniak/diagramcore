import { describe, expect, it } from 'vitest';
import { findNodeDependents } from './dependents';
import { parseDiagram } from './parseDiagram';
import fs from 'node:fs';
import path from 'node:path';

const authSystemYAML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml'),
  'utf8',
);

describe('findNodeDependents', () => {
  it('finds links and flow steps referencing a node', () => {
    const diagram = parseDiagram(authSystemYAML);
    const deps = findNodeDependents(diagram, 'AuthService');
    expect(deps.links.length).toBeGreaterThan(0);
    expect(deps.flowSteps.length).toBeGreaterThan(0);
  });

  it('returns empty dependents for a node with no links or flow steps', () => {
    const diagram = parseDiagram(authSystemYAML);
    diagram.nodes.push({ id: 'Orphan', type: 'component' });
    const deps = findNodeDependents(diagram, 'Orphan');
    expect(deps.links).toHaveLength(0);
    expect(deps.flowSteps).toHaveLength(0);
  });
});
