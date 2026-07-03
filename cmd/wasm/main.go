//go:build js && wasm

// Command wasm builds the browser-facing DiagramCore helpers: two
// exported JS global functions,
//
//	validate(yamlString) -> errors[]
//	context(yamlString) -> string (markdown)
//
// backed by internal/validate.ValidateString and internal/context.Generate
// respectively. Both intentionally have no filesystem access, so `details`
// sub-diagram references are not followed in this mode (there is nothing
// on disk to follow them to, and context() always runs non-deep) — only
// the single diagram's own content is used.
package main

import (
	"syscall/js"

	"github.com/oleksii94/diagramcore/internal/context"
	"github.com/oleksii94/diagramcore/internal/parser"
	"github.com/oleksii94/diagramcore/internal/validate"
)

func main() {
	js.Global().Set("validate", js.FuncOf(validateJS))
	js.Global().Set("context", js.FuncOf(contextJS))
	select {} // keep the wasm module alive for callbacks
}

func validateJS(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf([]interface{}{
			errorObject("", 0, "DCWASM", "validate(yamlString) requires one string argument"),
		})
	}

	yamlText := args[0].String()
	errs, err := validate.ValidateString(yamlText)
	if err != nil {
		return js.ValueOf([]interface{}{
			errorObject("", 0, "DCWASM", err.Error()),
		})
	}

	result := make([]interface{}, len(errs))
	for i, e := range errs {
		result[i] = errorObject(e.File, e.Line, e.Code, e.Message)
	}
	return js.ValueOf(result)
}

// contextJS generates the same AI-context markdown as `dc context <file>`
// (non-deep) for the diagram given as raw yaml text. Returns an empty
// string on any parse/generation error.
func contextJS(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return js.ValueOf("")
	}
	d, err := parser.ParseString([]byte(args[0].String()))
	if err != nil {
		return js.ValueOf("")
	}
	md, err := context.Generate(d, false)
	if err != nil {
		return js.ValueOf("")
	}
	return js.ValueOf(md)
}

func errorObject(file string, line int, code, message string) map[string]interface{} {
	return map[string]interface{}{
		"file":    file,
		"line":    line,
		"code":    code,
		"message": message,
	}
}
