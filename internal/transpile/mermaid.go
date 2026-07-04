package transpile

import (
	"fmt"
	"strings"

	"github.com/oleksii94/diagramcore/internal/model"
)

// mermaidShapeOpen/Close bracket pairs by node type. Types without an entry
// (including custom_types) fall back to the default rectangle `[ ]` shape.
var mermaidShapeBrackets = map[string][2]string{
	"actor":   {"([", "])"}, // stadium, closest built-in to a person shape
	"storage": {"[(", ")]"}, // cylinder
	"queue":   {"[(", ")]"}, // cylinder (Mermaid has no dedicated queue shape)
}

// ToMermaid renders d as a Mermaid `flowchart TD` diagram. This is a
// degraded export relative to D2: no guaranteed styling, meant for
// embedding in GitHub/Notion markdown. `parent:` (phase 11, step 11.5)
// nests a node's children inside a `subgraph` block instead of drawing
// them as siblings.
func ToMermaid(d *model.Diagram) string {
	var b strings.Builder
	b.WriteString("flowchart TD\n")

	ids := make(map[string]bool, len(d.Nodes))
	for _, n := range d.Nodes {
		ids[n.ID] = true
	}
	childrenOf := map[string][]model.Node{}
	var topLevel []model.Node
	for _, n := range d.Nodes {
		if n.Parent != "" && n.Parent != n.ID && ids[n.Parent] {
			childrenOf[n.Parent] = append(childrenOf[n.Parent], n)
		} else {
			topLevel = append(topLevel, n)
		}
	}

	var writeNode func(n model.Node, indent string)
	writeNode = func(n model.Node, indent string) {
		label := n.Label
		if label == "" {
			label = n.ID
		}
		if children := childrenOf[n.ID]; len(children) > 0 {
			fmt.Fprintf(&b, "%ssubgraph %s[%q]\n", indent, n.ID, label)
			for _, c := range children {
				writeNode(c, indent+"  ")
			}
			fmt.Fprintf(&b, "%send\n", indent)
			return
		}
		if n.Details != "" {
			label += detailsMarker
		}
		open, close := "[", "]"
		if br, ok := mermaidShapeBrackets[n.Type]; ok {
			open, close = br[0], br[1]
		}
		fmt.Fprintf(&b, "%s%s%s%q%s\n", indent, n.ID, open, label, close)
	}
	for _, n := range topLevel {
		writeNode(n, "  ")
	}
	for _, n := range d.Nodes {
		if n.Details == "" {
			continue
		}
		fmt.Fprintf(&b, "  click %s %q\n", n.ID, DetailsSVGPath(n.Details))
	}

	for _, l := range d.Links {
		arrow := "-->"
		if !l.Directed {
			arrow = "---"
		}
		if l.Label != "" {
			fmt.Fprintf(&b, "  %s %s|%q| %s\n", l.From, arrow, l.Label, l.To)
		} else {
			fmt.Fprintf(&b, "  %s %s %s\n", l.From, arrow, l.To)
		}
	}

	return b.String()
}
