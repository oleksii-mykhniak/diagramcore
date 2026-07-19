import { parseDocument } from 'yaml';
import type { Document, YAMLMap, YAMLSeq } from 'yaml';
import type { DiagramLink, DiagramNode, DiagramNoteDef, FlowStep } from './types';

/** Where an `addFlowStep` lands: the flow's top-level `steps[]`, or a
 * `then`/`else` arm of one of its branches (PLAN.md step 7.4). */
export interface FlowStepTarget {
  branchAtIndex: number;
  arm: 'then' | 'else';
}

/** Structured mutations applied to a `*.dc.yaml` document while preserving
 * comments, key order, and formatting of everything untouched — via the
 * `yaml` (eemeli/yaml) Document API, which patches its own CST under the
 * hood (PLAN.md step 7.1). Each operation works on an already-parsed
 * `yaml.Document`; `applyPatch` is the text-in/text-out entry point. */
export type PatchOp =
  | { op: 'addNode'; node: DiagramNode }
  | { op: 'updateNode'; id: string; patch: Partial<DiagramNode> }
  | { op: 'removeNode'; id: string }
  | { op: 'addLink'; link: DiagramLink }
  | { op: 'updateLink'; index: number; patch: Partial<DiagramLink> }
  | { op: 'removeLink'; from: string; to: string; type?: string }
  | { op: 'addFlow'; name: string }
  | { op: 'addBranch'; flowName: string; condition: string; atIndex?: number }
  | { op: 'addFlowStep'; flowName: string; step: FlowStep; atIndex?: number; target?: FlowStepTarget }
  | { op: 'updateFlowStep'; flowName: string; atIndex: number; patch: Partial<FlowStep> }
  | { op: 'removeFlowStep'; flowName: string; atIndex: number }
  | { op: 'renameNodeId'; oldId: string; newId: string }
  | { op: 'addNote'; note: DiagramNoteDef }
  | { op: 'updateNote'; id: string; patch: Partial<DiagramNoteDef> }
  | { op: 'removeNote'; id: string };

/** Human-readable label for a batch of `PatchOp`s (PLAN4.md step 12.13),
 * shown in the History panel and passed to `updateCurrentLevel`'s
 * `historyLabel`. `beforeNodesById`, when given, lets a single
 * `updateNode` that touches `label` show the old→new text ("Edit label
 * a→b" per the plan's own example) instead of just the node id — omitted
 * call sites (or nodes not found in it) fall back to the id-only form.
 * Not exhaustive for every possible mix of ops; uncommon combinations
 * fall back to a generic "Edit diagram (N changes)". */
export function describePatchOps(ops: PatchOp[], beforeNodesById?: Map<string, DiagramNode>): string {
  if (ops.length === 0) return 'Edit diagram';
  if (ops.length === 1) return describeSingleOp(ops[0], beforeNodesById);

  const addNodeOps = ops.filter((op): op is Extract<PatchOp, { op: 'addNode' }> => op.op === 'addNode');
  if (addNodeOps.length === ops.length) {
    return addNodeOps.length === 1 ? `Add node ${addNodeOps[0].node.id}` : `Add ${addNodeOps.length} nodes`;
  }
  const removeNodeOps = ops.filter((op): op is Extract<PatchOp, { op: 'removeNode' }> => op.op === 'removeNode');
  if (removeNodeOps.length > 0 && ops.every((op) => op.op === 'removeNode' || op.op === 'removeLink')) {
    return removeNodeOps.length === 1 ? `Delete node ${removeNodeOps[0].id}` : `Delete ${removeNodeOps.length} nodes`;
  }
  // Group (PLAN4.md step 12.11): one addNode for the container + one
  // updateNode per child re-parented onto it.
  if (
    ops[0].op === 'addNode' &&
    ops.slice(1).every((op) => op.op === 'updateNode' && op.patch.parent === (ops[0] as Extract<PatchOp, { op: 'addNode' }>).node.id)
  ) {
    return `Group ${ops.length - 1} nodes`;
  }
  // Paste (PLAN4.md step 12.12): a run of addNode followed by a run of
  // addLink.
  if (ops.every((op) => op.op === 'addNode' || op.op === 'addLink')) {
    return `Paste ${addNodeOps.length} node${addNodeOps.length === 1 ? '' : 's'}`;
  }
  return `Edit diagram (${ops.length} changes)`;
}

function describeSingleOp(op: PatchOp, beforeNodesById?: Map<string, DiagramNode>): string {
  switch (op.op) {
    case 'addNode':
      return `Add node ${op.node.id}`;
    case 'removeNode':
      return `Delete node ${op.id}`;
    case 'updateNode': {
      if (typeof op.patch.label === 'string') {
        const before = beforeNodesById?.get(op.id);
        const oldLabel = before?.label ?? before?.id ?? op.id;
        return `Edit label ${oldLabel}→${op.patch.label}`;
      }
      if (op.patch.parent !== undefined) return `Move ${op.id} into ${op.patch.parent}`;
      return `Edit node ${op.id}`;
    }
    case 'addLink':
      return `Add link ${op.link.from}→${op.link.to}`;
    case 'updateLink':
      return 'Edit link';
    case 'removeLink':
      return `Delete link ${op.from}→${op.to}`;
    case 'addFlow':
      return `Add flow ${op.name}`;
    case 'addBranch':
      return 'Add branch';
    case 'addFlowStep':
      return 'Add flow step';
    case 'updateFlowStep':
      return 'Edit flow step';
    case 'removeFlowStep':
      return 'Delete flow step';
    case 'renameNodeId':
      return `Rename ${op.oldId}→${op.newId}`;
    case 'addNote':
      return 'Add note';
    case 'updateNote':
      return 'Edit note';
    case 'removeNote':
      return 'Delete note';
    default:
      return 'Edit diagram';
  }
}

function nodesSeq(doc: Document): YAMLSeq {
  const seq = doc.get('nodes', true) as YAMLSeq | undefined;
  if (!seq) throw new Error('document has no nodes[] section');
  return seq;
}

function linksSeq(doc: Document): YAMLSeq {
  const seq = doc.get('links', true) as YAMLSeq | undefined;
  if (!seq) throw new Error('document has no links[] section');
  return seq;
}

function flowsSeq(doc: Document): YAMLSeq | undefined {
  return doc.get('flows', true) as YAMLSeq | undefined;
}

/** Creates the top-level `notes:` sequence on first use (PLAN.md step
 * 10.11) — mirrors how `addFlow` creates `flows:` the first time it's
 * needed. */
function notesSeq(doc: Document): YAMLSeq {
  const existing = doc.get('notes', true) as YAMLSeq | undefined;
  if (existing) return existing;
  const seq = doc.createNode([]) as YAMLSeq;
  doc.set('notes', seq);
  return seq;
}

function findMapById(seq: YAMLSeq, idKey: string, id: string): YAMLMap | undefined {
  return seq.items.find((item) => (item as YAMLMap).get?.(idKey) === id) as YAMLMap | undefined;
}

function findFlow(doc: Document, flowName: string): YAMLMap {
  const flows = flowsSeq(doc);
  const flow = flows?.items.find((f) => (f as YAMLMap).get('name') === flowName) as YAMLMap | undefined;
  if (!flow) throw new Error(`no flow named "${flowName}"`);
  return flow;
}

function applyOp(doc: Document, op: PatchOp): void {
  switch (op.op) {
    case 'addNode': {
      nodesSeq(doc).add(doc.createNode(op.node));
      break;
    }
    case 'updateNode': {
      const node = findMapById(nodesSeq(doc), 'id', op.id);
      if (!node) throw new Error(`no node with id "${op.id}"`);
      for (const [key, value] of Object.entries(op.patch)) {
        if (value === undefined) node.delete(key);
        else node.set(key, value);
      }
      break;
    }
    case 'removeNode': {
      const seq = nodesSeq(doc);
      const index = seq.items.findIndex((item) => (item as YAMLMap).get('id') === op.id);
      if (index === -1) throw new Error(`no node with id "${op.id}"`);
      seq.items.splice(index, 1);
      break;
    }
    case 'addLink': {
      linksSeq(doc).add(doc.createNode(op.link));
      break;
    }
    case 'updateLink': {
      const seq = linksSeq(doc);
      const link = seq.items[op.index] as YAMLMap | undefined;
      if (!link) throw new Error(`no link at index ${op.index}`);
      for (const [key, value] of Object.entries(op.patch)) {
        if (value === undefined) link.delete(key);
        else link.set(key, value);
      }
      break;
    }
    case 'removeLink': {
      const seq = linksSeq(doc);
      const index = seq.items.findIndex((item) => {
        const m = item as YAMLMap;
        return (
          m.get('from') === op.from && m.get('to') === op.to && (op.type === undefined || m.get('type') === op.type)
        );
      });
      if (index === -1) throw new Error(`no link ${op.from} -> ${op.to}`);
      seq.items.splice(index, 1);
      break;
    }
    case 'addFlow': {
      const flows = doc.get('flows', true) as YAMLSeq | undefined;
      const seq = flows ?? doc.createNode([]);
      if (!flows) doc.set('flows', seq);
      (seq as YAMLSeq).add(doc.createNode({ name: op.name, steps: [] }));
      break;
    }
    case 'addBranch': {
      const flow = findFlow(doc, op.flowName);
      const steps = flow.get('steps', true) as unknown as YAMLSeq;
      const branchNode = doc.createNode({ branch: { condition: op.condition, then: [], else: [] } });
      if (op.atIndex === undefined || op.atIndex >= steps.items.length) {
        steps.add(branchNode);
      } else {
        steps.items.splice(op.atIndex, 0, branchNode);
      }
      break;
    }
    case 'addFlowStep': {
      const flow = findFlow(doc, op.flowName);
      const steps = op.target
        ? branchArm(flow, op.target.branchAtIndex, op.target.arm)
        : (flow.get('steps', true) as unknown as YAMLSeq);
      const stepNode = doc.createNode(op.step);
      if (op.atIndex === undefined || op.atIndex >= steps.items.length) {
        steps.add(stepNode);
      } else {
        steps.items.splice(op.atIndex, 0, stepNode);
      }
      break;
    }
    case 'updateFlowStep': {
      const flow = findFlow(doc, op.flowName);
      const steps = flow.get('steps', true) as unknown as YAMLSeq;
      const step = steps.items[op.atIndex] as YAMLMap | undefined;
      if (!step) throw new Error(`flow "${op.flowName}" has no step at index ${op.atIndex}`);
      for (const [key, value] of Object.entries(op.patch)) {
        if (value === undefined) step.delete(key);
        else step.set(key, value);
      }
      break;
    }
    case 'removeFlowStep': {
      const flow = findFlow(doc, op.flowName);
      const steps = flow.get('steps', true) as unknown as YAMLSeq;
      if (op.atIndex < 0 || op.atIndex >= steps.items.length) {
        throw new Error(`flow "${op.flowName}" has no step at index ${op.atIndex}`);
      }
      steps.items.splice(op.atIndex, 1);
      break;
    }
    case 'renameNodeId': {
      const node = findMapById(nodesSeq(doc), 'id', op.oldId);
      if (!node) throw new Error(`no node with id "${op.oldId}"`);
      node.set('id', op.newId);
      for (const item of linksSeq(doc).items) {
        const link = item as YAMLMap;
        if (link.get('from') === op.oldId) link.set('from', op.newId);
        if (link.get('to') === op.oldId) link.set('to', op.newId);
      }
      for (const flowItem of flowsSeq(doc)?.items ?? []) {
        renameInSteps((flowItem as YAMLMap).get('steps', true) as unknown as YAMLSeq, op.oldId, op.newId);
      }
      break;
    }
    case 'addNote': {
      notesSeq(doc).add(doc.createNode(op.note));
      break;
    }
    case 'updateNote': {
      const note = findMapById(notesSeq(doc), 'id', op.id);
      if (!note) throw new Error(`no note with id "${op.id}"`);
      for (const [key, value] of Object.entries(op.patch)) {
        if (value === undefined) note.delete(key);
        else note.set(key, value);
      }
      break;
    }
    case 'removeNote': {
      const seq = notesSeq(doc);
      const index = seq.items.findIndex((item) => (item as YAMLMap).get('id') === op.id);
      if (index === -1) throw new Error(`no note with id "${op.id}"`);
      seq.items.splice(index, 1);
      break;
    }
  }
}

function branchArm(flow: YAMLMap, branchAtIndex: number, arm: 'then' | 'else'): YAMLSeq {
  const steps = flow.get('steps', true) as unknown as YAMLSeq;
  const branchStep = steps.items[branchAtIndex] as YAMLMap | undefined;
  const branch = branchStep?.get('branch', true) as YAMLMap | undefined;
  if (!branch) throw new Error(`no branch step at index ${branchAtIndex}`);
  const armSeq = branch.get(arm, true) as YAMLSeq | undefined;
  if (!armSeq) throw new Error(`branch at index ${branchAtIndex} has no "${arm}" arm`);
  return armSeq;
}

function renameInSteps(steps: YAMLSeq | undefined, oldId: string, newId: string): void {
  if (!steps) return;
  for (const item of steps.items) {
    const stepOrBranch = item as YAMLMap;
    const branch = stepOrBranch.get('branch', true) as YAMLMap | undefined;
    if (branch) {
      renameInSteps(branch.get('then', true) as YAMLSeq | undefined, oldId, newId);
      renameInSteps(branch.get('else', true) as YAMLSeq | undefined, oldId, newId);
      continue;
    }
    if (stepOrBranch.get('from') === oldId) stepOrBranch.set('from', newId);
    if (stepOrBranch.get('to') === oldId) stepOrBranch.set('to', newId);
  }
}

/** Parses `text`, applies `ops` in order, and returns the re-serialized
 * YAML — comments, key order, and untouched formatting are preserved by
 * the underlying `yaml.Document`. Throws (without producing output) if any
 * operation fails, e.g. an unknown node id. */
export function applyPatch(text: string, ops: PatchOp[]): string {
  const doc = parseDocument(text);
  for (const op of ops) applyOp(doc, op);
  return doc.toString();
}
