// Package context generates a markdown AI-context document from a
// validated model.Diagram, per PLAN.md step 2.1 / docs/format.md.
package context

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/oleksii94/diagramcore/internal/model"
	"github.com/oleksii94/diagramcore/internal/parser"
)

// Generate renders d (and, if deep is true, any details sub-diagrams it
// transitively references) as a single markdown document. Sub-diagrams are
// followed with a visited-set keyed by canonical absolute path, so each is
// inlined at most once; a repeated or cyclic reference is left as the plain
// "has a detailed sub-diagram" mention with no further inlining.
func Generate(d *model.Diagram, deep bool) (string, error) {
	visited := map[string]bool{d.Path: true}
	return generate(d, deep, visited, 0)
}

func generate(d *model.Diagram, deep bool, visited map[string]bool, depth int) (string, error) {
	var b strings.Builder

	if depth == 0 {
		fmt.Fprintf(&b, "# %s\n\n", d.Meta.Title)
	} else {
		fmt.Fprintf(&b, "## Sub-diagram: %s\n\n", d.Meta.Title)
	}
	if d.Meta.Purpose != "" {
		fmt.Fprintf(&b, "**Purpose:** %s\n\n", d.Meta.Purpose)
	}
	if d.Meta.Audience != "" {
		fmt.Fprintf(&b, "**Audience:** %s\n\n", d.Meta.Audience)
	}

	fmt.Fprintf(&b, "### Components\n\n")
	writeComponents(&b, d.Nodes)
	fmt.Fprintln(&b)

	fmt.Fprintf(&b, "### Links\n\n")
	for _, l := range d.Links {
		arrow := "->"
		if !l.Directed {
			arrow = "--"
		}
		label := ""
		if l.Label != "" {
			label = ": " + l.Label
		}
		fmt.Fprintf(&b, "- %s %s %s (%s)%s\n", l.From, arrow, l.To, l.Type, label)
	}
	fmt.Fprintln(&b)

	for _, f := range d.Flows {
		fmt.Fprintf(&b, "### Flow: %s\n\n", f.Name)
		writeSteps(&b, f.Steps, 1)
		fmt.Fprintln(&b)
	}

	if len(d.Notes) > 0 {
		fmt.Fprintf(&b, "### Notes\n\n")
		for _, note := range d.Notes {
			if note.Target != "" {
				fmt.Fprintf(&b, "- (%s) %s\n", note.Target, note.Text)
			} else {
				fmt.Fprintf(&b, "- %s\n", note.Text)
			}
		}
		fmt.Fprintln(&b)
	}

	if deep {
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
				return "", fmt.Errorf("inline details %q: %w", n.Details, err)
			}
			subMd, err := generate(sub, deep, visited, depth+1)
			if err != nil {
				return "", err
			}
			b.WriteString(subMd)
		}
	}

	return b.String(), nil
}

// writeComponents lists nodes, indenting a node's `parent:` children
// underneath it (phase 11, step 11.5) so the AI-context markdown shows
// the containment hierarchy instead of a flat list. Nodes with no
// parent (or whose declared parent doesn't exist) are top-level; a
// cyclic parent chain is broken by simply not descending into an
// already-visited id, so this never infinite-loops on invalid input
// (`dc validate` is what actually rejects those as DC011/DC012).
func writeComponents(b *strings.Builder, nodes []model.Node) {
	ids := make(map[string]bool, len(nodes))
	for _, n := range nodes {
		ids[n.ID] = true
	}
	childrenOf := map[string][]model.Node{}
	var topLevel []model.Node
	for _, n := range nodes {
		if n.Parent != "" && n.Parent != n.ID && ids[n.Parent] {
			childrenOf[n.Parent] = append(childrenOf[n.Parent], n)
		} else {
			topLevel = append(topLevel, n)
		}
	}

	var write func(n model.Node, depth int, seen map[string]bool)
	write = func(n model.Node, depth int, seen map[string]bool) {
		prefix := strings.Repeat("  ", depth)
		label := n.Label
		if label == "" {
			label = n.ID
		}
		fmt.Fprintf(b, "%s- **%s** (%s): %s\n", prefix, n.ID, n.Type, label)
		if n.Description != "" {
			fmt.Fprintf(b, "%s  %s\n", prefix, n.Description)
		}
		if n.AIContext != "" {
			fmt.Fprintf(b, "%s  AI context: %s\n", prefix, n.AIContext)
		}
		if n.Details != "" {
			fmt.Fprintf(b, "%s  Node %s has a detailed sub-diagram: %s\n", prefix, n.ID, n.Details)
		}
		seen[n.ID] = true
		for _, c := range childrenOf[n.ID] {
			if seen[c.ID] {
				continue
			}
			write(c, depth+1, seen)
		}
	}
	seen := map[string]bool{}
	for _, n := range topLevel {
		write(n, 0, seen)
	}
}

func writeSteps(b *strings.Builder, steps []model.StepOrBranch, indent int) {
	prefix := strings.Repeat("  ", indent-1)
	n := 1
	for _, sb := range steps {
		if sb.Step != nil {
			fmt.Fprintf(b, "%s%d. %s -> %s: %s\n", prefix, n, sb.Step.From, sb.Step.To, sb.Step.Note)
			n++
			continue
		}
		br := sb.Branch
		fmt.Fprintf(b, "%s%d. Branch: %s\n", prefix, n, br.Condition)
		n++
		fmt.Fprintf(b, "%s   - Then:\n", prefix)
		writeStepList(b, br.Then, indent+2)
		if len(br.Else) > 0 {
			fmt.Fprintf(b, "%s   - Else:\n", prefix)
			writeStepList(b, br.Else, indent+2)
		}
	}
}

func writeStepList(b *strings.Builder, steps []model.Step, indent int) {
	prefix := strings.Repeat("  ", indent-1)
	for i, s := range steps {
		fmt.Fprintf(b, "%s%d. %s -> %s: %s\n", prefix, i+1, s.From, s.To, s.Note)
	}
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
