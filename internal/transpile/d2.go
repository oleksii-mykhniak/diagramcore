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
	emphasisCurrent
	emphasisPath
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
	paths := d2Paths(d)

	for _, n := range d.Nodes {
		em := emphasisNone
		if hl != nil {
			if hl.nodeIDs[n.ID] {
				em = emphasisPath
			} else {
				em = emphasisMuted
			}
		}
		writeD2Node(&b, n, paths[n.ID], em)
	}
	if len(d.Nodes) > 0 && len(d.Links) > 0 {
		b.WriteString("\n")
	}
	for _, l := range d.Links {
		em := emphasisNone
		if hl != nil {
			if hl.linkKeys[pairKey(l.From, l.To)] {
				em = emphasisPath
			} else {
				em = emphasisMuted
			}
		}
		writeD2Link(&b, l, paths, em)
	}

	return b.String()
}

// d2Paths resolves every node's dot-joined D2 path from its `parent:`
// chain (phase 11, step 11.5) — e.g. `gcp.k8s.pods` for a node `pods`
// with `parent: k8s` where `k8s` itself has `parent: gcp`. D2 renders a
// dotted id as nested containers natively. Cycles (which `dc validate`
// rejects as DC012, but this package doesn't re-check) are broken by
// stopping the walk the second time an id is seen, so rendering never
// infinite-loops on an invalid diagram.
func d2Paths(d *model.Diagram) map[string]string {
	byID := make(map[string]model.Node, len(d.Nodes))
	for _, n := range d.Nodes {
		byID[n.ID] = n
	}
	paths := make(map[string]string, len(d.Nodes))
	for _, n := range d.Nodes {
		var segments []string
		seen := map[string]bool{}
		cur := n.ID
		for cur != "" && !seen[cur] {
			seen[cur] = true
			segments = append([]string{cur}, segments...)
			parent, ok := byID[cur]
			if !ok {
				break
			}
			cur = parent.Parent
		}
		paths[n.ID] = strings.Join(segments, ".")
	}
	return paths
}

// ToD2StepFrame renders a single frame of a step-by-step flow playback:
// cumulative is the ordered list of steps reached so far (inclusive of the
// current one, which is always the last element). Steps before the last
// get the "path" (already-visited) style; the last step gets the brighter
// "current" style; nodes/links untouched by cumulative are muted.
//
// The full node/link set is always emitted (only styling changes across
// frames), which keeps the D2 graph structurally identical between frames
// so the layout engine places nodes at the same coordinates in every
// frame.
func ToD2StepFrame(d *model.Diagram, cumulative []model.Step) string {
	currentNodeIDs := map[string]bool{}
	visitedNodeIDs := map[string]bool{}
	currentLinkKeys := map[string]bool{}
	visitedLinkKeys := map[string]bool{}

	for i, s := range cumulative {
		visitedNodeIDs[s.From] = true
		visitedNodeIDs[s.To] = true
		visitedLinkKeys[pairKey(s.From, s.To)] = true
		if i == len(cumulative)-1 {
			currentNodeIDs[s.From] = true
			currentNodeIDs[s.To] = true
			currentLinkKeys[pairKey(s.From, s.To)] = true
		}
	}

	var b strings.Builder
	paths := d2Paths(d)
	for _, n := range d.Nodes {
		em := emphasisMuted
		switch {
		case currentNodeIDs[n.ID]:
			em = emphasisCurrent
		case visitedNodeIDs[n.ID]:
			em = emphasisPath
		}
		writeD2Node(&b, n, paths[n.ID], em)
	}
	if len(d.Nodes) > 0 && len(d.Links) > 0 {
		b.WriteString("\n")
	}
	for _, l := range d.Links {
		key := pairKey(l.From, l.To)
		em := emphasisMuted
		switch {
		case currentLinkKeys[key]:
			em = emphasisCurrent
		case visitedLinkKeys[key]:
			em = emphasisPath
		}
		writeD2Link(&b, l, paths, em)
	}
	return b.String()
}

// FlowStepFrames flattens flow into the ordered sequence of cumulative-step
// frames used by ToD2StepFrame / dc render --flow X --steps: one frame per
// plain Step, and one frame per non-empty branch arm (then/else), each
// labeled with the 1-based position of its step in flow.Steps and, for
// branch arms, a letter ("a" for then, "b" for else).
type FlowFrame struct {
	Position   int    // 1-based index into flow.Steps
	BranchArm  string // "" for a plain step, "a" (then) or "b" (else) for a branch
	Cumulative []model.Step
}

func FlowStepFrames(flow *model.Flow) []FlowFrame {
	var frames []FlowFrame
	var cumulative []model.Step

	for i, sb := range flow.Steps {
		pos := i + 1
		if sb.Step != nil {
			cumulative = append(cumulative, *sb.Step)
			frames = append(frames, FlowFrame{
				Position:   pos,
				Cumulative: append([]model.Step{}, cumulative...),
			})
			continue
		}

		b := sb.Branch
		if len(b.Then) > 0 {
			frameSteps := append(append([]model.Step{}, cumulative...), b.Then...)
			frames = append(frames, FlowFrame{Position: pos, BranchArm: "a", Cumulative: frameSteps})
		}
		if len(b.Else) > 0 {
			frameSteps := append(append([]model.Step{}, cumulative...), b.Else...)
			frames = append(frames, FlowFrame{Position: pos, BranchArm: "b", Cumulative: frameSteps})
		}
		// A branch is treated as the end of the linear cumulative path: any
		// steps declared after a branch (not used by any current example)
		// would continue from the "then" arm.
		cumulative = append(cumulative, b.Then...)
	}

	return frames
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

// detailsMarker is appended to a node's label when it has a details
// sub-diagram, in every export format (D2, SVG, Mermaid).
const detailsMarker = " ⊞"

// DetailsSVGPath rewrites a details reference (a path to another
// *.dc.yaml file, relative to the file that declares it) into the path of
// that sub-diagram's rendered SVG, for use as a link/href in exports.
func DetailsSVGPath(details string) string {
	if strings.HasSuffix(details, ".dc.yaml") {
		return strings.TrimSuffix(details, ".dc.yaml") + ".svg"
	}
	return details
}

func writeD2Node(b *strings.Builder, n model.Node, path string, em emphasis) {
	label := n.Label
	if label == "" {
		label = n.ID
	}
	hasDetails := n.Details != ""
	if hasDetails {
		label += detailsMarker
	}
	shape := d2ShapeByType[n.Type]

	hasBody := shape != "" || n.Type == "external" || em != emphasisNone || hasDetails
	if !hasBody {
		fmt.Fprintf(b, "%s: %s\n", path, d2Quote(label))
		return
	}

	fmt.Fprintf(b, "%s: %s {\n", path, d2Quote(label))
	if shape != "" {
		fmt.Fprintf(b, "  shape: %s\n", shape)
	}
	if n.Type == "external" {
		fmt.Fprintf(b, "  style.stroke-dash: 3\n")
	}
	if hasDetails {
		fmt.Fprintf(b, "  style.double-border: true\n")
		fmt.Fprintf(b, "  link: %s\n", d2Quote(DetailsSVGPath(n.Details)))
	}
	switch em {
	case emphasisCurrent:
		fmt.Fprintf(b, "  style.stroke: %q\n", "#e04b4b")
		fmt.Fprintf(b, "  style.stroke-width: 5\n")
	case emphasisPath:
		fmt.Fprintf(b, "  style.stroke: %q\n", "#e04b4b")
		fmt.Fprintf(b, "  style.stroke-width: 3\n")
	case emphasisMuted:
		fmt.Fprintf(b, "  style.opacity: 0.35\n")
	}
	b.WriteString("}\n")
}

func writeD2Link(b *strings.Builder, l model.Link, paths map[string]string, em emphasis) {
	arrow := "->"
	if !l.Directed {
		arrow = "--"
	}
	from, to := l.From, l.To
	if p, ok := paths[from]; ok {
		from = p
	}
	if p, ok := paths[to]; ok {
		to = p
	}
	fmt.Fprintf(b, "%s %s %s", from, arrow, to)
	if l.Label != "" {
		fmt.Fprintf(b, ": %s", d2Quote(l.Label))
	}
	if em == emphasisNone {
		b.WriteString("\n")
		return
	}
	b.WriteString(" {\n")
	switch em {
	case emphasisCurrent:
		fmt.Fprintf(b, "  style.stroke: %q\n", "#e04b4b")
		fmt.Fprintf(b, "  style.stroke-width: 5\n")
	case emphasisPath:
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
