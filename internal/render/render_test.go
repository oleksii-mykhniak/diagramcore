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
