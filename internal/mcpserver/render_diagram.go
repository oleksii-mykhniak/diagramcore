package mcpserver

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"

	"github.com/oleksii94/diagramcore/internal/layout"
	"github.com/oleksii94/diagramcore/internal/model"
	"github.com/oleksii94/diagramcore/internal/parser"
	"github.com/oleksii94/diagramcore/internal/render"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type renderDiagramParams struct {
	Path   string `json:"path" jsonschema:"path to the *.dc.yaml file to render"`
	Flow   string `json:"flow,omitempty" jsonschema:"if set, render this flow's path highlighted (like dc render --flow)"`
	Format string `json:"format,omitempty" jsonschema:"svg (default) or png; png is best-effort and falls back to svg if no converter is available"`
}

func findFlowByName(d *model.Diagram, name string) (*model.Flow, error) {
	for i := range d.Flows {
		if d.Flows[i].Name == name {
			return &d.Flows[i], nil
		}
	}
	return nil, fmt.Errorf("unknown flow %q", name)
}

// renderDiagram gives an agent "eyes" on a diagram (PLAN.md step 9.4)
// without a browser: renders to SVG (always available) via
// internal/render, same as `dc render`, with the diagram's own
// <name>.layout.json applied if present. `flow` highlights that flow's
// path, exactly like `dc render --flow <name> --animate`.
//
// `format: "png"` is best-effort: PNG rendering was deferred in phase 3
// (PLAN.md, docs/deviations.md) since the only available raster path is
// shelling out to an external SVG rasterizer. If `rsvg-convert` is on
// PATH, it's used; otherwise this silently falls back to SVG, same as
// the plan's own "PNG best-effort" allowance for this tool.
func renderDiagram(ctx context.Context, req *mcp.CallToolRequest, args renderDiagramParams) (*mcp.CallToolResult, any, error) {
	d, err := parser.Parse(args.Path)
	if err != nil {
		return nil, nil, err
	}

	opts := render.Options{}
	if lf, err := layout.Load(layout.PathFor(args.Path)); err == nil && lf != nil {
		opts.Positions = lf.Positions(layout.DefaultView)
	}

	var svg []byte
	if args.Flow != "" {
		flow, err := findFlowByName(d, args.Flow)
		if err != nil {
			return nil, nil, err
		}
		opts.Flow = flow
		svg, err = render.SVGAnimated(d, flow, opts)
		if err != nil {
			return nil, nil, err
		}
	} else {
		svg, err = render.SVG(d, opts)
		if err != nil {
			return nil, nil, err
		}
	}

	data := svg
	mimeType := "image/svg+xml"
	if args.Format == "png" {
		if pngBytes, ok := svgToPNGBestEffort(svg); ok {
			data = pngBytes
			mimeType = "image/png"
		}
	}

	return &mcp.CallToolResult{
		Content: []mcp.Content{&mcp.ImageContent{Data: data, MIMEType: mimeType}},
	}, nil, nil
}

// svgToPNGBestEffort shells out to rsvg-convert if it's on PATH. There is
// no pure-Go SVG rasterizer in this module's dependency tree, and adding
// one (or a headless-browser dependency) is out of proportion for a
// "best-effort" fallback path — see docs/deviations.md, step 9.4.
func svgToPNGBestEffort(svg []byte) ([]byte, bool) {
	path, err := exec.LookPath("rsvg-convert")
	if err != nil {
		return nil, false
	}
	cmd := exec.Command(path, "--format=png")
	cmd.Stdin = bytes.NewReader(svg)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, false
	}
	return out.Bytes(), true
}
