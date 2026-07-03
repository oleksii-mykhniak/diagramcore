package mcpserver

import (
	"context"
	"path/filepath"

	"github.com/oleksii94/diagramcore/internal/parser"
	"github.com/oleksii94/diagramcore/internal/style"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type getStyleGuideParams struct {
	Dir string `json:"dir" jsonschema:"directory to look for dc-style.yaml in"`
}

type styleViolation struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type getStyleGuideResult struct {
	Found  bool          `json:"found"`
	Config *style.Config `json:"config,omitempty"`
}

// getStyleGuide reads the dc-style.yaml conventions for a directory of
// diagrams — an agent should call this before drawing new diagrams there
// (PLAN.md step 9.3).
func getStyleGuide(ctx context.Context, req *mcp.CallToolRequest, args getStyleGuideParams) (*mcp.CallToolResult, getStyleGuideResult, error) {
	cfg, err := style.Load(filepath.Join(args.Dir, style.FileName))
	if err != nil {
		return nil, getStyleGuideResult{}, err
	}
	return nil, getStyleGuideResult{Found: cfg != nil, Config: cfg}, nil
}

type lintStyleParams struct {
	Path string `json:"path" jsonschema:"path to a *.dc.yaml file; its directory's dc-style.yaml (if any) is used"`
}

type lintStyleResult struct {
	OK         bool             `json:"ok"`
	Violations []styleViolation `json:"violations"`
}

// lintStyle checks a diagram against the dc-style.yaml (if any) found in
// its directory. Shares internal/style.Lint with `dc lint --style`
// (PLAN.md step 9.3 AC: both paths must agree).
func lintStyle(ctx context.Context, req *mcp.CallToolRequest, args lintStyleParams) (*mcp.CallToolResult, lintStyleResult, error) {
	d, err := parser.Parse(args.Path)
	if err != nil {
		return nil, lintStyleResult{}, err
	}
	cfg, err := style.Load(filepath.Join(filepath.Dir(args.Path), style.FileName))
	if err != nil {
		return nil, lintStyleResult{}, err
	}
	violations := style.Lint(d, cfg)
	out := make([]styleViolation, len(violations))
	for i, v := range violations {
		out[i] = styleViolation{File: v.File, Line: v.Line, Code: v.Code, Message: v.Message}
	}
	return nil, lintStyleResult{OK: len(violations) == 0, Violations: out}, nil
}
