// Package validate implements semantic validation rules for a parsed
// model.Diagram, as specified in docs/format.md and PLAN.md step 1.2.
//
// JSON Schema (schema/diagramcore.schema.json) catches structural errors;
// this package catches semantic ones: dangling references, unknown types,
// flow steps without a backing link, etc.
package validate

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/oleksii94/diagramcore/internal/model"
	"github.com/oleksii94/diagramcore/internal/parser"
)

// Error is a single semantic validation error.
type Error struct {
	File    string
	Line    int
	Code    string
	Message string
}

func (e Error) String() string {
	return fmt.Sprintf("%s:%d [%s] %s", e.File, e.Line, e.Code, e.Message)
}

var linkTypes = map[string]bool{
	"request":  true,
	"call":     true,
	"query":    true,
	"event":    true,
	"dataflow": true,
	"inherits": true,
	"contains": true,
}

// ValidateFile parses and semantically validates the diagram at path,
// following any `details` references transitively. Each referenced file
// (by canonical absolute path) is validated exactly once; cyclic
// references are not an error and do not cause infinite recursion.
//
// A non-nil error return means the root file itself could not be read or
// parsed — a program/execution error, distinct from the []Error slice of
// validation findings.
func ValidateFile(path string) ([]Error, error) {
	d, err := parser.Parse(path)
	if err != nil {
		return nil, err
	}
	visited := map[string]bool{d.Path: true}
	return validateDiagram(d, visited), nil
}

// ValidateString validates a single diagram given as raw yaml text, with
// no filesystem access: `details` sub-diagram references are not followed
// (there is no file to follow them to), so only structural/semantic rules
// scoped to this one diagram are checked. Meant for contexts without a
// real filesystem, such as the WASM validator (cmd/wasm).
func ValidateString(yamlText string) ([]Error, error) {
	d, err := parser.ParseString([]byte(yamlText))
	if err != nil {
		return nil, err
	}
	var errs []Error
	errs = append(errs, checkDuplicateNodeIDs(d)...)
	errs = append(errs, checkLinkNodesExist(d)...)
	errs = append(errs, checkUnknownTypes(d)...)
	errs = append(errs, checkParents(d)...)
	errs = append(errs, checkFlows(d)...)
	return errs, nil
}

func validateDiagram(d *model.Diagram, visited map[string]bool) []Error {
	var errs []Error
	errs = append(errs, checkDuplicateNodeIDs(d)...)
	errs = append(errs, checkLinkNodesExist(d)...)
	errs = append(errs, checkUnknownTypes(d)...)
	errs = append(errs, checkParents(d)...)
	errs = append(errs, checkFlows(d)...)
	errs = append(errs, checkDetails(d, visited)...)
	errs = append(errs, checkNotes(d)...)
	return errs
}

// checkParents validates `nodes[].parent` (phase 11, step 11.5): a
// non-empty parent must reference an existing node id (DC011), and
// following parent chains must never cycle back to a node already seen
// (DC012) — self-parenting (`parent: <own id>`) is the 1-node case of a
// cycle and is caught the same way.
func checkParents(d *model.Diagram) []Error {
	var errs []Error
	ids := nodeIDs(d)
	parentOf := map[string]string{}
	for _, n := range d.Nodes {
		if n.Parent != "" {
			parentOf[n.ID] = n.Parent
		}
	}
	for _, n := range d.Nodes {
		if n.Parent == "" {
			continue
		}
		if !ids[n.Parent] {
			errs = append(errs, Error{d.Path, n.Line, "DC011", fmt.Sprintf("node %q has nonexistent parent %q", n.ID, n.Parent)})
			continue
		}
		seen := map[string]bool{n.ID: true}
		cur := n.Parent
		for cur != "" {
			if seen[cur] {
				errs = append(errs, Error{d.Path, n.Line, "DC012", fmt.Sprintf("node %q parent chain cycles back through %q", n.ID, cur)})
				break
			}
			seen[cur] = true
			cur = parentOf[cur]
		}
	}
	return errs
}

// checkNotes validates the top-level `notes` section (PLAN2.md step
// 10.11): ids must be unique (DC009), and a non-empty `target` must
// reference either an existing node id or an existing link, written as
// "<from>-><to>" (DC010).
func checkNotes(d *model.Diagram) []Error {
	var errs []Error
	ids := nodeIDs(d)
	links := map[string]bool{}
	for _, l := range d.Links {
		links[linkPairKey(l.From, l.To)] = true
	}
	seen := map[string]bool{}
	for _, note := range d.Notes {
		if seen[note.ID] {
			errs = append(errs, Error{d.Path, note.Line, "DC009", fmt.Sprintf("duplicate note id %q", note.ID)})
		}
		seen[note.ID] = true
		if note.Target == "" {
			continue
		}
		if ids[note.Target] {
			continue
		}
		if from, to, ok := splitLinkTarget(note.Target); ok && links[linkPairKey(from, to)] {
			continue
		}
		errs = append(errs, Error{d.Path, note.Line, "DC010", fmt.Sprintf("note %q target %q references a nonexistent node or link", note.ID, note.Target)})
	}
	return errs
}

func splitLinkTarget(target string) (from, to string, ok bool) {
	before, after, found := strings.Cut(target, "->")
	return before, after, found
}

func checkDuplicateNodeIDs(d *model.Diagram) []Error {
	var errs []Error
	seen := map[string]bool{}
	for _, n := range d.Nodes {
		if seen[n.ID] {
			errs = append(errs, Error{d.Path, n.Line, "DC001", fmt.Sprintf("duplicate node id %q", n.ID)})
			continue
		}
		seen[n.ID] = true
	}
	return errs
}

func nodeIDs(d *model.Diagram) map[string]bool {
	ids := map[string]bool{}
	for _, n := range d.Nodes {
		ids[n.ID] = true
	}
	return ids
}

func checkLinkNodesExist(d *model.Diagram) []Error {
	var errs []Error
	ids := nodeIDs(d)
	for _, l := range d.Links {
		if !ids[l.From] {
			errs = append(errs, Error{d.Path, l.Line, "DC002", fmt.Sprintf("link references nonexistent node %q (from)", l.From)})
		}
		if !ids[l.To] {
			errs = append(errs, Error{d.Path, l.Line, "DC002", fmt.Sprintf("link references nonexistent node %q (to)", l.To)})
		}
	}
	return errs
}

// checkUnknownTypes flags unknown link types (DC003). Node types are
// deliberately NOT checked here (phase 11, step 11.5): any string is a
// valid node type — `custom_types` is now optional styling metadata, not
// a whitelist.
func checkUnknownTypes(d *model.Diagram) []Error {
	var errs []Error
	for _, l := range d.Links {
		if !linkTypes[l.Type] {
			errs = append(errs, Error{d.Path, l.Line, "DC003", fmt.Sprintf("unknown link type %q", l.Type)})
		}
	}
	return errs
}

// linkPairKey returns an order-independent key for a node id pair, since a
// flow step is valid in either direction as long as some link connects the
// two nodes (directed links may be walked in reverse as a "response").
func linkPairKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + "|" + b
}

func checkFlows(d *model.Diagram) []Error {
	var errs []Error
	ids := nodeIDs(d)
	pairs := map[string]bool{}
	for _, l := range d.Links {
		pairs[linkPairKey(l.From, l.To)] = true
	}

	checkStep := func(from, to string, line int) {
		fromOK, toOK := ids[from], ids[to]
		if !fromOK {
			errs = append(errs, Error{d.Path, line, "DC005", fmt.Sprintf("flow step references nonexistent node %q", from)})
		}
		if !toOK {
			errs = append(errs, Error{d.Path, line, "DC005", fmt.Sprintf("flow step references nonexistent node %q", to)})
		}
		if !fromOK || !toOK {
			return
		}
		if !pairs[linkPairKey(from, to)] {
			errs = append(errs, Error{d.Path, line, "DC004", fmt.Sprintf("flow step %s -> %s has no backing link", from, to)})
		}
	}

	for _, f := range d.Flows {
		if len(f.Steps) == 0 {
			errs = append(errs, Error{d.Path, f.Line, "DC007", fmt.Sprintf("flow %q has no steps", f.Name)})
			continue
		}
		for _, sb := range f.Steps {
			if sb.Step != nil {
				checkStep(sb.Step.From, sb.Step.To, sb.Step.Line)
				continue
			}
			b := sb.Branch
			if len(b.Then) == 0 {
				errs = append(errs, Error{d.Path, b.Line, "DC008", fmt.Sprintf("branch %q has no then steps", b.Condition)})
			}
			for _, s := range b.Then {
				checkStep(s.From, s.To, s.Line)
			}
			for _, s := range b.Else {
				checkStep(s.From, s.To, s.Line)
			}
		}
	}
	return errs
}

func canonicalPath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		return resolved
	}
	return abs
}

func checkDetails(d *model.Diagram, visited map[string]bool) []Error {
	var errs []Error
	for _, n := range d.Nodes {
		if n.Details == "" {
			continue
		}
		joined := filepath.Join(filepath.Dir(d.Path), n.Details)
		canon := canonicalPath(joined)
		if visited[canon] {
			continue
		}
		visited[canon] = true

		sub, err := parser.Parse(joined)
		if err != nil {
			errs = append(errs, Error{d.Path, n.Line, "DC006", fmt.Sprintf("details file %q does not exist or is not a valid diagram: %v", n.Details, err)})
			continue
		}
		errs = append(errs, validateDiagram(sub, visited)...)
	}
	return errs
}
