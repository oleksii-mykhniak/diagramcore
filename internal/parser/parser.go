// Package parser turns a *.dc.yaml file on disk into a model.Diagram.
package parser

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"

	"github.com/oleksii94/diagramcore/internal/model"
)

// Parse reads and decodes the *.dc.yaml file at path into a model.Diagram.
// Diagram.Path is set to the canonical absolute path of the file.
func Parse(path string) (*model.Diagram, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	var d model.Diagram
	if err := yaml.Unmarshal(data, &d); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve path %s: %w", path, err)
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		// File may not exist on disk in exactly this form in edge cases;
		// fall back to the absolute path.
		resolved = abs
	}
	d.Path = resolved

	return &d, nil
}

// ParseString decodes yaml data into a model.Diagram without touching the
// filesystem. Diagram.Path is left empty, so features that resolve paths
// relative to it (details sub-diagram traversal) cannot be used on the
// result — this is meant for contexts with no real filesystem, such as the
// WASM validator (cmd/wasm).
func ParseString(data []byte) (*model.Diagram, error) {
	var d model.Diagram
	if err := yaml.Unmarshal(data, &d); err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}
	return &d, nil
}
