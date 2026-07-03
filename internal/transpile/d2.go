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

// emphasis controls the flow-highlight styling of a node or link.
type emphasis int

const (
	emphasisNone emphasis = iota
	emphasisHighlight
	emphasisMuted
)

// ToD2 renders d as D2 source text.
func ToD2(d *model.Diagram) string {
	return toD2(d, nil)
}

// ToD2Flow renders d as D2 source text with the nodes and links on flow's
// path visually accented, and everything else muted.
func ToD2Flow(d *model.Diagram, flow *model.Flow) string {
	nodeIDs, linkKeys := flowParticipants(flow)
	return toD2(d, &flowHighlight{nodeIDs: nodeIDs, linkKeys: linkKeys})
}

type flowHighlight struct {
	nodeIDs  map[string]bool
	linkKeys map[string]bool
}

func toD2(d *model.Diagram, hl *flowHighlight) string {
	var b strings.Builder

	for _, n := range d.Nodes {
		em := emphasisNone
		if hl != nil {
			if hl.nodeIDs[n.ID] {
				em = emphasisHighlight
			} else {
				em = emphasisMuted
			}
		}
		writeD2Node(&b, n, em)
	}
	if len(d.Nodes) > 0 && len(d.Links) > 0 {
		b.WriteString("\n")
	}
	for _, l := range d.Links {
		em := emphasisNone
		if hl != nil {
			if hl.linkKeys[pairKey(l.From, l.To)] {
				em = emphasisHighlight
			} else {
				em = emphasisMuted
			}
		}
		writeD2Link(&b, l, em)
	}

	return b.String()
}

// flowParticipants collects the node ids and unordered from/to link keys
// touched by any step (including inside branches) of flow.
func flowParticipants(flow *model.Flow) (nodeIDs, linkKeys map[string]bool) {
	nodeIDs = map[string]bool{}
	linkKeys = map[string]bool{}
	add := func(s model.Step) {
		nodeIDs[s.From] = true
		nodeIDs[s.To] = true
		linkKeys[pairKey(s.From, s.To)] = true
	}
	for _, sb := range flow.Steps {
		if sb.Step != nil {
			add(*sb.Step)
			continue
		}
		for _, s := range sb.Branch.Then {
			add(s)
		}
		for _, s := range sb.Branch.Else {
			add(s)
		}
	}
	return nodeIDs, linkKeys
}

// pairKey is an order-independent key for a node id pair: a flow step is
// associated with a link regardless of which one is "from" vs "to" (see
// docs/format.md on response/reverse traversal).
func pairKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + "|" + b
}

func writeD2Node(b *strings.Builder, n model.Node, em emphasis) {
	label := n.Label
	if label == "" {
		label = n.ID
	}
	shape := d2ShapeByType[n.Type]

	hasBody := shape != "" || n.Type == "external" || em != emphasisNone
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
	switch em {
	case emphasisHighlight:
		fmt.Fprintf(b, "  style.stroke: %q\n", "#e04b4b")
		fmt.Fprintf(b, "  style.stroke-width: 3\n")
	case emphasisMuted:
		fmt.Fprintf(b, "  style.opacity: 0.35\n")
	}
	b.WriteString("}\n")
}

func writeD2Link(b *strings.Builder, l model.Link, em emphasis) {
	arrow := "->"
	if !l.Directed {
		arrow = "--"
	}
	fmt.Fprintf(b, "%s %s %s", l.From, arrow, l.To)
	if l.Label != "" {
		fmt.Fprintf(b, ": %s", d2Quote(l.Label))
	}
	if em == emphasisNone {
		b.WriteString("\n")
		return
	}
	b.WriteString(" {\n")
	switch em {
	case emphasisHighlight:
		fmt.Fprintf(b, "  style.stroke: %q\n", "#e04b4b")
		fmt.Fprintf(b, "  style.stroke-width: 3\n")
	case emphasisMuted:
		fmt.Fprintf(b, "  style.opacity: 0.35\n")
	}
	b.WriteString("}\n")
}

func d2Quote(s string) string {
	return fmt.Sprintf("%q", s)
}
