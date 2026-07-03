// Package render turns a model.Diagram into an SVG image via the D2
// rendering pipeline (internal/transpile -> d2lib -> d2svg).
package render

import (
	"context"
	"fmt"
	"strings"

	"oss.terrastruct.com/d2/d2compiler"
	"oss.terrastruct.com/d2/d2exporter"
	"oss.terrastruct.com/d2/d2graph"
	"oss.terrastruct.com/d2/d2layouts"
	"oss.terrastruct.com/d2/d2layouts/d2dagrelayout"
	"oss.terrastruct.com/d2/d2layouts/d2elklayout"
	"oss.terrastruct.com/d2/d2lib"
	"oss.terrastruct.com/d2/d2renderers/d2animate"
	"oss.terrastruct.com/d2/d2renderers/d2svg"
	"oss.terrastruct.com/d2/d2target"
	"oss.terrastruct.com/d2/d2themes/d2themescatalog"
	"oss.terrastruct.com/d2/lib/geo"
	"oss.terrastruct.com/d2/lib/log"
	"oss.terrastruct.com/d2/lib/textmeasure"
	"oss.terrastruct.com/util-go/go2"

	"github.com/oleksii94/diagramcore/internal/layout"
	"github.com/oleksii94/diagramcore/internal/model"
	"github.com/oleksii94/diagramcore/internal/transpile"
)

// Options controls SVG rendering.
type Options struct {
	// Layout is the layout engine: "dagre" (default) or "elk".
	Layout string
	// ThemeID selects a D2 theme; zero value uses D2's neutral default.
	ThemeID *int64
	// Flow, if set, highlights that flow's path and mutes everything else.
	Flow *model.Flow
	// Positions, if non-empty, pins the listed node ids at fixed
	// coordinates instead of letting the layout engine place them (see
	// internal/layout and docs/format.md's <name>.layout.json). Node ids
	// not present in Positions are still placed by the layout engine.
	Positions map[string]layout.Position
}

// SVG renders d to an SVG document. If opts.Flow is set, the nodes and
// links on that flow's path are visually highlighted and everything else
// is muted.
func SVG(d *model.Diagram, opts Options) ([]byte, error) {
	d2Text := transpile.ToD2(d)
	if opts.Flow != nil {
		d2Text = transpile.ToD2Flow(d, opts.Flow)
	}
	return svgFromD2(d2Text, opts)
}

// StepFrame is one rendered frame of a step-by-step flow playback.
type StepFrame struct {
	// Name is the frame's file basename without extension, e.g. "step-01"
	// or "step-04a" for a branch arm.
	Name string
	SVG  []byte
}

// SVGSteps renders one frame per step of flow (see transpile.FlowStepFrames
// for the branch-arm splitting rules), with the node/link set held
// structurally identical across frames so the layout coordinates are
// stable between them.
func SVGSteps(d *model.Diagram, flow *model.Flow, opts Options) ([]StepFrame, error) {
	frames := transpile.FlowStepFrames(flow)
	out := make([]StepFrame, 0, len(frames))
	for _, f := range frames {
		svg, err := svgFromD2(transpile.ToD2StepFrame(d, f.Cumulative), opts)
		if err != nil {
			return nil, fmt.Errorf("render frame %d%s: %w", f.Position, f.BranchArm, err)
		}
		out = append(out, StepFrame{
			Name: fmt.Sprintf("step-%02d%s", f.Position, f.BranchArm),
			SVG:  svg,
		})
	}
	return out, nil
}

// DefaultAnimateIntervalMS is the per-frame duration used by SVGAnimated.
const DefaultAnimateIntervalMS = 1200

// SVGAnimated renders flow as a single SVG that cycles through its step
// frames (see transpile.FlowStepFrames) using D2's animate-interval
// mechanism (d2renderers/d2animate): each frame is rendered independently
// and then composed into one SVG with a CSS @keyframes opacity animation
// that shows exactly one frame at a time.
func SVGAnimated(d *model.Diagram, flow *model.Flow, opts Options) ([]byte, error) {
	frames := transpile.FlowStepFrames(flow)
	if len(frames) == 0 {
		return nil, fmt.Errorf("flow %q has no steps", flow.Name)
	}

	renderOpts := newRenderOpts(opts)

	// d2svg.Render only emits a full standalone <svg>...</svg> document
	// (with its own XML declaration) when RenderOpts.MasterID is empty;
	// with MasterID set it emits a bare <g> fragment meant to be nested
	// inside a wrapping <svg>, which is what d2animate.Wrap expects. The
	// MasterID must be derived from a diagram's hash, so compile the first
	// frame once to obtain it before rendering any frame.
	firstDiagram, err := compileD2(transpile.ToD2StepFrame(d, frames[0].Cumulative), opts, renderOpts)
	if err != nil {
		return nil, fmt.Errorf("compile frame %d%s: %w", frames[0].Position, frames[0].BranchArm, err)
	}
	masterID, err := firstDiagram.HashID(renderOpts.Salt)
	if err != nil {
		return nil, fmt.Errorf("hash diagram: %w", err)
	}
	renderOpts.MasterID = masterID

	svgs := make([][]byte, 0, len(frames))
	var rootDiagram *d2target.Diagram
	for _, f := range frames {
		diagram, err := compileD2(transpile.ToD2StepFrame(d, f.Cumulative), opts, renderOpts)
		if err != nil {
			return nil, fmt.Errorf("compile frame %d%s: %w", f.Position, f.BranchArm, err)
		}
		svg, err := d2svg.Render(diagram, renderOpts)
		if err != nil {
			return nil, fmt.Errorf("render frame %d%s: %w", f.Position, f.BranchArm, err)
		}
		svgs = append(svgs, svg)
		rootDiagram = diagram
	}

	out, err := d2animate.Wrap(rootDiagram, svgs, *renderOpts, DefaultAnimateIntervalMS)
	if err != nil {
		return nil, fmt.Errorf("assemble animated SVG: %w", err)
	}
	return out, nil
}

func svgFromD2(d2Text string, opts Options) ([]byte, error) {
	renderOpts := newRenderOpts(opts)
	var diagram *d2target.Diagram
	var err error
	if len(opts.Positions) > 0 {
		diagram, err = compileD2Positioned(d2Text, opts, renderOpts)
	} else {
		diagram, err = compileD2(d2Text, opts, renderOpts)
	}
	if err != nil {
		return nil, err
	}
	out, err := d2svg.Render(diagram, renderOpts)
	if err != nil {
		return nil, fmt.Errorf("render SVG: %w", err)
	}
	return out, nil
}

// ComputedPositions renders d with the ordinary auto-layout path and
// returns the resulting top-left position of every node, keyed by node id.
// This is what `dc render --write-layout` persists to a
// <name>.layout.json sidecar file.
func ComputedPositions(d *model.Diagram, opts Options) (map[string]layout.Position, error) {
	renderOpts := newRenderOpts(opts)
	diagram, err := compileD2(transpile.ToD2(d), opts, renderOpts)
	if err != nil {
		return nil, err
	}
	nodeIDs := make(map[string]bool, len(d.Nodes))
	for _, n := range d.Nodes {
		nodeIDs[n.ID] = true
	}
	positions := make(map[string]layout.Position, len(diagram.Shapes))
	for _, s := range diagram.Shapes {
		if nodeIDs[s.ID] {
			positions[s.ID] = layout.Position{X: float64(s.Pos.X), Y: float64(s.Pos.Y)}
		}
	}
	return positions, nil
}

func newRenderOpts(opts Options) *d2svg.RenderOpts {
	renderOpts := &d2svg.RenderOpts{}
	if opts.ThemeID != nil {
		renderOpts.ThemeID = opts.ThemeID
	} else {
		renderOpts.ThemeID = &d2themescatalog.NeutralDefault.ID
	}
	return renderOpts
}

func compileD2(d2Text string, opts Options, renderOpts *d2svg.RenderOpts) (*d2target.Diagram, error) {
	layoutEngine := opts.Layout
	if layoutEngine == "" {
		layoutEngine = "dagre"
	}

	ruler, err := textmeasure.NewRuler()
	if err != nil {
		return nil, fmt.Errorf("create text ruler: %w", err)
	}

	compileOpts := &d2lib.CompileOptions{
		Layout:         go2.Pointer(layoutEngine),
		LayoutResolver: layoutResolver,
		Ruler:          ruler,
	}

	ctx := log.WithDefault(context.Background())
	diagram, _, err := d2lib.Compile(ctx, d2Text, compileOpts, renderOpts)
	if err != nil {
		return nil, fmt.Errorf("compile D2: %w", err)
	}
	return diagram, nil
}

func layoutResolver(engine string) (d2graph.LayoutGraph, error) {
	switch engine {
	case "dagre":
		return d2dagrelayout.DefaultLayout, nil
	case "elk":
		return d2elklayout.DefaultLayout, nil
	default:
		return nil, fmt.Errorf("unknown layout engine %q (want dagre or elk)", engine)
	}
}

// compileD2Positioned compiles and lays out d2Text exactly like compileD2,
// but afterwards overrides the top-left position of every node whose id is
// a key in opts.Positions. There is no OSS D2 layout engine that honors a
// per-node fixed position during layout itself (D2's `top`/`left`
// reserved keywords are only consumed by Terrastruct's proprietary
// plugins, not oss.terrastruct.com/d2's bundled dagre/elk — see
// docs/deviations.md, step 4.2), so this replicates d2lib.Compile's
// internal pipeline (compile -> theme -> dimensions -> layout -> export)
// by hand to get a hook between layout and export.
//
// Because positions are overridden after edge routing, edges are not
// rerouted to the new node position — acceptable for v0, whose only
// requirement is that a pinned node ends up at its given coordinate.
func compileD2Positioned(d2Text string, opts Options, renderOpts *d2svg.RenderOpts) (*d2target.Diagram, error) {
	layoutEngine := opts.Layout
	if layoutEngine == "" {
		layoutEngine = "dagre"
	}
	coreLayout, err := layoutResolver(layoutEngine)
	if err != nil {
		return nil, err
	}

	ruler, err := textmeasure.NewRuler()
	if err != nil {
		return nil, fmt.Errorf("create text ruler: %w", err)
	}

	g, config, err := d2compiler.Compile("", strings.NewReader(d2Text), &d2compiler.CompileOptions{})
	if err != nil {
		return nil, fmt.Errorf("compile D2: %w", err)
	}
	if config != nil {
		g.Data = config.Data
	}

	if err := g.ApplyTheme(*renderOpts.ThemeID); err != nil {
		return nil, fmt.Errorf("apply theme: %w", err)
	}

	ctx := log.WithDefault(context.Background())
	if len(g.Objects) > 0 {
		if err := g.SetDimensions(nil, ruler, nil, nil); err != nil {
			return nil, fmt.Errorf("set dimensions: %w", err)
		}
		graphInfo := d2layouts.NestedGraphInfo(g.Root)
		if err := d2layouts.LayoutNested(ctx, g, graphInfo, coreLayout, d2layouts.DefaultRouter); err != nil {
			return nil, fmt.Errorf("layout: %w", err)
		}
	}

	for _, obj := range g.Objects {
		if pos, ok := opts.Positions[obj.IDVal]; ok {
			obj.TopLeft = geo.NewPoint(pos.X, pos.Y)
		}
	}

	diagram, err := d2exporter.Export(ctx, g, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("export: %w", err)
	}
	if config == nil {
		config = &d2target.Config{}
	}
	config.ThemeID = renderOpts.ThemeID
	config.DarkThemeID = renderOpts.DarkThemeID
	config.Sketch = renderOpts.Sketch
	diagram.Config = config

	return diagram, nil
}
