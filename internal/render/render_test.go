package render

import (
	"bytes"
	"path/filepath"
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
