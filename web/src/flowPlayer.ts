import type { Diagram, Flow, FlowStep } from './types';
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

/** The flow player's state, controlled by the parent so it can be saved
 * per navigation-stack level and restored when a breadcrumb is clicked
 * (see App.tsx / docs/format.md drill-down navigation, PLAN.md step 5.5). */
export interface FlowPlayerState {
  flowIndex: number | null;
  /** -1 = no step highlighted yet. */
  currentIndex: number;
  choices: BranchChoices;
}

export const initialFlowPlayerState: FlowPlayerState = {
  flowIndex: null,
  currentIndex: -1,
  choices: {},
};

export interface FlowHighlight {
  activeStep: FlowStep | null;
  visitedStepKeys: Set<string>;
}

/** Derives the DiagramView highlight (active/visited edges) from a
 * FlowPlayerState; pure so it can be recomputed on every render/level
 * switch without any component owning derived state. */
export function computeFlowHighlight(diagram: Diagram, state: FlowPlayerState): FlowHighlight {
  const flow = state.flowIndex === null ? undefined : diagram.flows?.[state.flowIndex];
  if (!flow || state.currentIndex < 0) {
    return { activeStep: null, visitedStepKeys: new Set() };
  }
  const { steps } = resolveFlowSteps(flow, state.choices);
  const visitedStepKeys = new Set(steps.slice(0, state.currentIndex).map((s) => pairKey(s.from, s.to)));
  return { activeStep: steps[state.currentIndex] ?? null, visitedStepKeys };
}

export interface FlowStepFrame {
  /** Frame file basename without extension, e.g. "step-01". */
  name: string;
  activeStep: FlowStep;
  visitedStepKeys: Set<string>;
}

/** Splits a concrete step sequence into one frame per step, each with the
 * cumulative highlight up to and including that step — mirrors the Go
 * transpile.FlowStepFrames used by `dc render --flow X --steps`, but
 * operates on an already-resolved (branch-free) step list, since the web
 * player resolves branches interactively rather than exporting every arm. */
export function flowStepFrames(steps: FlowStep[]): FlowStepFrame[] {
  return steps.map((step, i) => ({
    name: `step-${String(i + 1).padStart(2, '0')}`,
    activeStep: step,
    visitedStepKeys: new Set(steps.slice(0, i).map((s) => pairKey(s.from, s.to))),
  }));
}
