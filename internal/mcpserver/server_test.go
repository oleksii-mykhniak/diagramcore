package mcpserver

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func testClient(t *testing.T) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	clientTransport, serverTransport := mcp.NewInMemoryTransports()

	server := NewServer()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("server.Connect: %v", err)
	}
	t.Cleanup(func() { serverSession.Wait() })

	client := mcp.NewClient(&mcp.Implementation{Name: "test-client"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("client.Connect: %v", err)
	}
	t.Cleanup(func() { clientSession.Close() })
	return clientSession
}

func callTool(t *testing.T, session *mcp.ClientSession, name string, args map[string]any) validateDiagramResult {
	t.Helper()
	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("CallTool(%s): %v", name, err)
	}
	if res.IsError {
		t.Fatalf("CallTool(%s) returned IsError=true: %+v", name, res.Content)
	}
	var out validateDiagramResult
	decodeStructured(t, res.StructuredContent, &out)
	return out
}

// decodeStructured re-marshals whatever concrete type the transport
// decoded StructuredContent into (json.RawMessage over a real wire,
// map[string]any over the in-memory transport used in these tests) and
// unmarshals it into out.
func decodeStructured(t *testing.T, structured any, out any) {
	t.Helper()
	bytes, err := json.Marshal(structured)
	if err != nil {
		t.Fatalf("marshaling structured content: %v", err)
	}
	if err := json.Unmarshal(bytes, out); err != nil {
		t.Fatalf("unmarshaling structured content: %v", err)
	}
}

func TestValidateDiagramTool(t *testing.T) {
	session := testClient(t)

	t.Run("valid diagram has zero errors", func(t *testing.T) {
		out := callTool(t, session, "validate_diagram", map[string]any{
			"path": filepath.Join("..", "..", "examples", "auth-system.dc.yaml"),
		})
		if !out.OK || len(out.Errors) != 0 {
			t.Fatalf("expected ok=true with no errors, got %+v", out)
		}
	})

	t.Run("DC004 fixture reports the code and line", func(t *testing.T) {
		out := callTool(t, session, "validate_diagram", map[string]any{
			"path": filepath.Join("..", "validate", "testdata", "dc004_flow_no_link.dc.yaml"),
		})
		if out.OK {
			t.Fatalf("expected ok=false, got %+v", out)
		}
		found := false
		for _, e := range out.Errors {
			if e.Code == "DC004" {
				found = true
				if e.Line == 0 {
					t.Errorf("expected a non-zero line for DC004, got %+v", e)
				}
			}
		}
		if !found {
			t.Fatalf("expected a DC004 error, got %+v", out.Errors)
		}
	})
}

func TestGetContextTool(t *testing.T) {
	session := testClient(t)
	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "get_context",
		Arguments: map[string]any{"path": filepath.Join("..", "..", "examples", "auth-system.dc.yaml")},
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if res.IsError {
		t.Fatalf("IsError=true: %+v", res.Content)
	}
	var out getContextResult
	decodeStructured(t, res.StructuredContent, &out)
	if out.Markdown == "" {
		t.Fatal("expected non-empty markdown")
	}
}

func TestListDiagramsTool(t *testing.T) {
	session := testClient(t)
	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "list_diagrams",
		Arguments: map[string]any{"dir": filepath.Join("..", "..", "examples")},
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if res.IsError {
		t.Fatalf("IsError=true: %+v", res.Content)
	}
	var out listDiagramsResult
	decodeStructured(t, res.StructuredContent, &out)
	if len(out.Files) < 3 {
		t.Fatalf("expected at least 3 example diagrams, got %v", out.Files)
	}
}
