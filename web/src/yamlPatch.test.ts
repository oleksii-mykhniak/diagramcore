import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyPatch } from './yamlPatch';

const authSystemPath = path.join(__dirname, '..', '..', 'examples', 'auth-system.dc.yaml');
const paymentPath = path.join(__dirname, '..', '..', 'examples', 'payment-processing.dc.yaml');
const authSystemYAML = fs.readFileSync(authSystemPath, 'utf8');
const paymentYAML = fs.readFileSync(paymentPath, 'utf8');

describe('applyPatch', () => {
  it('addNode: result parses and contains the new node', () => {
    const out = applyPatch(authSystemYAML, [{ op: 'addNode', node: { id: 'Cache', type: 'storage' } }]);
    const doc = parse(out);
    expect(doc.nodes.some((n: { id: string }) => n.id === 'Cache')).toBe(true);
  });

  it('updateNode: patches fields on an existing node', () => {
    const out = applyPatch(authSystemYAML, [{ op: 'updateNode', id: 'User', patch: { label: 'Кінцевий користувач' } }]);
    const doc = parse(out);
    expect(doc.nodes.find((n: { id: string }) => n.id === 'User').label).toBe('Кінцевий користувач');
  });

  it('removeNode: removes the node by id', () => {
    const out = applyPatch(authSystemYAML, [{ op: 'removeNode', id: 'DB' }]);
    const doc = parse(out);
    expect(doc.nodes.some((n: { id: string }) => n.id === 'DB')).toBe(false);
  });

  it('addLink: result parses and contains the new link', () => {
    const out = applyPatch(authSystemYAML, [
      { op: 'addLink', link: { from: 'User', to: 'DB', type: 'dataflow' } },
    ]);
    const doc = parse(out);
    expect(doc.links.some((l: { from: string; to: string }) => l.from === 'User' && l.to === 'DB')).toBe(true);
  });

  it('updateLink: patches fields on the link at the given index', () => {
    const out = applyPatch(authSystemYAML, [{ op: 'updateLink', index: 0, patch: { type: 'event' } }]);
    const doc = parse(out);
    expect(doc.links[0].type).toBe('event');
    expect(doc.links[0].from).toBe('User');
  });

  it('removeLink: removes the matching link', () => {
    const out = applyPatch(authSystemYAML, [{ op: 'removeLink', from: 'AuthService', to: 'DB' }]);
    const doc = parse(out);
    expect(
      doc.links.some((l: { from: string; to: string }) => l.from === 'AuthService' && l.to === 'DB'),
    ).toBe(false);
  });

  it('addFlowStep: appends a step to the named flow', () => {
    const out = applyPatch(authSystemYAML, [
      {
        op: 'addFlowStep',
        flowName: 'Пряма авторизація логін/пароль',
        step: { from: 'AuthService', to: 'OAuthProvider', note: 'extra' },
      },
    ]);
    const doc = parse(out);
    const flow = doc.flows.find((f: { name: string }) => f.name === 'Пряма авторизація логін/пароль');
    expect(flow.steps.at(-1)).toEqual({ from: 'AuthService', to: 'OAuthProvider', note: 'extra' });
  });

  it('addFlow: creates a new named flow with empty steps', () => {
    const out = applyPatch(authSystemYAML, [{ op: 'addFlow', name: 'New scenario' }]);
    const doc = parse(out);
    const flow = doc.flows.find((f: { name: string }) => f.name === 'New scenario');
    expect(flow).toBeDefined();
    expect(flow.steps).toEqual([]);
  });

  it('updateFlowStep: patches the note of an existing top-level step', () => {
    const out = applyPatch(authSystemYAML, [
      { op: 'updateFlowStep', flowName: 'Пряма авторизація логін/пароль', atIndex: 0, patch: { note: 'changed' } },
    ]);
    const doc = parse(out);
    const flow = doc.flows.find((f: { name: string }) => f.name === 'Пряма авторизація логін/пароль');
    expect(flow.steps[0].note).toBe('changed');
  });

  it('addBranch + addFlowStep with a branch target: appends a step into the then/else arm', () => {
    const out = applyPatch(authSystemYAML, [
      { op: 'addFlow', name: 'Branching scenario' },
      { op: 'addBranch', flowName: 'Branching scenario', condition: 'token valid' },
      {
        op: 'addFlowStep',
        flowName: 'Branching scenario',
        step: { from: 'AuthService', to: 'DB' },
        target: { branchAtIndex: 0, arm: 'then' },
      },
      {
        op: 'addFlowStep',
        flowName: 'Branching scenario',
        step: { from: 'AuthService', to: 'OAuthProvider' },
        target: { branchAtIndex: 0, arm: 'else' },
      },
    ]);
    const doc = parse(out);
    const flow = doc.flows.find((f: { name: string }) => f.name === 'Branching scenario');
    expect(flow.steps).toHaveLength(1);
    expect(flow.steps[0].branch.condition).toBe('token valid');
    expect(flow.steps[0].branch.then).toEqual([{ from: 'AuthService', to: 'DB' }]);
    expect(flow.steps[0].branch.else).toEqual([{ from: 'AuthService', to: 'OAuthProvider' }]);
  });

  it('removeFlowStep: removes the step at the given index', () => {
    const out = applyPatch(authSystemYAML, [
      { op: 'removeFlowStep', flowName: 'Пряма авторизація логін/пароль', atIndex: 0 },
    ]);
    const doc = parse(out);
    const flow = doc.flows.find((f: { name: string }) => f.name === 'Пряма авторизація логін/пароль');
    expect(flow.steps).toHaveLength(3);
    expect(flow.steps[0].from).toBe('Gateway');
  });

  it('renameNodeId: updates all mentions in links and flows (including branch arms)', () => {
    const out = applyPatch(paymentYAML, [{ op: 'renameNodeId', oldId: 'PaymentGateway', newId: 'Gateway2' }]);
    const doc = parse(out);
    expect(doc.nodes.some((n: { id: string }) => n.id === 'PaymentGateway')).toBe(false);
    expect(doc.nodes.some((n: { id: string }) => n.id === 'Gateway2')).toBe(true);
    expect(doc.links.some((l: { from: string; to: string }) => l.from === 'PaymentGateway' || l.to === 'PaymentGateway')).toBe(
      false,
    );
    const mentionsOld = JSON.stringify(doc.flows).includes('PaymentGateway');
    expect(mentionsOld).toBe(false);
    const mentionsNew = JSON.stringify(doc.flows).includes('Gateway2');
    expect(mentionsNew).toBe(true);
  });

  it('a document with comments: addNode + removeLink preserve all comments and unchanged section order byte-for-byte (golden)', () => {
    const withComments = `diagram:
  title: "T" # title comment
nodes:
  - id: A
    type: actor
  # comment above B
  - id: B
    type: service
links:
  - from: A
    to: B
    type: request
`;
    const out = applyPatch(withComments, [
      { op: 'addNode', node: { id: 'C', type: 'storage' } },
      { op: 'removeLink', from: 'A', to: 'B' },
    ]);
    expect(out).toBe(`diagram:
  title: "T" # title comment
nodes:
  - id: A
    type: actor
  # comment above B
  - id: B
    type: service
  - id: C
    type: storage
links: []
`);
  });
});
