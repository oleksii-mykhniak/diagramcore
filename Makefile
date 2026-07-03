.PHONY: wasm wasm-test

# Builds the browser-facing validator (web/public/dc.wasm) and refreshes
# the Go-distributed JS glue it needs to run (web/public/wasm_exec.js).
wasm:
	GOOS=js GOARCH=wasm go build -o web/public/dc.wasm ./cmd/wasm
	cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" web/public/wasm_exec.js

wasm-test: wasm
	node web/scripts/test-wasm.cjs
