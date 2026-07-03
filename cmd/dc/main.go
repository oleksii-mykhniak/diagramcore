// Command dc is the DiagramCore CLI.
package main

import (
	stdcontext "context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/oleksii94/diagramcore/internal/context"
	"github.com/oleksii94/diagramcore/internal/layout"
	"github.com/oleksii94/diagramcore/internal/mcpserver"
	"github.com/oleksii94/diagramcore/internal/model"
	"github.com/oleksii94/diagramcore/internal/parser"
	"github.com/oleksii94/diagramcore/internal/render"
	"github.com/oleksii94/diagramcore/internal/transpile"
	"github.com/oleksii94/diagramcore/internal/validate"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: dc <command> [args]")
		os.Exit(2)
	}

	switch os.Args[1] {
	case "validate":
		os.Exit(runValidate(os.Args[2:]))
	case "context":
		os.Exit(runContext(os.Args[2:]))
	case "export":
		os.Exit(runExport(os.Args[2:]))
	case "render":
		os.Exit(runRender(os.Args[2:]))
	case "mcp":
		if err := mcpserver.Run(stdcontext.Background()); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
		os.Exit(2)
	}
}

type fileResult struct {
	File      string           `json:"file"`
	OK        bool             `json:"ok"`
	Errors    []validate.Error `json:"errors,omitempty"`
	ExecError string           `json:"exec_error,omitempty"`
}

func runValidate(args []string) int {
	fs := flag.NewFlagSet("validate", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "output machine-readable JSON")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	patterns := fs.Args()
	if len(patterns) == 0 {
		fmt.Fprintln(os.Stderr, "usage: dc validate [--json] <files...>")
		return 2
	}

	files := expandPatterns(patterns)

	var results []fileResult
	hadExecError := false
	hadValidationError := false
	okCount := 0

	for _, file := range files {
		errs, err := validate.ValidateFile(file)
		if err != nil {
			hadExecError = true
			results = append(results, fileResult{File: file, OK: false, ExecError: err.Error()})
			continue
		}
		results = append(results, fileResult{File: file, OK: len(errs) == 0, Errors: errs})
		if len(errs) == 0 {
			okCount++
		} else {
			hadValidationError = true
		}
	}

	if *jsonOut {
		printJSON(results)
	} else {
		printHuman(results, okCount, len(files))
	}

	switch {
	case hadExecError:
		return 2
	case hadValidationError:
		return 1
	default:
		return 0
	}
}

// expandPatterns resolves globs. A pattern with no glob metacharacters is
// kept as-is even if the file doesn't exist, so it surfaces as a per-file
// execution error rather than being silently dropped. A glob pattern that
// matches nothing is also kept as-is for the same reason.
func expandPatterns(patterns []string) []string {
	var files []string
	for _, p := range patterns {
		if !strings.ContainsAny(p, "*?[") {
			files = append(files, p)
			continue
		}
		matches, err := filepath.Glob(p)
		if err != nil || len(matches) == 0 {
			files = append(files, p)
			continue
		}
		sort.Strings(matches)
		files = append(files, matches...)
	}
	return files
}

func printHuman(results []fileResult, okCount, total int) {
	for _, r := range results {
		if r.ExecError != "" {
			fmt.Fprintf(os.Stderr, "%s: error: %s\n", r.File, r.ExecError)
			continue
		}
		for _, e := range r.Errors {
			fmt.Println(e.String())
		}
	}
	fmt.Printf("%d/%d files OK\n", okCount, total)
}

func printJSON(results []fileResult) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(results)
}

// runContext parses its own args (rather than using flag.FlagSet) because
// flag.Parse stops at the first non-flag argument, but the documented CLI
// puts flags after the positional <file> argument (`dc context f.yaml -o
// out.md`).
func runContext(args []string) int {
	usage := func() int {
		fmt.Fprintln(os.Stderr, "usage: dc context [-o out.md] [--deep] <file>")
		return 2
	}

	var out string
	var deep bool
	var files []string
	for i := 0; i < len(args); i++ {
		switch a := args[i]; {
		case a == "--deep":
			deep = true
		case a == "-o" || a == "--o":
			i++
			if i >= len(args) {
				return usage()
			}
			out = args[i]
		case strings.HasPrefix(a, "-o="):
			out = strings.TrimPrefix(a, "-o=")
		case strings.HasPrefix(a, "--o="):
			out = strings.TrimPrefix(a, "--o=")
		default:
			files = append(files, a)
		}
	}
	if len(files) != 1 {
		return usage()
	}
	file := files[0]

	errs, err := validate.ValidateFile(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: error: %s\n", file, err)
		return 2
	}
	if len(errs) > 0 {
		for _, e := range errs {
			fmt.Fprintln(os.Stderr, e.String())
		}
		return 1
	}

	d, err := parser.Parse(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: error: %s\n", file, err)
		return 2
	}

	md, err := context.Generate(d, deep)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: error: %s\n", file, err)
		return 2
	}

	if out == "" {
		fmt.Print(md)
		return 0
	}
	if err := os.WriteFile(out, []byte(md), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %s\n", out, err)
		return 2
	}
	return 0
}

// runExport parses its own args for the same reason as runContext: flags
// follow the positional <file> in the documented CLI form.
func runExport(args []string) int {
	usage := func() int {
		fmt.Fprintln(os.Stderr, "usage: dc export [-o out.<ext>] --to d2|mermaid <file>")
		return 2
	}

	var out, to string
	var files []string
	for i := 0; i < len(args); i++ {
		switch a := args[i]; {
		case a == "--to" || a == "-to":
			i++
			if i >= len(args) {
				return usage()
			}
			to = args[i]
		case strings.HasPrefix(a, "--to="):
			to = strings.TrimPrefix(a, "--to=")
		case a == "-o" || a == "--o":
			i++
			if i >= len(args) {
				return usage()
			}
			out = args[i]
		case strings.HasPrefix(a, "-o="):
			out = strings.TrimPrefix(a, "-o=")
		case strings.HasPrefix(a, "--o="):
			out = strings.TrimPrefix(a, "--o=")
		default:
			files = append(files, a)
		}
	}
	if len(files) != 1 || to == "" {
		return usage()
	}
	file := files[0]

	errs, err := validate.ValidateFile(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: error: %s\n", file, err)
		return 2
	}
	if len(errs) > 0 {
		for _, e := range errs {
			fmt.Fprintln(os.Stderr, e.String())
		}
		return 1
	}

	d, err := parser.Parse(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: error: %s\n", file, err)
		return 2
	}

	var text string
	switch to {
	case "d2":
		text = transpile.ToD2(d)
	case "mermaid":
		text = transpile.ToMermaid(d)
	default:
		fmt.Fprintf(os.Stderr, "unknown export target %q (want d2 or mermaid)\n", to)
		return 2
	}

	if out == "" {
		fmt.Print(text)
		return 0
	}
	if err := os.WriteFile(out, []byte(text), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %s\n", out, err)
		return 2
	}
	return 0
}

// runRender parses its own args for the same reason as runContext/runExport.
func runRender(args []string) int {
	usage := func() int {
		fmt.Fprintln(os.Stderr, "usage: dc render [-o out.svg|dir/] [--layout dagre|elk] [--layout-file <path>] [--write-layout] [--flow <name>] [--steps|--animate] <file>")
		return 2
	}

	var out, layoutEngine, layoutFile, flowName string
	var steps, animate, writeLayout bool
	var files []string
	for i := 0; i < len(args); i++ {
		switch a := args[i]; {
		case a == "--layout":
			i++
			if i >= len(args) {
				return usage()
			}
			layoutEngine = args[i]
		case strings.HasPrefix(a, "--layout="):
			layoutEngine = strings.TrimPrefix(a, "--layout=")
		case a == "--layout-file":
			i++
			if i >= len(args) {
				return usage()
			}
			layoutFile = args[i]
		case strings.HasPrefix(a, "--layout-file="):
			layoutFile = strings.TrimPrefix(a, "--layout-file=")
		case a == "--write-layout":
			writeLayout = true
		case a == "--flow":
			i++
			if i >= len(args) {
				return usage()
			}
			flowName = args[i]
		case strings.HasPrefix(a, "--flow="):
			flowName = strings.TrimPrefix(a, "--flow=")
		case a == "--steps":
			steps = true
		case a == "--animate":
			animate = true
		case a == "-o" || a == "--o":
			i++
			if i >= len(args) {
				return usage()
			}
			out = args[i]
		case strings.HasPrefix(a, "-o="):
			out = strings.TrimPrefix(a, "-o=")
		case strings.HasPrefix(a, "--o="):
			out = strings.TrimPrefix(a, "--o=")
		default:
			files = append(files, a)
		}
	}
	if len(files) != 1 {
		return usage()
	}
	file := files[0]
	if out == "" {
		fmt.Fprintln(os.Stderr, "dc render requires -o <out.svg|dir/>")
		return 2
	}
	if steps && animate {
		fmt.Fprintln(os.Stderr, "dc render: --steps and --animate are mutually exclusive")
		return 2
	}
	if (steps || animate) && flowName == "" {
		fmt.Fprintln(os.Stderr, "dc render --steps/--animate requires --flow <name>")
		return 2
	}

	errs, err := validate.ValidateFile(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: error: %s\n", file, err)
		return 2
	}
	if len(errs) > 0 {
		for _, e := range errs {
			fmt.Fprintln(os.Stderr, e.String())
		}
		return 1
	}

	d, err := parser.Parse(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: error: %s\n", file, err)
		return 2
	}

	renderOpts := render.Options{Layout: layoutEngine}
	var flow *model.Flow
	if flowName != "" {
		flow, err = findFlow(d, flowName)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		renderOpts.Flow = flow
	}

	layoutPath := layoutFile
	if layoutPath == "" {
		layoutPath = layout.PathFor(file)
	}
	if writeLayout {
		positions, err := render.ComputedPositions(d, render.Options{Layout: layoutEngine})
		if err != nil {
			fmt.Fprintf(os.Stderr, "%s: compute layout error: %s\n", file, err)
			return 2
		}
		if err := layout.Save(layoutPath, positions); err != nil {
			fmt.Fprintf(os.Stderr, "write layout %s: %s\n", layoutPath, err)
			return 2
		}
		renderOpts.Positions = positions
	} else if lf, err := layout.Load(layoutPath); err != nil {
		fmt.Fprintf(os.Stderr, "load layout %s: %s\n", layoutPath, err)
		return 2
	} else if lf != nil {
		knownIDs := make(map[string]bool, len(d.Nodes))
		for _, n := range d.Nodes {
			knownIDs[n.ID] = true
		}
		for _, w := range lf.UnknownNodeWarnings(layout.DefaultView, knownIDs) {
			fmt.Fprintf(os.Stderr, "warning: %s\n", w)
		}
		renderOpts.Positions = lf.Positions(layout.DefaultView)
	}

	if steps {
		return renderSteps(d, flow, renderOpts, out)
	}

	var svg []byte
	if animate {
		svg, err = render.SVGAnimated(d, flow, renderOpts)
	} else {
		svg, err = render.SVG(d, renderOpts)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: render error: %s\n", file, err)
		return 2
	}

	if err := os.WriteFile(out, svg, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %s\n", out, err)
		return 2
	}
	return 0
}

func renderSteps(d *model.Diagram, flow *model.Flow, opts render.Options, dir string) int {
	frames, err := render.SVGSteps(d, flow, opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "render steps error: %s\n", err)
		return 2
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "create %s: %s\n", dir, err)
		return 2
	}
	for _, f := range frames {
		path := filepath.Join(dir, f.Name+".svg")
		if err := os.WriteFile(path, f.SVG, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write %s: %s\n", path, err)
			return 2
		}
	}
	return 0
}

// findFlow looks up a flow by name, returning an error listing the
// available flow names if it isn't found.
func findFlow(d *model.Diagram, name string) (*model.Flow, error) {
	for i := range d.Flows {
		if d.Flows[i].Name == name {
			return &d.Flows[i], nil
		}
	}
	names := make([]string, len(d.Flows))
	for i, f := range d.Flows {
		names[i] = f.Name
	}
	return nil, fmt.Errorf("unknown flow %q; available flows: %s", name, strings.Join(names, ", "))
}
