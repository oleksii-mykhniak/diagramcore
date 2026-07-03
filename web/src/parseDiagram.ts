import yaml from 'js-yaml';
import type { Diagram } from './types';

/**
 * Parses raw *.dc.yaml text into a Diagram. This only does YAML→object
 * decoding and a minimal shape check; semantic validation (DC001 etc.) is
 * done separately by the WASM validator (see wasmValidate.ts).
 */
export function parseDiagram(yamlText: string): Diagram {
  const doc = yaml.load(yamlText);
  if (!doc || typeof doc !== 'object') {
    throw new Error('Invalid diagram: YAML content is not a mapping');
  }
  const diagram = doc as Partial<Diagram>;
  if (!diagram.diagram || !Array.isArray(diagram.nodes)) {
    throw new Error('Invalid diagram: missing "diagram" or "nodes" section');
  }
  if (!Array.isArray(diagram.links)) {
    diagram.links = [];
  }
  return diagram as Diagram;
}
