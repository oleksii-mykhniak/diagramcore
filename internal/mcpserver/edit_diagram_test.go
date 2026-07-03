package mcpserver

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// tempDiagramCopy copies a fixture into a scratch dir so edit_diagram's
// writes don't touch the repo's real files, and returns its path.
func tempDiagramCopy(t *testing.T, text string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "diagram.dc.yaml")
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

const commentedFixture = `diagram:
  title: "T"
nodes:
  - id: A
    type: actor
  # keep me
  - id: B
    type: service
links:
  - from: A
    to: B
    type: request
`

func callEditDiagram(t *testing.T, session *mcp.ClientSession, path string, ops []map[string]any) editDiagramResult {
	t.Helper()
	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "edit_diagram",
		Arguments: map[string]any{"path": path, "operations": ops},
	})
	if err != nil {
		t.Fatalf("CallTool(edit_diagram): %v", err)
	}
	if res.IsError {
		t.Fatalf("edit_diagram returned IsError=true: %+v", res.Content)
	}
	var out editDiagramResult
	decodeStructured(t, res.StructuredContent, &out)
	return out
}

func TestEditDiagramAddNodeAndLinkPreservesComments(t *testing.T) {
	session := testClient(t)
	path := tempDiagramCopy(t, commentedFixture)

	out := callEditDiagram(t, session, path, []map[string]any{
		{"op": "add_node", "node": map[string]any{"id": "C", "type": "storage"}},
		{"op": "add_link", "link": map[string]any{"from": "A", "to": "C", "type": "dataflow"}},
	})
	if !out.OK {
		t.Fatalf("expected ok=true, got errors: %+v", out.Errors)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	written := string(data)
	if !strings.Contains(written, "# keep me") {
		t.Fatalf("expected the existing comment to survive:\n%s", written)
	}
	if !strings.Contains(written, "id: C") || !strings.Contains(written, "from: A\n    to: C") {
		t.Fatalf("expected the new node and link in the written file:\n%s", written)
	}
}

func TestEditDiagramInvalidOperationDoesNotWriteAndReturnsDC002(t *testing.T) {
	session := testClient(t)
	path := tempDiagramCopy(t, commentedFixture)
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	out := callEditDiagram(t, session, path, []map[string]any{
		{"op": "add_link", "link": map[string]any{"from": "A", "to": "NoSuchNode", "type": "request"}},
	})
	if out.OK {
		t.Fatalf("expected ok=false for a link to a nonexistent node, got %+v", out)
	}
	found := false
	for _, e := range out.Errors {
		if e.Code == "DC002" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a DC002 error, got %+v", out.Errors)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Fatalf("expected the file to be untouched after a failed edit\nbefore:\n%s\nafter:\n%s", before, after)
	}
}

func TestEditDiagramSetPositionOnlyTouchesLayoutFile(t *testing.T) {
	session := testClient(t)
	path := tempDiagramCopy(t, commentedFixture)
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	out := callEditDiagram(t, session, path, []map[string]any{
		{"op": "set_position", "id": "A", "position": map[string]any{"x": 12.5, "y": 30}},
	})
	if !out.OK {
		t.Fatalf("expected ok=true, got %+v", out.Errors)
	}

	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Fatalf("expected the core YAML to be untouched by set_position\nbefore:\n%s\nafter:\n%s", before, after)
	}

	layoutPath := strings.TrimSuffix(path, ".dc.yaml") + ".layout.json"
	layoutData, err := os.ReadFile(layoutPath)
	if err != nil {
		t.Fatalf("expected a layout file to be written: %v", err)
	}
	var layoutJSON map[string]any
	if err := json.Unmarshal(layoutData, &layoutJSON); err != nil {
		t.Fatal(err)
	}
	views := layoutJSON["views"].(map[string]any)
	def := views["default"].(map[string]any)
	positions := def["positions"].(map[string]any)
	a := positions["A"].(map[string]any)
	if a["x"] != 12.5 || a["y"] != 30.0 {
		t.Fatalf("unexpected position for A: %+v", a)
	}
}
