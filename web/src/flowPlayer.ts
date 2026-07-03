import type { Flow, FlowStep } from './types';
import { isFlowBranch } from './types';

/** Order-independent key for a node id pair, matching the Go
 * transpile.pairKey / DC004 semantics: a step is associated with a link
 * regardless of which side is "from" vs "to". */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface PendingBranch {
  /** Index into flow.steps of the unresolved branch. */
  index: number;
  condition: string;
  hasElse: boolean;
}

export interface ResolvedFlow {
  /** The concrete (branch-free) step sequence reachable given the current
   * branch choices, in order. */
  steps: FlowStep[];
  /** Set when playback has reached a branch with no choice recorded yet
   * for it in `choices`. */
  pendingBranch: PendingBranch | null;
}

export type BranchChoices = Record<number, 'then' | 'else'>;

/** Flattens flow into concrete steps given the branch choices made so
 * far. Stops (returning pendingBranch) at the first branch without a
 * recorded choice, mirroring how the player pauses for user input. */
export function resolveFlowSteps(flow: Flow, choices: BranchChoices): ResolvedFlow {
  const steps: FlowStep[] = [];
  for (let i = 0; i < flow.steps.length; i++) {
    const item = flow.steps[i];
    if (!isFlowBranch(item)) {
      steps.push(item);
      continue;
    }
    const choice = choices[i];
    if (!choice) {
      return {
        steps,
        pendingBranch: {
          index: i,
          condition: item.branch.condition,
          hasElse: (item.branch.else?.length ?? 0) > 0,
        },
      };
    }
    const arm = choice === 'then' ? item.branch.then : (item.branch.else ?? []);
    steps.push(...arm);
  }
  return { steps, pendingBranch: null };
}
