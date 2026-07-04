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
	for _, n := range d.Nodes {
		label := n.Label
		if label == "" {
			label = n.ID
		}
		fmt.Fprintf(&b, "- **%s** (%s): %s\n", n.ID, n.Type, label)
		if n.Description != "" {
			fmt.Fprintf(&b, "  %s\n", n.Description)
		}
		if n.AIContext != "" {
			fmt.Fprintf(&b, "  AI context: %s\n", n.AIContext)
		}
		if n.Details != "" {
			fmt.Fprintf(&b, "  Node %s has a detailed sub-diagram: %s\n", n.ID, n.Details)
		}
	}
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
