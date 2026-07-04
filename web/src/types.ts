// Mirrors the subset of internal/model (Go) needed by the web editor.
// See docs/format.md for the authoritative format definition.

export interface CustomTypeDef {
  name: string;
  shape?: string;
  color?: string;
  icon?: string;
}

export interface DiagramMeta {
  title: string;
  purpose?: string;
  audience?: string;
  version?: string;
  /** Each raw entry is a bare string (legacy) or a `{name, shape?,
   * color?, icon?}` object (PLAN.md step 10.7) — use
   * `normalizeCustomTypes` to get a uniform `CustomTypeDef[]`. */
  custom_types?: (string | CustomTypeDef)[];
}

/** Normalizes `diagram.custom_types` to a uniform `CustomTypeDef[]`,
 * regardless of which raw form each entry used. */
export function normalizeCustomTypes(meta: DiagramMeta): CustomTypeDef[] {
  return (meta.custom_types ?? []).map((t) => (typeof t === 'string' ? { name: t } : t));
}

export interface DiagramNode {
  id: string;
  type: string;
  label?: string;
  description?: string;
  ai_context?: string;
  tags?: string[];
  details?: string;
}

export interface DiagramLink {
  from: string;
  to: string;
  type: string;
  label?: string;
  directed?: boolean;
}

export interface FlowStep {
  from: string;
  to: string;
  note?: string;
}

export interface FlowBranch {
  branch: {
    condition: string;
    then: FlowStep[];
    else?: FlowStep[];
  };
}

export type FlowStepOrBranch = FlowStep | FlowBranch;

export function isFlowBranch(step: FlowStepOrBranch): step is FlowBranch {
  return 'branch' in step;
}

export interface Flow {
  name: string;
  steps: FlowStepOrBranch[];
}

export interface Diagram {
  diagram: DiagramMeta;
  nodes: DiagramNode[];
  links: DiagramLink[];
  flows?: Flow[];
}

export function nodeLabel(node: DiagramNode): string {
  return node.label && node.label.length > 0 ? node.label : node.id;
}
