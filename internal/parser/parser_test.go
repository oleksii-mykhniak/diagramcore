package parser

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestParseExamples(t *testing.T) {
	cases := []struct {
		file      string
		nodes     int
		flowNames []string
	}{
		{"auth-system.dc.yaml", 5, []string{"Успішна авторизація через OAuth", "Пряма авторизація логін/пароль"}},
		{"oauth-detail.dc.yaml", 4, nil},
		{"payment-processing.dc.yaml", 6, []string{"Оплата з перевіркою на шахрайство"}},
	}

	for _, c := range cases {
		t.Run(c.file, func(t *testing.T) {
			path := filepath.Join("..", "..", "examples", c.file)
			d, err := Parse(path)
			if err != nil {
				t.Fatalf("Parse(%s) failed: %v", path, err)
			}
			if len(d.Nodes) != c.nodes {
				t.Errorf("got %d nodes, want %d", len(d.Nodes), c.nodes)
			}
			if !filepath.IsAbs(d.Path) {
				t.Errorf("Path %q is not absolute", d.Path)
			}
			if c.flowNames != nil {
				if len(d.Flows) != len(c.flowNames) {
					t.Fatalf("got %d flows, want %d", len(d.Flows), len(c.flowNames))
				}
				for i, name := range c.flowNames {
					if d.Flows[i].Name != name {
						t.Errorf("flow %d: got name %q, want %q", i, d.Flows[i].Name, name)
					}
				}
			}
		})
	}
}

func TestParseAuthSystemDetails(t *testing.T) {
	d, err := Parse(filepath.Join("..", "..", "examples", "auth-system.dc.yaml"))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	var found bool
	for _, n := range d.Nodes {
		if n.ID == "OAuthProvider" {
			found = true
			if n.Details != "./oauth-detail.dc.yaml" {
				t.Errorf("got details %q, want ./oauth-detail.dc.yaml", n.Details)
			}
		}
	}
	if !found {
		t.Fatal("OAuthProvider node not found")
	}
}

func TestParsePaymentProcessingBranch(t *testing.T) {
	d, err := Parse(filepath.Join("..", "..", "examples", "payment-processing.dc.yaml"))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	steps := d.Flows[0].Steps
	last := steps[len(steps)-1]
	if last.Branch == nil {
		t.Fatal("expected last step to be a branch")
	}
	if last.Branch.Condition == "" {
		t.Error("branch condition is empty")
	}
	if len(last.Branch.Then) == 0 {
		t.Error("branch.then is empty")
	}
	if len(last.Branch.Else) == 0 {
		t.Error("branch.else is empty")
	}
}

func TestParseSyntaxError(t *testing.T) {
	_, err := Parse(filepath.Join("testdata", "syntax_error.dc.yaml"))
	if err == nil {
		t.Fatal("expected a parse error, got nil")
	}
	if !strings.Contains(err.Error(), "line") {
		t.Errorf("expected error to mention a line number, got: %v", err)
	}
}

func TestParseNonexistentFile(t *testing.T) {
	_, err := Parse(filepath.Join("testdata", "does-not-exist.dc.yaml"))
	if err == nil {
		t.Fatal("expected an error for a nonexistent file")
	}
}
