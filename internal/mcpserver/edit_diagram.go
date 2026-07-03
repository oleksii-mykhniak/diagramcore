package mcpserver

import (
	"context"
	"os"

	"github.com/oleksii94/diagramcore/internal/edit"
	"github.com/oleksii94/diagramcore/internal/layout"
	"github.com/oleksii94/diagramcore/internal/validate"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type editDiagramParams struct {
	Path       string           `json:"path" jsonschema:"path to the *.dc.yaml file to edit"`
	Operations []edit.Operation `json:"operations" jsonschema:"structured edit operations to apply in order"`
}

type editDiagramResult struct {
	OK     bool           `json:"ok"`
	Errors []diagramError `json:"errors"`
}

// editDiagram applies args.Operations to the file at args.Path: YAML-
// document operations go through internal/edit.Apply (preserving
// comments/formatting), "set_position" operations write the diagram's
// `<name>.layout.json` sidecar instead (merged with whatever positions
// are already there). The whole call is atomic: if the patched YAML
// fails validation, nothing is written and the structured errors (e.g.
// DC002 for a link to a nonexistent node) are returned instead
// (PLAN.md step 9.2).
func editDiagram(ctx context.Context, req *mcp.CallToolRequest, args editDiagramParams) (*mcp.CallToolResult, editDiagramResult, error) {
	data, err := os.ReadFile(args.Path)
	if err != nil {
		return nil, editDiagramResult{}, err
	}
	originalText := string(data)

	var yamlOps []edit.Operation
	var positionOps []edit.Operation
	for _, op := range args.Operations {
		if op.Op == "set_position" {
			positionOps = append(positionOps, op)
		} else {
			yamlOps = append(yamlOps, op)
		}
	}

	newText := originalText
	if len(yamlOps) > 0 {
		newText, err = edit.Apply(originalText, yamlOps)
		if err != nil {
			return nil, editDiagramResult{OK: false, Errors: []diagramError{{File: args.Path, Message: err.Error()}}}, nil
		}
	}

	errs, err := validate.ValidateString(newText)
	if err != nil {
		return nil, editDiagramResult{}, err
	}
	if len(errs) > 0 {
		// Atomicity: validation failed, so nothing is written — the file
		// on disk is untouched.
		return nil, editDiagramResult{OK: false, Errors: toDiagramErrors(errs)}, nil
	}

	if newText != originalText {
		if err := os.WriteFile(args.Path, []byte(newText), 0o644); err != nil {
			return nil, editDiagramResult{}, err
		}
	}

	if len(positionOps) > 0 {
		if err := applyPositionOps(args.Path, positionOps); err != nil {
			return nil, editDiagramResult{}, err
		}
	}

	return nil, editDiagramResult{OK: true, Errors: []diagramError{}}, nil
}

func applyPositionOps(diagramPath string, ops []edit.Operation) error {
	layoutPath := layout.PathFor(diagramPath)
	existing, err := layout.Load(layoutPath)
	if err != nil {
		return err
	}
	positions := map[string]layout.Position{}
	for id, p := range existing.Positions(layout.DefaultView) {
		positions[id] = p
	}
	for _, op := range ops {
		if op.ID == "" || op.Position == nil {
			continue
		}
		positions[op.ID] = layout.Position{X: op.Position.X, Y: op.Position.Y}
	}
	return layout.Save(layoutPath, positions)
}
