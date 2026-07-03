import type { Diagram } from './types';
import { isFlowBranch } from './types';

export interface NodeDependents {
  links: { from: string; to: string }[];
  /** Top-level flow steps (not inside a branch arm) referencing the node,
   * identified by (flowName, index) so they can be removed by
   * `removeFlowStep` before index shifts from earlier removals — always
   * process a flow's indices highest-to-lowest. Steps nested in a
   * branch's then/else are out of scope for cascade delete (PLAN.md step
   * 7.2 deviation, see docs/deviations.md): they're left for the
   * validator/YAML panel to flag. */
  flowSteps: { flowName: string; index: number }[];
}

export function findNodeDependents(diagram: Diagram, nodeId: string): NodeDependents {
  const links = diagram.links.filter((l) => l.from === nodeId || l.to === nodeId).map((l) => ({ from: l.from, to: l.to }));

  const flowSteps: { flowName: string; index: number }[] = [];
  for (const flow of diagram.flows ?? []) {
    flow.steps.forEach((step, index) => {
      if (isFlowBranch(step)) return;
      if (step.from === nodeId || step.to === nodeId) flowSteps.push({ flowName: flow.name, index });
    });
  }
  return { links, flowSteps };
}
