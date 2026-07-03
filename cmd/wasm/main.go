//go:build js && wasm

// Command wasm builds the browser-facing DiagramCore validator: a single
// exported JS global function, validate(yamlString) -> errors[], backed by
// internal/validate.ValidateString. It intentionally has no filesystem
// access, so `details` sub-diagram references are not followed in this
// mode (there is nothing on disk to follow them to) — only the single
// diagram's own structural/semantic rules are checked.
package main

import (
	"syscall/js"

	"github.com/oleksii94/diagramcore/internal/validate"
)

func main() {
	js.Global().Set("validate", js.FuncOf(validateJS))
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

func errorObject(file string, line int, code, message string) map[string]interface{} {
	return map[string]interface{}{
		"file":    file,
		"line":    line,
		"code":    code,
		"message": message,
	}
}
