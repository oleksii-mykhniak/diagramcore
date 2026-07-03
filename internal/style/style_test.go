package style

import (
	"path/filepath"
	"testing"

	"github.com/oleksii94/diagramcore/internal/parser"
)

func TestLintFindsAtLeastThreeViolations(t *testing.T) {
	cfg, err := Load(filepath.Join("testdata", FileName))
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil {
		t.Fatal("expected a loaded style config")
	}
	d, err := parser.Parse(filepath.Join("testdata", "violates.dc.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	violations := Lint(d, cfg)
	if len(violations) < 3 {
		t.Fatalf("expected at least 3 violations, got %d: %+v", len(violations), violations)
	}
	codes := map[string]bool{}
	for _, v := range violations {
		codes[v.Code] = true
	}
	for _, want := range []string{"DS001", "DS002", "DS003", "DS004"} {
		if !codes[want] {
			t.Errorf("expected a %s violation, got codes %v", want, codes)
		}
	}
}

func TestLintConformingDiagramHasNoViolations(t *testing.T) {
	cfg, err := Load(filepath.Join("testdata", FileName))
	if err != nil {
		t.Fatal(err)
	}
	d, err := parser.Parse(filepath.Join("testdata", "conforming.dc.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	violations := Lint(d, cfg)
	if len(violations) != 0 {
		t.Fatalf("expected 0 violations, got %+v", violations)
	}
}

func TestLoadMissingStyleFileIsNotAnError(t *testing.T) {
	cfg, err := Load(filepath.Join("testdata", "does-not-exist.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if cfg != nil {
		t.Fatalf("expected nil config for a missing file, got %+v", cfg)
	}
}

func TestLintWithNilConfigHasNoViolations(t *testing.T) {
	d, err := parser.Parse(filepath.Join("testdata", "violates.dc.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if got := Lint(d, nil); got != nil {
		t.Fatalf("expected no violations with a nil config, got %+v", got)
	}
}

func TestExamplesConformToTheirOwnStyleGuide(t *testing.T) {
	cfg, err := Load(filepath.Join("..", "..", "examples", FileName))
	if err != nil {
		t.Fatal(err)
	}
	if cfg == nil {
		t.Fatal("expected examples/dc-style.yaml to exist and load")
	}
	for _, name := range []string{"auth-system.dc.yaml", "oauth-detail.dc.yaml", "payment-processing.dc.yaml"} {
		d, err := parser.Parse(filepath.Join("..", "..", "examples", name))
		if err != nil {
			t.Fatal(err)
		}
		if violations := Lint(d, cfg); len(violations) != 0 {
			t.Errorf("%s: expected 0 violations against examples/dc-style.yaml, got %+v", name, violations)
		}
	}
}
