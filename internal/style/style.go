// Package style implements the `dc-style.yaml` convention format and
// `lint_style` checks (PLAN.md step 9.3): per-directory conventions for a
// set of diagrams (allowed types/tags, id naming, required fields, node
// count limits, render theme) shared between `dc lint --style` and the
// `lint_style`/`get_style_guide` MCP tools.
package style

import (
	"fmt"
	"os"
	"regexp"

	"gopkg.in/yaml.v3"

	"github.com/oleksii94/diagramcore/internal/model"
)

// FileName is the conventional name of a style file, placed alongside
// the diagrams it governs.
const FileName = "dc-style.yaml"

// Config is the decoded contents of a dc-style.yaml file. Every field is
// optional; an unset field means "no constraint".
type Config struct {
	AllowedTypes       []string `yaml:"allowed_types"`
	AllowedTags        []string `yaml:"allowed_tags"`
	IDPattern          string   `yaml:"id_pattern"`
	RequireDescription bool     `yaml:"require_description"`
	MaxNodes           int      `yaml:"max_nodes"`
	Theme              string   `yaml:"theme"`
}

// Violation is a single style-lint finding.
type Violation struct {
	File    string
	Line    int
	Code    string
	Message string
}

func (v Violation) String() string {
	return fmt.Sprintf("%s:%d [%s] %s", v.File, v.Line, v.Code, v.Message)
}

// Load reads and decodes a dc-style.yaml file. If path does not exist,
// Load returns (nil, nil): no style file means no style constraints,
// not an error.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &cfg, nil
}

func contains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

// Lint checks d against cfg, returning every violation (not fail-fast).
// A nil cfg (no style file found) always yields no violations.
func Lint(d *model.Diagram, cfg *Config) []Violation {
	if cfg == nil {
		return nil
	}
	var violations []Violation

	var idRe *regexp.Regexp
	if cfg.IDPattern != "" {
		idRe = regexp.MustCompile(cfg.IDPattern)
	}

	for _, n := range d.Nodes {
		if len(cfg.AllowedTypes) > 0 && !contains(cfg.AllowedTypes, n.Type) {
			violations = append(violations, Violation{
				File: d.Path, Line: n.Line, Code: "DS001",
				Message: fmt.Sprintf("node %q has type %q, not in allowed_types %v", n.ID, n.Type, cfg.AllowedTypes),
			})
		}
		if len(cfg.AllowedTags) > 0 {
			for _, tag := range n.Tags {
				if !contains(cfg.AllowedTags, tag) {
					violations = append(violations, Violation{
						File: d.Path, Line: n.Line, Code: "DS002",
						Message: fmt.Sprintf("node %q has tag %q, not in allowed_tags %v", n.ID, tag, cfg.AllowedTags),
					})
				}
			}
		}
		if idRe != nil && !idRe.MatchString(n.ID) {
			violations = append(violations, Violation{
				File: d.Path, Line: n.Line, Code: "DS003",
				Message: fmt.Sprintf("node id %q does not match id_pattern %q", n.ID, cfg.IDPattern),
			})
		}
		if cfg.RequireDescription && n.Description == "" {
			violations = append(violations, Violation{
				File: d.Path, Line: n.Line, Code: "DS004",
				Message: fmt.Sprintf("node %q has no description", n.ID),
			})
		}
	}

	if cfg.MaxNodes > 0 && len(d.Nodes) > cfg.MaxNodes {
		violations = append(violations, Violation{
			File: d.Path, Line: 0, Code: "DS005",
			Message: fmt.Sprintf("diagram has %d nodes, exceeding max_nodes %d", len(d.Nodes), cfg.MaxNodes),
		})
	}

	return violations
}
