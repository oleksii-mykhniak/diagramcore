// Package transpile converts a model.Diagram into external diagram
// languages: D2 (native rendering path) and Mermaid (degraded text export).
package transpile

import (
	"fmt"
	"strings"

	"github.com/oleksii94/diagramcore/internal/model"
)

// d2ShapeByType maps DiagramCore node types to D2 shapes. Types not present
// here (including any custom_types) fall back to D2's default shape
// (rectangle), per docs/format.md.
var d2ShapeByType = map[string]string{
	"actor":   "person",
	"storage": "cylinder",
	"queue":   "queue",
}

// ToD2 renders d as D2 source text.
func ToD2(d *model.Diagram) string {
	var b strings.Builder

	for _, n := range d.Nodes {
		writeD2Node(&b, n)
	}
	if len(d.Nodes) > 0 && len(d.Links) > 0 {
		b.WriteString("\n")
	}
	for _, l := range d.Links {
		writeD2Link(&b, l)
	}

	return b.String()
}

func writeD2Node(b *strings.Builder, n model.Node) {
	label := n.Label
	if label == "" {
		label = n.ID
	}
	shape := d2ShapeByType[n.Type]
	if shape == "" && n.Type == "external" {
		// external gets a distinct look via style below rather than shape.
	}

	hasBody := shape != "" || n.Type == "external"
	if !hasBody {
		fmt.Fprintf(b, "%s: %s\n", n.ID, d2Quote(label))
		return
	}

	fmt.Fprintf(b, "%s: %s {\n", n.ID, d2Quote(label))
	if shape != "" {
		fmt.Fprintf(b, "  shape: %s\n", shape)
	}
	if n.Type == "external" {
		fmt.Fprintf(b, "  style.stroke-dash: 3\n")
	}
	b.WriteString("}\n")
}

func writeD2Link(b *strings.Builder, l model.Link) {
	arrow := "->"
	if !l.Directed {
		arrow = "--"
	}
	if l.Label != "" {
		fmt.Fprintf(b, "%s %s %s: %s\n", l.From, arrow, l.To, d2Quote(l.Label))
	} else {
		fmt.Fprintf(b, "%s %s %s\n", l.From, arrow, l.To)
	}
}

func d2Quote(s string) string {
	return fmt.Sprintf("%q", s)
}
