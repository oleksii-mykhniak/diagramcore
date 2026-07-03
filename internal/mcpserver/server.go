// Package mcpserver implements `dc mcp` (PLAN.md phase 9): a Model
// Context Protocol server, over stdio, exposing thin tool wrappers around
// internal/validate and internal/context so an agent can create,
// validate, and inspect diagrams without shelling out to the CLI.
package mcpserver

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	dccontext "github.com/oleksii94/diagramcore/internal/context"
	"github.com/oleksii94/diagramcore/internal/parser"
	"github.com/oleksii94/diagramcore/internal/validate"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const serverName = "diagramcore"

// version is set at build time in a later step if needed; a fixed string
// is fine for now (mirrors how `dc` itself has no --version flag yet).
const version = "0.1.0"

// NewServer builds the MCP server with all diagramcore tools registered.
func NewServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: serverName, Version: version}, nil)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "validate_diagram",
		Description: "Validate a *.dc.yaml diagram, given a file path or raw YAML content. Returns structured errors (code, file, line, message).",
	}, validateDiagram)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_context",
		Description: "Generate the AI-context markdown for a *.dc.yaml diagram file (the same output as `dc context`).",
	}, getContext)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_diagrams",
		Description: "List *.dc.yaml files under a directory (recursively).",
	}, listDiagrams)
	mcp.AddTool(server, &mcp.Tool{
		Name: "edit_diagram",
		Description: "Apply structured edit operations (add_node, update_node, remove_node, add_link, " +
			"remove_link, add_flow_step, remove_flow_step, rename_node_id, set_position) to a *.dc.yaml " +
			"file on disk, preserving comments and formatting. Atomic: validates the result before " +
			"writing, and writes nothing at all if that fails.",
	}, editDiagram)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_style_guide",
		Description: "Read the dc-style.yaml conventions (allowed types/tags, id pattern, required fields, node limits, theme) for a directory of diagrams.",
	}, getStyleGuide)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "lint_style",
		Description: "Check a *.dc.yaml diagram against its directory's dc-style.yaml conventions (DS0xx codes). No style file means no violations.",
	}, lintStyle)
	return server
}

// Run serves the MCP protocol over stdio until the client disconnects or
// ctx is cancelled.
func Run(ctx context.Context) error {
	return NewServer().Run(ctx, &mcp.StdioTransport{})
}

// diagramError is the JSON shape of a validation finding returned to MCP
// clients — mirrors validate.Error but with explicit lowercase field
// names for a stable wire format independent of Go's default JSON
// marshaling of exported fields.
type diagramError struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func toDiagramErrors(errs []validate.Error) []diagramError {
	out := make([]diagramError, len(errs))
	for i, e := range errs {
		out[i] = diagramError{File: e.File, Line: e.Line, Code: e.Code, Message: e.Message}
	}
	return out
}

type validateDiagramParams struct {
	Path    string `json:"path,omitempty" jsonschema:"path to a *.dc.yaml file on disk; mutually exclusive with content"`
	Content string `json:"content,omitempty" jsonschema:"raw *.dc.yaml text; used instead of path when set"`
}

type validateDiagramResult struct {
	OK     bool           `json:"ok"`
	Errors []diagramError `json:"errors"`
}

func validateDiagram(ctx context.Context, req *mcp.CallToolRequest, args validateDiagramParams) (*mcp.CallToolResult, validateDiagramResult, error) {
	var errs []validate.Error
	var err error
	switch {
	case args.Content != "":
		errs, err = validate.ValidateString(args.Content)
	case args.Path != "":
		errs, err = validate.ValidateFile(args.Path)
	default:
		return nil, validateDiagramResult{}, fmt.Errorf("validate_diagram: one of path or content is required")
	}
	if err != nil {
		return nil, validateDiagramResult{}, err
	}
	return nil, validateDiagramResult{OK: len(errs) == 0, Errors: toDiagramErrors(errs)}, nil
}

type getContextParams struct {
	Path string `json:"path" jsonschema:"path to a *.dc.yaml file on disk"`
	Deep bool   `json:"deep,omitempty" jsonschema:"if true, recursively include details sub-diagrams"`
}

type getContextResult struct {
	Markdown string `json:"markdown"`
}

func getContext(ctx context.Context, req *mcp.CallToolRequest, args getContextParams) (*mcp.CallToolResult, getContextResult, error) {
	d, err := parser.Parse(args.Path)
	if err != nil {
		return nil, getContextResult{}, err
	}
	md, err := dccontext.Generate(d, args.Deep)
	if err != nil {
		return nil, getContextResult{}, err
	}
	return nil, getContextResult{Markdown: md}, nil
}

type listDiagramsParams struct {
	Dir string `json:"dir" jsonschema:"directory to search for *.dc.yaml files, recursively"`
}

type listDiagramsResult struct {
	Files []string `json:"files"`
}

func listDiagrams(ctx context.Context, req *mcp.CallToolRequest, args listDiagramsParams) (*mcp.CallToolResult, listDiagramsResult, error) {
	var files []string
	err := filepath.WalkDir(args.Dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && len(path) > len(".dc.yaml") && path[len(path)-len(".dc.yaml"):] == ".dc.yaml" {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return nil, listDiagramsResult{}, err
	}
	sort.Strings(files)
	return nil, listDiagramsResult{Files: files}, nil
}
