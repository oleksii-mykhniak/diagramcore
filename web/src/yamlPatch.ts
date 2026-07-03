import { parseDocument } from 'yaml';
import type { Document, YAMLMap, YAMLSeq } from 'yaml';
import type { DiagramLink, DiagramNode, FlowStep } from './types';

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
  | { op: 'removeLink'; from: string; to: string; type?: string }
  | { op: 'addFlowStep'; flowName: string; step: FlowStep; atIndex?: number }
  | { op: 'removeFlowStep'; flowName: string; atIndex: number }
  | { op: 'renameNodeId'; oldId: string; newId: string };

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
    case 'addFlowStep': {
      const flow = findFlow(doc, op.flowName);
      const steps = flow.get('steps', true) as unknown as YAMLSeq;
      const stepNode = doc.createNode(op.step);
      if (op.atIndex === undefined || op.atIndex >= steps.items.length) {
        steps.add(stepNode);
      } else {
        steps.items.splice(op.atIndex, 0, stepNode);
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
  }
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
