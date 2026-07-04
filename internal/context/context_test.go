package context

import (
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/oleksii94/diagramcore/internal/parser"
)

var update = flag.Bool("update", false, "update golden files")

func TestGenerateGolden(t *testing.T) {
	examples := []string{"auth-system", "oauth-detail", "payment-processing"}

	for _, name := range examples {
		t.Run(name, func(t *testing.T) {
			src := filepath.Join("..", "..", "examples", name+".dc.yaml")
			d, err := parser.Parse(src)
			if err != nil {
				t.Fatalf("Parse(%s) failed: %v", src, err)
			}
			got, err := Generate(d, false)
			if err != nil {
				t.Fatalf("Generate failed: %v", err)
			}

			golden := filepath.Join("testdata", "golden", name+".md")
			if *update {
				if err := os.WriteFile(golden, []byte(got), 0o644); err != nil {
					t.Fatalf("write golden file: %v", err)
				}
				return
			}

			want, err := os.ReadFile(golden)
			if err != nil {
				t.Fatalf("read golden file: %v (run `go test -update` to create it)", err)
			}
			if got != string(want) {
				t.Errorf("output for %s does not match golden file %s\n--- got ---\n%s\n--- want ---\n%s", name, golden, got, want)
			}
		})
	}
}

func TestGenerateAuthSystemContent(t *testing.T) {
	d, err := parser.Parse(filepath.Join("..", "..", "examples", "auth-system.dc.yaml"))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	got, err := Generate(d, false)
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}

	for _, id := range []string{"User", "Gateway", "AuthService", "OAuthProvider", "DB"} {
		if !strings.Contains(got, id) {
			t.Errorf("output missing node %q", id)
		}
	}
	for _, label := range []string{"HTTPS запит на вхід", "Делегує автентифікацію", "Запит на OAuth-автентифікацію", "Перевірка облікових даних"} {
		if !strings.Contains(got, label) {
			t.Errorf("output missing link label %q", label)
		}
	}
	for _, flow := range []string{"Успішна авторизація через OAuth", "Пряма авторизація логін/пароль"} {
		if !strings.Contains(got, flow) {
			t.Errorf("output missing flow %q", flow)
		}
	}
	if strings.Contains(got, "Ghost") {
		t.Error("output contains a node/link not present in the source")
	}
}

func TestGenerateDeepInlinesDetailsOnce(t *testing.T) {
	d, err := parser.Parse(filepath.Join("..", "..", "examples", "auth-system.dc.yaml"))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	got, err := Generate(d, true)
	if err != nil {
		t.Fatalf("Generate(deep) failed: %v", err)
	}
	if !strings.Contains(got, "Sub-diagram:") {
		t.Error("deep output should contain an inlined sub-diagram section")
	}
	// oauth-detail.dc.yaml nodes should appear in the inlined content.
	for _, id := range []string{"OAuthGateway", "ConsentScreen", "TokenIssuer", "TokenStore"} {
		if !strings.Contains(got, id) {
			t.Errorf("deep output missing inlined oauth-detail node %q", id)
		}
	}
}

func TestGenerateInvalidDiagramMissingRequiredNothingPanics(t *testing.T) {
	d, err := parser.Parse(filepath.Join("..", "..", "examples", "oauth-detail.dc.yaml"))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if _, err := Generate(d, false); err != nil {
		t.Fatalf("Generate failed: %v", err)
	}
}

func TestGenerateIncludesNotes(t *testing.T) {
	d, err := parser.ParseString([]byte(`
diagram:
  title: "T"
nodes:
  - id: A
    type: component
links: []
notes:
  - id: note1
    text: "Trigger refresh"
    target: A
  - id: note2
    text: "Freestanding note"
`))
	if err != nil {
		t.Fatalf("ParseString failed: %v", err)
	}
	got, err := Generate(d, false)
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}
	if !strings.Contains(got, "### Notes") {
		t.Errorf("expected a Notes section, got:\n%s", got)
	}
	if !strings.Contains(got, "Trigger refresh") || !strings.Contains(got, "Freestanding note") {
		t.Errorf("expected both notes' text, got:\n%s", got)
	}
}
