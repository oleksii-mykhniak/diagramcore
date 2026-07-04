package transpile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oleksii94/diagramcore/internal/parser"
)

func TestToMermaidGolden(t *testing.T) {
	examples := []string{"auth-system", "oauth-detail", "payment-processing", "nested"}

	for _, name := range examples {
		t.Run(name, func(t *testing.T) {
			src := filepath.Join("..", "..", "examples", name+".dc.yaml")
			d, err := parser.Parse(src)
			if err != nil {
				t.Fatalf("Parse(%s) failed: %v", src, err)
			}
			got := ToMermaid(d)

			if !strings.HasPrefix(got, "flowchart") {
				t.Errorf("output does not start with 'flowchart':\n%s", got)
			}
			for _, n := range d.Nodes {
				if !strings.Contains(got, n.ID) {
					t.Errorf("output missing node %q", n.ID)
				}
			}
			for _, l := range d.Links {
				if !strings.Contains(got, l.From) || !strings.Contains(got, l.To) {
					t.Errorf("output missing edge %s -> %s", l.From, l.To)
				}
			}

			golden := filepath.Join("testdata", "golden", name+".mmd")
			if *update {
				if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
					t.Fatalf("write golden file: %v", err)
				}
				return
			}
			want, err := os.ReadFile(golden)
			if err != nil {
				t.Fatalf("read golden file: %v (run `go test -update`)", err)
			}
			if got != string(want) {
				t.Errorf("Mermaid output for %s does not match golden file %s\n--- got ---\n%s\n--- want ---\n%s", name, golden, got, want)
			}
		})
	}
}
