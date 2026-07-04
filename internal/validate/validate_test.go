package validate

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestExamplesAreValid(t *testing.T) {
	for _, f := range []string{"auth-system.dc.yaml", "oauth-detail.dc.yaml", "payment-processing.dc.yaml"} {
		t.Run(f, func(t *testing.T) {
			path := filepath.Join("..", "..", "examples", f)
			errs, err := ValidateFile(path)
			if err != nil {
				t.Fatalf("ValidateFile(%s) failed: %v", path, err)
			}
			if len(errs) != 0 {
				t.Errorf("expected no validation errors, got: %v", errs)
			}
		})
	}
}

func TestInvalidFixtures(t *testing.T) {
	cases := []struct {
		file string
		code string
	}{
		{"dc001_duplicate_node_id.dc.yaml", "DC001"},
		{"dc002_link_bad_node.dc.yaml", "DC002"},
		{"dc003_unknown_node_type.dc.yaml", "DC003"},
		{"dc003_unknown_link_type.dc.yaml", "DC003"},
		{"dc004_flow_no_link.dc.yaml", "DC004"},
		{"dc005_flow_bad_node.dc.yaml", "DC005"},
		{"dc006_details_missing.dc.yaml", "DC006"},
		{"dc007_empty_flow.dc.yaml", "DC007"},
		{"dc008_branch_no_then.dc.yaml", "DC008"},
	}

	for _, c := range cases {
		t.Run(c.file, func(t *testing.T) {
			path := filepath.Join("testdata", c.file)
			errs, err := ValidateFile(path)
			if err != nil {
				t.Fatalf("ValidateFile(%s) failed: %v", path, err)
			}
			var found bool
			for _, e := range errs {
				if e.Code == c.code {
					found = true
				}
			}
			if !found {
				t.Errorf("expected an error with code %s, got: %v", c.code, errs)
			}
		})
	}
}

func TestTwoIndependentErrors(t *testing.T) {
	path := filepath.Join("testdata", "two_independent_errors.dc.yaml")
	errs, err := ValidateFile(path)
	if err != nil {
		t.Fatalf("ValidateFile failed: %v", err)
	}
	codes := map[string]int{}
	for _, e := range errs {
		codes[e.Code]++
	}
	if codes["DC001"] == 0 {
		t.Errorf("expected a DC001 error, got: %v", errs)
	}
	if codes["DC002"] == 0 {
		t.Errorf("expected a DC002 error, got: %v", errs)
	}
}

func TestCyclicDetailsTerminatesAndReportsOnce(t *testing.T) {
	path := filepath.Join("testdata", "cyclic_a.dc.yaml")

	done := make(chan struct{})
	var errs []Error
	var err error
	go func() {
		errs, err = ValidateFile(path)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("ValidateFile did not terminate on cyclic details (possible infinite recursion)")
	}

	if err != nil {
		t.Fatalf("ValidateFile failed: %v", err)
	}

	var dc002Count int
	for _, e := range errs {
		if e.Code == "DC002" {
			dc002Count++
		}
	}
	if dc002Count != 1 {
		t.Errorf("expected the DC002 error inside cyclic_b to be reported exactly once, got %d: %v", dc002Count, errs)
	}
}

func TestValidateStringValidDiagram(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "payment-processing.dc.yaml"))
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	errs, err := ValidateString(string(data))
	if err != nil {
		t.Fatalf("ValidateString failed: %v", err)
	}
	if len(errs) != 0 {
		t.Errorf("expected no errors, got: %v", errs)
	}
}

func TestValidateStringBrokenDiagram(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("testdata", "dc004_flow_no_link.dc.yaml"))
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	errs, err := ValidateString(string(data))
	if err != nil {
		t.Fatalf("ValidateString failed: %v", err)
	}
	var found bool
	for _, e := range errs {
		if e.Code == "DC004" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a DC004 error, got: %v", errs)
	}
}

func TestCustomTypesBothFormsSatisfyDC003(t *testing.T) {
	cases := []struct {
		name string
		yaml string
	}{
		{
			name: "scalar form",
			yaml: `
diagram:
  title: "T"
  custom_types: [cache]
nodes:
  - id: A
    type: cache
links: []
`,
		},
		{
			name: "object form",
			yaml: `
diagram:
  title: "T"
  custom_types:
    - name: cache
      shape: hexagon
      color: "#f5a623"
nodes:
  - id: A
    type: cache
links: []
`,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			errs, err := ValidateString(c.yaml)
			if err != nil {
				t.Fatalf("ValidateString failed: %v", err)
			}
			for _, e := range errs {
				if e.Code == "DC003" {
					t.Errorf("unexpected DC003 for a declared custom type: %v", errs)
				}
			}
		})
	}
}

func TestStyledCustomTypeFixtureIsValid(t *testing.T) {
	path := filepath.Join("..", "..", "testdata", "styled-custom-type.dc.yaml")
	errs, err := ValidateFile(path)
	if err != nil {
		t.Fatalf("ValidateFile(%s) failed: %v", path, err)
	}
	if len(errs) != 0 {
		t.Errorf("expected no validation errors, got: %v", errs)
	}
}
