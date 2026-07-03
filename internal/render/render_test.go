package render

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/oleksii94/diagramcore/internal/parser"
)

func TestSVGBothLayouts(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}

	for _, layout := range []string{"dagre", "elk"} {
		t.Run(layout, func(t *testing.T) {
			out, err := SVG(d, Options{Layout: layout})
			if err != nil {
				t.Fatalf("SVG(layout=%s) failed: %v", layout, err)
			}
			if !bytes.Contains(out, []byte("<svg")) {
				n := len(out)
				if n > 200 {
					n = 200
				}
				t.Errorf("output does not contain '<svg': %s", out[:n])
			}
			if !strings.Contains(string(out), "Gateway") {
				t.Errorf("output does not contain node text %q", "Gateway")
			}
		})
	}
}

func TestSVGFlowHighlight(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}
	flow := &d.Flows[1] // doesn't touch OAuthProvider, per transpile tests

	base, err := SVG(d, Options{})
	if err != nil {
		t.Fatalf("SVG(base) failed: %v", err)
	}
	highlighted, err := SVG(d, Options{Flow: flow})
	if err != nil {
		t.Fatalf("SVG(flow) failed: %v", err)
	}

	if bytes.Equal(base, highlighted) {
		t.Fatal("flow-highlighted SVG is byte-identical to the base SVG")
	}
	if !bytes.Contains(highlighted, []byte("e04b4b")) {
		t.Error("flow-highlighted SVG does not contain the accent stroke color for on-path edges")
	}
}

// gatewayPosition extracts the x/y of the Gateway node's shape group. The
// node's D2-generated group class is the base64 of its id ("Gateway" ->
// "R2F0ZXdheQ==" per D2's shape id encoding).
var gatewayGroupRe = regexp.MustCompile(`class="R2F0ZXdheQ==">.*?x="([\d.]+)"\s+y="([\d.]+)"`)

func gatewayPosition(t *testing.T, svg []byte) string {
	t.Helper()
	m := gatewayGroupRe.FindSubmatch(svg)
	if m == nil {
		t.Fatalf("could not find Gateway shape position in SVG")
	}
	return string(m[1]) + "," + string(m[2])
}

func TestSVGStepsAuthSystemSixFrames(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}
	flow := &d.Flows[0] // 6 plain steps, no branch

	frames, err := SVGSteps(d, flow, Options{})
	if err != nil {
		t.Fatalf("SVGSteps failed: %v", err)
	}
	if len(frames) != 6 {
		t.Fatalf("got %d frames, want 6", len(frames))
	}

	var positions []string
	for _, f := range frames {
		if !bytes.Contains(f.SVG, []byte("<svg")) {
			t.Errorf("frame %s is not a valid SVG", f.Name)
		}
		positions = append(positions, gatewayPosition(t, f.SVG))
	}
	for i, p := range positions {
		if p != positions[0] {
			t.Errorf("frame %s: Gateway position %s differs from frame %s's %s", frames[i].Name, p, frames[0].Name, positions[0])
		}
	}
}

func TestSVGStepsBranchArms(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "payment-processing.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}
	flow := &d.Flows[0] // 3 plain steps + a branch (then: 1, else: 2)

	frames, err := SVGSteps(d, flow, Options{})
	if err != nil {
		t.Fatalf("SVGSteps failed: %v", err)
	}
	wantNames := []string{"step-01", "step-02", "step-03", "step-04a", "step-04b"}
	if len(frames) != len(wantNames) {
		t.Fatalf("got %d frames, want %d", len(frames), len(wantNames))
	}
	for i, name := range wantNames {
		if frames[i].Name != name {
			t.Errorf("frame %d: got name %q, want %q", i, frames[i].Name, name)
		}
		if !bytes.Contains(frames[i].SVG, []byte("<svg")) {
			t.Errorf("frame %s is not a valid SVG", name)
		}
	}
}

func TestSVGAnimated(t *testing.T) {
	src := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")
	d, err := parser.Parse(src)
	if err != nil {
		t.Fatalf("Parse(%s) failed: %v", src, err)
	}
	flow := &d.Flows[0]

	out, err := SVGAnimated(d, flow, Options{})
	if err != nil {
		t.Fatalf("SVGAnimated failed: %v", err)
	}
	if !bytes.Contains(out, []byte("<svg")) {
		t.Error("output does not contain '<svg'")
	}
	if !bytes.Contains(out, []byte("@keyframes")) {
		t.Error("output does not contain a @keyframes animation")
	}
	if !bytes.Contains(out, []byte("animation:")) {
		t.Error("output does not apply the animation to any element")
	}

	dec := xml.NewDecoder(bytes.NewReader(out))
	for {
		_, err := dec.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatalf("output is not well-formed XML (would fail to open in a browser): %v", err)
		}
	}
}
