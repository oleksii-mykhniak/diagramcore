package mcpserver

import (
	"context"
	"encoding/json"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// cliLintResult mirrors cmd/dc's unexported lintFileResult — only the
// fields this test needs.
type cliLintResult struct {
	File       string `json:"file"`
	OK         bool   `json:"ok"`
	Violations []struct {
		Code string `json:"Code"`
	} `json:"violations"`
}

// TestLintStyleAgreesWithCLI verifies the MCP `lint_style` tool and
// `dc lint --style` — both thin wrappers over the same
// internal/style.Load/Lint — report the same violation codes for the
// same file (PLAN.md step 9.3 AC).
func TestLintStyleAgreesWithCLI(t *testing.T) {
	relPath := filepath.Join("..", "style", "testdata", "violates.dc.yaml")
	path, err := filepath.Abs(relPath)
	if err != nil {
		t.Fatal(err)
	}

	session := testClient(t)
	res, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      "lint_style",
		Arguments: map[string]any{"path": path},
	})
	if err != nil {
		t.Fatalf("CallTool(lint_style): %v", err)
	}
	if res.IsError {
		t.Fatalf("lint_style returned IsError=true: %+v", res.Content)
	}
	var mcpOut lintStyleResult
	decodeStructured(t, res.StructuredContent, &mcpOut)

	cmd := exec.Command("go", "run", "./cmd/dc", "lint", "--style", "--json", path)
	cmd.Dir = filepath.Join("..", "..")
	out, err := cmd.Output()
	// `dc lint` exits 1 when there are violations — that's expected here,
	// not a test failure; only a missing/empty stdout is.
	if len(out) == 0 {
		t.Fatalf("dc lint --style produced no output (err: %v)", err)
	}

	var cliResults []cliLintResult
	if err := json.Unmarshal(out, &cliResults); err != nil {
		t.Fatalf("unmarshal CLI output: %v\n%s", err, out)
	}
	if len(cliResults) != 1 {
		t.Fatalf("expected exactly 1 CLI result, got %d: %+v\nraw: %s", len(cliResults), cliResults, out)
	}

	mcpCodes := map[string]bool{}
	for _, v := range mcpOut.Violations {
		mcpCodes[v.Code] = true
	}
	cliCodes := map[string]bool{}
	for _, v := range cliResults[0].Violations {
		cliCodes[v.Code] = true
	}
	if len(mcpCodes) == 0 {
		t.Fatal("expected at least one violation from the MCP tool")
	}
	for code := range mcpCodes {
		if !cliCodes[code] {
			t.Errorf("MCP reported %s but CLI did not; MCP=%v CLI=%v", code, mcpCodes, cliCodes)
		}
	}
	for code := range cliCodes {
		if !mcpCodes[code] {
			t.Errorf("CLI reported %s but MCP did not; MCP=%v CLI=%v", code, mcpCodes, cliCodes)
		}
	}
}
