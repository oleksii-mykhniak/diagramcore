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

### `edit_diagram`

Applies structured edit operations to a `*.dc.yaml` file on disk,
preserving comments and formatting (the Go counterpart of
`web/src/yamlPatch.ts`). Atomic: the whole batch is applied in memory,
validated, and only written to disk if validation passes — an operation
that would break validity (e.g. a link to a nonexistent node) leaves the
file untouched and returns the structured error(s) instead.

```json
{
  "path": "examples/auth-system.dc.yaml",
  "operations": [
    { "op": "add_node", "node": { "id": "Cache", "type": "storage" } },
    { "op": "add_link", "link": { "from": "AuthService", "to": "Cache", "type": "dataflow" } }
  ]
}
```

Supported `op` values: `add_node`, `update_node` (`id` + `patch`),
`remove_node` (`id`), `add_link`, `remove_link` (`from`+`to`[+`type`]),
`add_flow_step` (`flow_name`+`step`[+`target` for a branch's then/else
arm]), `remove_flow_step` (`flow_name`+`at_index`), `rename_node_id`
(`old_id`+`new_id`), and `set_position` (`id`+`position: {x,y}`) — the
only op that never touches the YAML: it writes the diagram's
`<name>.layout.json` sidecar instead, merged with whatever positions are
already there.

Returns `{ "ok": bool, "errors": [...] }` — same shape as
`validate_diagram`.

## Full-cycle example

1. Write a new `*.dc.yaml` file (structured edits: `edit_diagram`) or
   pick an existing one (`list_diagrams`).
2. `edit_diagram` — add/update/remove nodes, links, and flow steps.
   Rejected (invalid) edits leave the file untouched, so it's safe to
   retry with a fix.
3. `validate_diagram` — double-check after edits that didn't go through
   `edit_diagram` (e.g. manual file writes).
4. `get_context` — confirm the diagram reads as intended for an
   unfamiliar audience.
5. `render_diagram` (PLAN.md step 9.4, once implemented) — see the
   rendered result without a browser.
