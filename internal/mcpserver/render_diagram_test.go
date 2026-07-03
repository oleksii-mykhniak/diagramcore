package mcpserver

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestRenderDiagramReturnsNonEmptyImageContent(t *testing.T) {
	session := testClient(t)
	path := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")

	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "render_diagram",
		Arguments: map[string]any{"path": path},
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if res.IsError {
		t.Fatalf("IsError=true: %+v", res.Content)
	}
	if len(res.Content) != 1 {
		t.Fatalf("expected exactly 1 content block, got %d", len(res.Content))
	}
	img, ok := res.Content[0].(*mcp.ImageContent)
	if !ok {
		t.Fatalf("expected ImageContent, got %T", res.Content[0])
	}
	if len(img.Data) == 0 {
		t.Fatal("expected non-empty image data")
	}
	if img.MIMEType != "image/svg+xml" {
		t.Fatalf("expected image/svg+xml (no rsvg-convert expected in the test env), got %s", img.MIMEType)
	}
	if !bytes.Contains(img.Data, []byte("<svg")) {
		t.Fatalf("expected valid SVG content, got:\n%s", img.Data)
	}
}

func TestRenderDiagramWithFlowHighlightsDiffersFromBase(t *testing.T) {
	session := testClient(t)
	path := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")

	base, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "render_diagram",
		Arguments: map[string]any{"path": path},
	})
	if err != nil {
		t.Fatalf("CallTool (base): %v", err)
	}
	withFlow, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "render_diagram",
		Arguments: map[string]any{"path": path, "flow": "Успішна авторизація через OAuth"},
	})
	if err != nil {
		t.Fatalf("CallTool (with flow): %v", err)
	}
	if withFlow.IsError {
		t.Fatalf("IsError=true: %+v", withFlow.Content)
	}

	baseImg := base.Content[0].(*mcp.ImageContent)
	flowImg := withFlow.Content[0].(*mcp.ImageContent)
	if len(flowImg.Data) == 0 {
		t.Fatal("expected non-empty image data")
	}
	if bytes.Equal(baseImg.Data, flowImg.Data) {
		t.Fatal("expected the flow-highlighted render to differ from the base render")
	}
}

func TestRenderDiagramUnknownFlowIsAnError(t *testing.T) {
	session := testClient(t)
	path := filepath.Join("..", "..", "examples", "auth-system.dc.yaml")

	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "render_diagram",
		Arguments: map[string]any{"path": path, "flow": "no such flow"},
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if !res.IsError {
		t.Fatal("expected IsError=true for an unknown flow name")
	}
}
