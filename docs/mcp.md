# `dc mcp` — Model Context Protocol server

`dc mcp` runs a Model Context Protocol server over stdio (the official
[Go MCP SDK](https://github.com/modelcontextprotocol/go-sdk)), exposing
DiagramCore's validation and context-generation as tools an agent can
call directly, without shelling out to the CLI or writing files by hand.

## Connecting from Claude Code

```
go build -o dc ./cmd/dc
claude mcp add --scope local diagramcore -- "$(pwd)/dc" mcp
```

Verify with `claude mcp list` — `diagramcore` should show as `✔ Connected`.
(`--scope local` stores the entry per-project in `~/.claude.json`, not in
the repo.)

## Tools

### `validate_diagram`

Validates a `*.dc.yaml` diagram given either a file `path` or raw
`content` (mutually exclusive — set one). Mirrors `dc validate`, but for
a single diagram with no filesystem traversal of `details` references
when `content` is used (same constraint as the WASM validator).

Returns:

```json
{ "ok": true, "errors": [] }
```

or, on failure:

```json
{
  "ok": false,
  "errors": [
    { "file": "...", "line": 12, "code": "DC004", "message": "flow step X -> Y has no backing link" }
  ]
}
```

### `get_context`

Generates the AI-context markdown for a diagram file (`path`, `deep`
optional) — the same output as `dc context <file>` /
`dc context --deep <file>`.

### `list_diagrams`

Lists `*.dc.yaml` files under a directory, recursively.

## Full-cycle example

1. Write a new `*.dc.yaml` file (structured edits: see the `edit_diagram`
   tool, PLAN.md step 9.2, once implemented) or an existing one.
2. `validate_diagram` — fix any reported errors before proceeding.
3. `get_context` — confirm the diagram reads as intended for an
   unfamiliar audience.
4. `render_diagram` (PLAN.md step 9.4, once implemented) — see the
   rendered result without a browser.
