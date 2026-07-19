/** Shared z-order resolution (PLAN4.md step 12.9) — used by both the
 * canvas (`FlowCanvas.tsx`, to assign RF `zIndex`) and the SVG export
 * (`svgExport.ts`, to pick draw order), so the two can never disagree.
 *
 * `zOrder` is a (possibly partial, possibly stale) bottom-to-top list of
 * node ids, persisted verbatim as the layout file's `zOrder` — whatever
 * it was at the last z-order operation. `resolveZOrder` reconciles it
 * against the diagram's CURRENT node id set: every id actually in
 * `zOrder` keeps its relative order and is grouped into one contiguous
 * block, positioned where the first of them falls in the default
 * (`nodeIds`) order; every id NOT in `zOrder` (new since the last
 * operation, or `zOrder` was simply never touched) renders in its own
 * default-order slot, interleaved around that block. This keeps the
 * z-order stable and comprehensible without requiring every node to be
 * explicitly listed. */
export function resolveZOrder(nodeIds: string[], zOrder: string[]): string[] {
  const explicit = zOrder.filter((id) => nodeIds.includes(id));
  if (explicit.length === 0) return nodeIds;
  const explicitSet = new Set(explicit);
  const result: string[] = [];
  let blockEmitted = false;
  for (const id of nodeIds) {
    if (explicitSet.has(id)) {
      if (!blockEmitted) {
        result.push(...explicit);
        blockEmitted = true;
      }
    } else {
      result.push(id);
    }
  }
  return result;
}

/** Full draw order (PLAN4.md step 12.9) respecting BOTH z-order and the
 * container-before-children invariant from PLAN3.md step 11.6: a
 * container always draws under its own children, independent of
 * `zOrder` (containers and their children aren't even siblings, so
 * `zOrder` — which only reorders within a sibling group — can't put a
 * child under its own parent). `zOrder` only reorders each level's
 * siblings among themselves. DFS preorder over the parent/children tree
 * naturally keeps every container immediately before its descendants. */
export function resolveDrawOrder(nodes: Array<{ id: string; parent?: string }>, zOrder: string[]): string[] {
  const childrenByParent = new Map<string | undefined, string[]>();
  for (const n of nodes) {
    const key = n.parent;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(n.id);
    childrenByParent.set(key, arr);
  }
  const result: string[] = [];
  const visit = (parent: string | undefined) => {
    const siblings = childrenByParent.get(parent) ?? [];
    for (const id of resolveZOrder(siblings, zOrder)) {
      result.push(id);
      visit(id);
    }
  };
  visit(undefined);
  return result;
}

/** A z-order edit's outcome — always the FULL resolved order for every
 * id currently in the diagram, so the next resolve is a no-op drift
 * correction rather than depending on a partial list staying valid. */
type ZOrderOp = 'front' | 'forward' | 'backward' | 'back';

/** Applies one Arrange → z-order action to `ids` (one or more selected
 * nodes, for multi-select) within the full resolved order — "forward"/
 * "backward" moves each selected id past its nearest unselected
 * neighbor in that direction (so a multi-selection moves as a unit
 * without needing to swap past itself); "front"/"back" moves the whole
 * selection to the very top/bottom, preserving its own relative order. */
export function applyZOrderOp(nodeIds: string[], zOrder: string[], ids: string[], op: ZOrderOp): string[] {
  const order = resolveZOrder(nodeIds, zOrder);
  const selected = new Set(ids);
  const rest = order.filter((id) => !selected.has(id));
  const selectedInOrder = order.filter((id) => selected.has(id));

  if (op === 'front') return [...rest, ...selectedInOrder];
  if (op === 'back') return [...selectedInOrder, ...rest];

  // "forward"/"backward": move the selected block past exactly one
  // neighboring unselected id, one step at a time.
  const next = [...order];
  if (op === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) {
      if (selected.has(next[i]) && !selected.has(next[i + 1])) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (selected.has(next[i]) && !selected.has(next[i - 1])) {
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
  }
  return next;
}
