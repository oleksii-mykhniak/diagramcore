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
// embedding in GitHub/Notion markdown.
func ToMermaid(d *model.Diagram) string {
	var b strings.Builder
	b.WriteString("flowchart TD\n")

	for _, n := range d.Nodes {
		label := n.Label
		if label == "" {
			label = n.ID
		}
		if n.Details != "" {
			label += detailsMarker
		}
		open, close := "[", "]"
		if br, ok := mermaidShapeBrackets[n.Type]; ok {
			open, close = br[0], br[1]
		}
		fmt.Fprintf(&b, "  %s%s%q%s\n", n.ID, open, label, close)
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
