package edit

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func readExample(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return string(data)
}

func decode(t *testing.T, text string) map[string]any {
	t.Helper()
	var out map[string]any
	if err := yaml.Unmarshal([]byte(text), &out); err != nil {
		t.Fatalf("decode result: %v\n%s", err, text)
	}
	return out
}

func nodes(t *testing.T, doc map[string]any) []map[string]any {
	t.Helper()
	raw, _ := doc["nodes"].([]any)
	out := make([]map[string]any, len(raw))
	for i, n := range raw {
		out[i], _ = n.(map[string]any)
	}
	return out
}

func TestApplyAddNode(t *testing.T) {
	text := readExample(t, "auth-system.dc.yaml")
	out, err := Apply(text, []Operation{{Op: "add_node", Node: &NodeSpec{ID: "Cache", Type: "storage"}}})
	if err != nil {
		t.Fatal(err)
	}
	doc := decode(t, out)
	found := false
	for _, n := range nodes(t, doc) {
		if n["id"] == "Cache" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected node Cache in result:\n%s", out)
	}
}

func TestApplyUpdateNode(t *testing.T) {
	text := readExample(t, "auth-system.dc.yaml")
	out, err := Apply(text, []Operation{{Op: "update_node", ID: "User", Patch: map[string]any{"label": "Кінцевий користувач"}}})
	if err != nil {
		t.Fatal(err)
	}
	doc := decode(t, out)
	for _, n := range nodes(t, doc) {
		if n["id"] == "User" {
			if n["label"] != "Кінцевий користувач" {
				t.Fatalf("expected updated label, got %v", n["label"])
			}
			return
		}
	}
	t.Fatal("User node not found")
}

func TestApplyRemoveNode(t *testing.T) {
	text := readExample(t, "auth-system.dc.yaml")
	out, err := Apply(text, []Operation{{Op: "remove_node", ID: "DB"}})
	if err != nil {
		t.Fatal(err)
	}
	doc := decode(t, out)
	for _, n := range nodes(t, doc) {
		if n["id"] == "DB" {
			t.Fatal("expected DB to be removed")
		}
	}
}

func TestApplyAddLink(t *testing.T) {
	text := readExample(t, "auth-system.dc.yaml")
	out, err := Apply(text, []Operation{{Op: "add_link", Link: &LinkSpec{From: "User", To: "DB", Type: "dataflow"}}})
	if err != nil {
		t.Fatal(err)
	}
	doc := decode(t, out)
	links, _ := doc["links"].([]any)
	found := false
	for _, l := range links {
		lm := l.(map[string]any)
		if lm["from"] == "User" && lm["to"] == "DB" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected new link, got:\n%s", out)
	}
}

func TestApplyRemoveLink(t *testing.T) {
	text := readExample(t, "auth-system.dc.yaml")
	out, err := Apply(text, []Operation{{Op: "remove_link", From: "AuthService", To: "DB"}})
	if err != nil {
		t.Fatal(err)
	}
	doc := decode(t, out)
	links, _ := doc["links"].([]any)
	for _, l := range links {
		lm := l.(map[string]any)
		if lm["from"] == "AuthService" && lm["to"] == "DB" {
			t.Fatal("expected link to be removed")
		}
	}
}

func flowByName(t *testing.T, doc map[string]any, name string) map[string]any {
	t.Helper()
	flows, _ := doc["flows"].([]any)
	for _, f := range flows {
		fm := f.(map[string]any)
		if fm["name"] == name {
			return fm
		}
	}
	t.Fatalf("flow %q not found", name)
	return nil
}

func TestApplyAddAndRemoveFlowStep(t *testing.T) {
	text := readExample(t, "auth-system.dc.yaml")
	const flowName = "Пряма авторизація логін/пароль"

	out, err := Apply(text, []Operation{
		{Op: "add_flow_step", FlowName: flowName, Step: &StepSpec{From: "AuthService", To: "OAuthProvider", Note: "extra"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	doc := decode(t, out)
	steps, _ := flowByName(t, doc, flowName)["steps"].([]any)
	last := steps[len(steps)-1].(map[string]any)
	if last["from"] != "AuthService" || last["to"] != "OAuthProvider" || last["note"] != "extra" {
		t.Fatalf("unexpected last step: %+v", last)
	}

	out2, err := Apply(text, []Operation{{Op: "remove_flow_step", FlowName: flowName, AtIndex: 0}})
	if err != nil {
		t.Fatal(err)
	}
	doc2 := decode(t, out2)
	steps2, _ := flowByName(t, doc2, flowName)["steps"].([]any)
	if len(steps2) != 3 {
		t.Fatalf("expected 3 steps after removal, got %d", len(steps2))
	}
	if steps2[0].(map[string]any)["from"] != "Gateway" {
		t.Fatalf("expected first step to now start at Gateway, got %+v", steps2[0])
	}
}

func TestApplyRenameNodeID(t *testing.T) {
	text := readExample(t, "payment-processing.dc.yaml")
	out, err := Apply(text, []Operation{{Op: "rename_node_id", OldID: "PaymentGateway", NewID: "Gateway2"}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(out, "PaymentGateway") {
		t.Fatalf("expected no remaining mentions of PaymentGateway:\n%s", out)
	}
	doc := decode(t, out)
	found := false
	for _, n := range nodes(t, doc) {
		if n["id"] == "Gateway2" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected renamed node Gateway2")
	}
}

func TestApplyPreservesCommentsAndFormatting(t *testing.T) {
	text := `diagram:
  title: "T" # title comment
nodes:
  - id: A
    type: actor
  # comment above B
  - id: B
    type: service
links:
  - from: A
    to: B
    type: request
`
	out, err := Apply(text, []Operation{
		{Op: "add_node", Node: &NodeSpec{ID: "C", Type: "storage"}},
		{Op: "remove_link", From: "A", To: "B"},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `diagram:
  title: "T" # title comment
nodes:
  - id: A
    type: actor
  # comment above B
  - id: B
    type: service
  - id: C
    type: storage
links: []
`
	if out != want {
		t.Fatalf("golden mismatch:\n--- got ---\n%s\n--- want ---\n%s", out, want)
	}
}

func TestApplyUnknownNodeReturnsError(t *testing.T) {
	text := readExample(t, "auth-system.dc.yaml")
	_, err := Apply(text, []Operation{{Op: "update_node", ID: "NoSuchNode", Patch: map[string]any{"label": "x"}}})
	if err == nil {
		t.Fatal("expected an error for an unknown node id")
	}
}
