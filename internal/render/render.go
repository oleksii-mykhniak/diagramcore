// Package render turns a model.Diagram into an SVG image via the D2
// rendering pipeline (internal/transpile -> d2lib -> d2svg).
package render

import (
	"context"
	"fmt"

	"oss.terrastruct.com/d2/d2graph"
	"oss.terrastruct.com/d2/d2layouts/d2dagrelayout"
	"oss.terrastruct.com/d2/d2layouts/d2elklayout"
	"oss.terrastruct.com/d2/d2lib"
	"oss.terrastruct.com/d2/d2renderers/d2svg"
	"oss.terrastruct.com/d2/d2themes/d2themescatalog"
	"oss.terrastruct.com/d2/lib/log"
	"oss.terrastruct.com/d2/lib/textmeasure"
	"oss.terrastruct.com/util-go/go2"

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

func svgFromD2(d2Text string, opts Options) ([]byte, error) {
	layout := opts.Layout
	if layout == "" {
		layout = "dagre"
	}

	ruler, err := textmeasure.NewRuler()
	if err != nil {
		return nil, fmt.Errorf("create text ruler: %w", err)
	}

	compileOpts := &d2lib.CompileOptions{
		Layout: go2.Pointer(layout),
		LayoutResolver: func(engine string) (d2graph.LayoutGraph, error) {
			switch engine {
			case "dagre":
				return d2dagrelayout.DefaultLayout, nil
			case "elk":
				return d2elklayout.DefaultLayout, nil
			default:
				return nil, fmt.Errorf("unknown layout engine %q (want dagre or elk)", engine)
			}
		},
		Ruler: ruler,
	}

	renderOpts := &d2svg.RenderOpts{}
	if opts.ThemeID != nil {
		renderOpts.ThemeID = opts.ThemeID
	} else {
		renderOpts.ThemeID = &d2themescatalog.NeutralDefault.ID
	}

	ctx := log.WithDefault(context.Background())
	diagram, _, err := d2lib.Compile(ctx, d2Text, compileOpts, renderOpts)
	if err != nil {
		return nil, fmt.Errorf("compile D2: %w", err)
	}

	out, err := d2svg.Render(diagram, renderOpts)
	if err != nil {
		return nil, fmt.Errorf("render SVG: %w", err)
	}
	return out, nil
}
