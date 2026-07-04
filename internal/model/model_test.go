package model_test

import (
	"testing"

	"github.com/oleksii94/diagramcore/internal/parser"
)

func TestCustomTypesScalarForm(t *testing.T) {
	d, err := parser.ParseString([]byte(`
diagram:
  title: "T"
  custom_types: [cache, worker]
nodes:
  - id: A
    type: cache
links: []
`))
	if err != nil {
		t.Fatalf("ParseString: %v", err)
	}
	if len(d.Meta.CustomTypes) != 2 {
		t.Fatalf("expected 2 custom types, got %d", len(d.Meta.CustomTypes))
	}
	if d.Meta.CustomTypes[0].Name != "cache" || d.Meta.CustomTypes[1].Name != "worker" {
		t.Errorf("unexpected names: %+v", d.Meta.CustomTypes)
	}
	if d.Meta.CustomTypes[0].Shape != "" || d.Meta.CustomTypes[0].Color != "" || d.Meta.CustomTypes[0].Icon != "" {
		t.Errorf("scalar form should leave Shape/Color/Icon empty, got %+v", d.Meta.CustomTypes[0])
	}
}

func TestCustomTypesObjectForm(t *testing.T) {
	d, err := parser.ParseString([]byte(`
diagram:
  title: "T"
  custom_types:
    - name: cache
      shape: hexagon
      color: "#f5a623"
      icon: database
nodes:
  - id: A
    type: cache
links: []
`))
	if err != nil {
		t.Fatalf("ParseString: %v", err)
	}
	if len(d.Meta.CustomTypes) != 1 {
		t.Fatalf("expected 1 custom type, got %d", len(d.Meta.CustomTypes))
	}
	ct := d.Meta.CustomTypes[0]
	if ct.Name != "cache" || ct.Shape != "hexagon" || ct.Color != "#f5a623" || ct.Icon != "database" {
		t.Errorf("unexpected custom type: %+v", ct)
	}
}

func TestCustomTypesMixedForm(t *testing.T) {
	d, err := parser.ParseString([]byte(`
diagram:
  title: "T"
  custom_types:
    - plainName
    - name: styled
      shape: diamond
nodes:
  - id: A
    type: plainName
  - id: B
    type: styled
links: []
`))
	if err != nil {
		t.Fatalf("ParseString: %v", err)
	}
	if len(d.Meta.CustomTypes) != 2 {
		t.Fatalf("expected 2 custom types, got %d", len(d.Meta.CustomTypes))
	}
	if d.Meta.CustomTypes[0].Name != "plainName" {
		t.Errorf("expected first entry name plainName, got %q", d.Meta.CustomTypes[0].Name)
	}
	if d.Meta.CustomTypes[1].Name != "styled" || d.Meta.CustomTypes[1].Shape != "diamond" {
		t.Errorf("unexpected second entry: %+v", d.Meta.CustomTypes[1])
	}
}
