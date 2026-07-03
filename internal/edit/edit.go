// Package edit applies structured mutations to a *.dc.yaml document's raw
// YAML node tree (gopkg.in/yaml.v3), preserving comments and the
// formatting of everything untouched — the Go-side counterpart of
// web/src/yamlPatch.ts (PLAN.md step 7.1), used by the `edit_diagram` MCP
// tool (PLAN.md step 9.2).
package edit

import (
	"bytes"
	"fmt"

	"gopkg.in/yaml.v3"
)

// NodeSpec is the subset of model.Node fields an operation can set.
// Fields are applied in this declared order when creating a new mapping
// node, matching the field order used throughout docs/format.md examples.
type NodeSpec struct {
	ID          string   `json:"id"`
	Type        string   `json:"type"`
	Label       string   `json:"label,omitempty"`
	Description string   `json:"description,omitempty"`
	AIContext   string   `json:"ai_context,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Details     string   `json:"details,omitempty"`
}

// LinkSpec is the subset of model.Link fields an operation can set.
type LinkSpec struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Type     string `json:"type"`
	Label    string `json:"label,omitempty"`
	Directed *bool  `json:"directed,omitempty"`
}

// StepSpec is a single flow step (not a branch).
type StepSpec struct {
	From string `json:"from"`
	To   string `json:"to"`
	Note string `json:"note,omitempty"`
}

// BranchTarget selects a branch's then/else arm as the destination for
// add_flow_step, mirroring web/src/yamlPatch.ts's FlowStepTarget.
type BranchTarget struct {
	BranchAtIndex int    `json:"branch_at_index"`
	Arm           string `json:"arm"` // "then" | "else"
}

// Operation is a single structured mutation. Exactly the fields relevant
// to Op are expected to be set; the rest are ignored. Modeled as one flat
// struct (rather than a tagged union, which Go/JSON has no first-class
// support for) for a simple, predictable MCP tool input schema.
type Operation struct {
	Op string `json:"op"`

	Node *NodeSpec      `json:"node,omitempty"`
	ID   string         `json:"id,omitempty"`
	Patch map[string]any `json:"patch,omitempty"`

	Link *LinkSpec `json:"link,omitempty"`
	From string    `json:"from,omitempty"`
	To   string    `json:"to,omitempty"`
	Type string    `json:"type,omitempty"`

	FlowName string        `json:"flow_name,omitempty"`
	Step     *StepSpec     `json:"step,omitempty"`
	AtIndex  int           `json:"at_index,omitempty"`
	Target   *BranchTarget `json:"target,omitempty"`

	OldID string `json:"old_id,omitempty"`
	NewID string `json:"new_id,omitempty"`

	// Position is used by the "set_position" op only; unlike every other
	// op it never touches the YAML document (Apply below rejects it) —
	// the MCP `edit_diagram` tool (PLAN.md step 9.2) handles it
	// separately by writing the diagram's layout sidecar file instead.
	Position *Position `json:"position,omitempty"`
}

// Position is a node's manual canvas position, written to the
// `<name>.layout.json` sidecar file by "set_position" rather than into
// the YAML document itself.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Apply parses text, applies ops in order to the raw yaml.Node tree, and
// returns the re-serialized YAML. Comments, key order, and untouched
// formatting are preserved by yaml.v3 as long as mutation happens on the
// Node tree (not a decode-into-struct/re-encode round trip). Returns an
// error (without producing output) if any operation fails, e.g. an
// unknown node id.
func Apply(text string, ops []Operation) (string, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(text), &doc); err != nil {
		return "", fmt.Errorf("parse: %w", err)
	}
	if len(doc.Content) == 0 {
		return "", fmt.Errorf("empty document")
	}
	root := doc.Content[0]

	for _, op := range ops {
		if err := applyOp(root, op); err != nil {
			return "", fmt.Errorf("op %q: %w", op.Op, err)
		}
	}

	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	// docs/format.md examples (and every existing *.dc.yaml) use 2-space
	// indentation; yaml.Marshal's default of 4 would otherwise reformat
	// every line, not just the ones an operation actually touched.
	enc.SetIndent(2)
	if err := enc.Encode(&doc); err != nil {
		return "", fmt.Errorf("encode: %w", err)
	}
	if err := enc.Close(); err != nil {
		return "", fmt.Errorf("encode: %w", err)
	}
	return buf.String(), nil
}

func applyOp(root *yaml.Node, op Operation) error {
	switch op.Op {
	case "add_node":
		if op.Node == nil {
			return fmt.Errorf("add_node: node is required")
		}
		seq, err := seqField(root, "nodes")
		if err != nil {
			return err
		}
		seq.Content = append(seq.Content, nodeSpecToYAML(*op.Node))
		return nil

	case "update_node":
		m, err := findByField(root, "nodes", "id", op.ID)
		if err != nil {
			return err
		}
		applyPatch(m, op.Patch)
		return nil

	case "remove_node":
		seq, err := seqField(root, "nodes")
		if err != nil {
			return err
		}
		idx, err := indexByField(seq, "id", op.ID)
		if err != nil {
			return err
		}
		seq.Content = append(seq.Content[:idx], seq.Content[idx+1:]...)
		return nil

	case "add_link":
		if op.Link == nil {
			return fmt.Errorf("add_link: link is required")
		}
		seq, err := seqField(root, "links")
		if err != nil {
			return err
		}
		seq.Content = append(seq.Content, linkSpecToYAML(*op.Link))
		return nil

	case "remove_link":
		seq, err := seqField(root, "links")
		if err != nil {
			return err
		}
		idx := -1
		for i, item := range seq.Content {
			from := mapGetScalar(item, "from")
			to := mapGetScalar(item, "to")
			if from == op.From && to == op.To && (op.Type == "" || mapGetScalar(item, "type") == op.Type) {
				idx = i
				break
			}
		}
		if idx == -1 {
			return fmt.Errorf("remove_link: no link %s -> %s", op.From, op.To)
		}
		seq.Content = append(seq.Content[:idx], seq.Content[idx+1:]...)
		return nil

	case "add_flow_step":
		if op.Step == nil {
			return fmt.Errorf("add_flow_step: step is required")
		}
		flow, err := findByField(root, "flows", "name", op.FlowName)
		if err != nil {
			return err
		}
		steps, err := seqField(flow, "steps")
		if err != nil {
			return err
		}
		if op.Target != nil {
			steps, err = branchArm(steps, op.Target.BranchAtIndex, op.Target.Arm)
			if err != nil {
				return err
			}
		}
		steps.Content = append(steps.Content, stepSpecToYAML(*op.Step))
		return nil

	case "remove_flow_step":
		flow, err := findByField(root, "flows", "name", op.FlowName)
		if err != nil {
			return err
		}
		steps, err := seqField(flow, "steps")
		if err != nil {
			return err
		}
		if op.AtIndex < 0 || op.AtIndex >= len(steps.Content) {
			return fmt.Errorf("remove_flow_step: no step at index %d", op.AtIndex)
		}
		steps.Content = append(steps.Content[:op.AtIndex], steps.Content[op.AtIndex+1:]...)
		return nil

	case "rename_node_id":
		node, err := findByField(root, "nodes", "id", op.OldID)
		if err != nil {
			return err
		}
		setMapField(node, "id", op.NewID)
		if links, err := seqField(root, "links"); err == nil {
			for _, link := range links.Content {
				if mapGetScalar(link, "from") == op.OldID {
					setMapField(link, "from", op.NewID)
				}
				if mapGetScalar(link, "to") == op.OldID {
					setMapField(link, "to", op.NewID)
				}
			}
		}
		if flows, err := seqField(root, "flows"); err == nil {
			for _, flow := range flows.Content {
				if steps, err := seqField(flow, "steps"); err == nil {
					renameInSteps(steps, op.OldID, op.NewID)
				}
			}
		}
		return nil

	default:
		return fmt.Errorf("unknown op %q", op.Op)
	}
}

func renameInSteps(steps *yaml.Node, oldID, newID string) {
	for _, item := range steps.Content {
		if branch := mapGet(item, "branch"); branch != nil {
			if then, err := seqField(branch, "then"); err == nil {
				renameInSteps(then, oldID, newID)
			}
			if elseArm, err := seqField(branch, "else"); err == nil {
				renameInSteps(elseArm, oldID, newID)
			}
			continue
		}
		if mapGetScalar(item, "from") == oldID {
			setMapField(item, "from", newID)
		}
		if mapGetScalar(item, "to") == oldID {
			setMapField(item, "to", newID)
		}
	}
}

func branchArm(steps *yaml.Node, branchAtIndex int, arm string) (*yaml.Node, error) {
	if branchAtIndex < 0 || branchAtIndex >= len(steps.Content) {
		return nil, fmt.Errorf("no branch step at index %d", branchAtIndex)
	}
	branch := mapGet(steps.Content[branchAtIndex], "branch")
	if branch == nil {
		return nil, fmt.Errorf("step at index %d is not a branch", branchAtIndex)
	}
	armNode := mapGet(branch, arm)
	if armNode == nil {
		return nil, fmt.Errorf("branch at index %d has no %q arm", branchAtIndex, arm)
	}
	return armNode, nil
}
