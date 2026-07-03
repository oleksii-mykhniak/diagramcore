import { describe, expect, it } from 'vitest';
import { pairKey, resolveFlowSteps } from './flowPlayer';
import type { Flow } from './types';

describe('pairKey', () => {
  it('is order-independent', () => {
    expect(pairKey('A', 'B')).toBe(pairKey('B', 'A'));
  });
});

describe('resolveFlowSteps', () => {
  const plainFlow: Flow = {
    name: 'Plain',
    steps: [
      { from: 'A', to: 'B', note: 'one' },
      { from: 'B', to: 'C', note: 'two' },
    ],
  };

  it('returns all steps with no pending branch when there are no branches', () => {
    const { steps, pendingBranch } = resolveFlowSteps(plainFlow, {});
    expect(steps).toHaveLength(2);
    expect(pendingBranch).toBeNull();
  });

  const branchFlow: Flow = {
    name: 'Branchy',
    steps: [
      { from: 'A', to: 'B', note: 'first' },
      {
        branch: {
          condition: 'is suspicious',
          then: [{ from: 'B', to: 'C', note: 'blocked' }],
          else: [
            { from: 'B', to: 'D', note: 'recorded' },
            { from: 'B', to: 'E', note: 'notified' },
          ],
        },
      },
    ],
  };

  it('stops at an unresolved branch', () => {
    const { steps, pendingBranch } = resolveFlowSteps(branchFlow, {});
    expect(steps).toHaveLength(1);
    expect(pendingBranch).toEqual({ index: 1, condition: 'is suspicious', hasElse: true });
  });

  it('continues down the then arm once chosen', () => {
    const { steps, pendingBranch } = resolveFlowSteps(branchFlow, { 1: 'then' });
    expect(steps.map((s) => s.note)).toEqual(['first', 'blocked']);
    expect(pendingBranch).toBeNull();
  });

  it('continues down the else arm once chosen', () => {
    const { steps, pendingBranch } = resolveFlowSteps(branchFlow, { 1: 'else' });
    expect(steps.map((s) => s.note)).toEqual(['first', 'recorded', 'notified']);
    expect(pendingBranch).toBeNull();
  });
});
